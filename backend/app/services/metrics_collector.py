"""In-memory metrics collector for API and LLM monitoring.

Uses a ring buffer of data points. Persists to PostgreSQL on shutdown
and reloads on startup so metrics survive restarts.
"""
import json
import logging
import time
import threading
from collections import defaultdict, deque
from dataclasses import dataclass, field, asdict
from typing import Any

logger = logging.getLogger(__name__)

# Metric type name → dataclass mapping (used by load)
_METRIC_CLASSES: dict[str, type] = {}


@dataclass
class ApiMetric:
    path: str
    method: str
    status_code: int
    duration_ms: float
    timestamp: float = field(default_factory=time.time)


@dataclass
class EmbeddingMetric:
    model: str
    text_count: int
    duration_ms: float
    success: bool
    timestamp: float = field(default_factory=time.time)


@dataclass
class LLMMetric:
    model: str
    prompt_tokens: int
    completion_tokens: int
    duration_ms: float
    success: bool
    timestamp: float = field(default_factory=time.time)


@dataclass
class ChatMetric:
    """End-to-end chat UX metrics for a single conversation turn."""
    ttft_ms: float            # Time to first token (user-perceived)
    total_ms: float           # Total response time
    llm_ttft_ms: float        # LLM first token latency
    completion_tokens: int
    token_throughput: float    # tokens/s
    recall_ms: float           # Memory recall latency
    success: bool
    timestamp: float = field(default_factory=time.time)


@dataclass
class ExtractionMetric:
    """Memory extraction metrics from NeuroMemory on_extraction callback."""
    user_id: str
    duration_s: float          # Extraction duration in seconds
    facts_extracted: int
    episodes_extracted: int
    triples_extracted: int
    messages_processed: int
    timestamp: float = field(default_factory=time.time)


_METRIC_CLASSES = {
    "api": ApiMetric,
    "llm": LLMMetric,
    "embedding": EmbeddingMetric,
    "chat": ChatMetric,
    "extraction": ExtractionMetric,
}


class MetricsCollector:
    """Singleton in-memory metrics store with DB persistence."""

    _instance = None
    _lock = threading.Lock()
    MAX_POINTS = 100_000  # ~24h at moderate traffic

    def __new__(cls):
        with cls._lock:
            if cls._instance is None:
                cls._instance = super().__new__(cls)
                cls._instance._api_metrics = deque(maxlen=cls.MAX_POINTS)
                cls._instance._llm_metrics = deque(maxlen=cls.MAX_POINTS)
                cls._instance._embedding_metrics = deque(maxlen=cls.MAX_POINTS)
                cls._instance._chat_metrics = deque(maxlen=cls.MAX_POINTS)
                cls._instance._extraction_metrics = deque(maxlen=cls.MAX_POINTS)
                cls._instance._start_time = time.time()
            return cls._instance

    def record_api(self, path: str, method: str, status_code: int, duration_ms: float):
        self._api_metrics.append(ApiMetric(path, method, status_code, duration_ms))

    def record_llm(self, model: str, prompt_tokens: int, completion_tokens: int,
                   duration_ms: float, success: bool):
        self._llm_metrics.append(LLMMetric(model, prompt_tokens, completion_tokens,
                                            duration_ms, success))

    def record_embedding(self, model: str, text_count: int, duration_ms: float, success: bool):
        self._embedding_metrics.append(EmbeddingMetric(model, text_count, duration_ms, success))

    def get_uptime(self) -> float:
        return time.time() - self._start_time

    def get_api_stats(self, last_seconds: int = 86400) -> dict:
        """Get API performance stats for the given time window."""
        cutoff = time.time() - last_seconds
        recent = [m for m in self._api_metrics if m.timestamp > cutoff]

        if not recent:
            return {"total_requests": 0, "endpoints": {}}

        by_endpoint: dict[str, list[float]] = defaultdict(list)
        for m in recent:
            key = f"{m.method} {m.path}"
            by_endpoint[key].append(m.duration_ms)

        endpoints = {}
        for key, durations in sorted(by_endpoint.items(), key=lambda x: -len(x[1])):
            sorted_d = sorted(durations)
            p95_idx = int(len(sorted_d) * 0.95)
            endpoints[key] = {
                "count": len(durations),
                "avg_ms": round(sum(durations) / len(durations), 1),
                "p95_ms": round(sorted_d[min(p95_idx, len(sorted_d) - 1)], 1),
            }

        error_count = sum(1 for m in recent if m.status_code >= 400)

        return {
            "total_requests": len(recent),
            "error_count": error_count,
            "endpoints": endpoints,
        }

    def get_llm_stats(self, last_seconds: int = 86400) -> dict:
        """Get LLM call stats for the given time window."""
        cutoff = time.time() - last_seconds
        recent = [m for m in self._llm_metrics if m.timestamp > cutoff]

        if not recent:
            return {"total_calls": 0, "total_prompt_tokens": 0,
                    "total_completion_tokens": 0, "avg_duration_ms": 0,
                    "failure_rate": 0}

        total_prompt = sum(m.prompt_tokens for m in recent)
        total_completion = sum(m.completion_tokens for m in recent)
        avg_duration = sum(m.duration_ms for m in recent) / len(recent)
        failures = sum(1 for m in recent if not m.success)

        # Today's calls
        today_start = time.time() - (time.time() % 86400)
        today_calls = sum(1 for m in recent if m.timestamp > today_start)

        return {
            "total_calls": len(recent),
            "today_calls": today_calls,
            "total_prompt_tokens": total_prompt,
            "total_completion_tokens": total_completion,
            "avg_duration_ms": round(avg_duration, 1),
            "failure_rate": round(failures / len(recent), 4) if recent else 0,
        }

    def record_chat(self, ttft_ms: float, total_ms: float, llm_ttft_ms: float,
                    completion_tokens: int, token_throughput: float,
                    recall_ms: float, success: bool):
        self._chat_metrics.append(ChatMetric(
            ttft_ms=ttft_ms, total_ms=total_ms, llm_ttft_ms=llm_ttft_ms,
            completion_tokens=completion_tokens, token_throughput=token_throughput,
            recall_ms=recall_ms, success=success,
        ))

    def get_chat_stats(self, last_seconds: int = 86400) -> dict:
        """Get chat UX stats (TTFT, total time, throughput, etc.)."""
        cutoff = time.time() - last_seconds
        recent = [m for m in self._chat_metrics if m.timestamp > cutoff]

        if not recent:
            return {"total_chats": 0}

        def _percentile(values: list[float], p: float) -> float:
            s = sorted(values)
            idx = int(len(s) * p)
            return round(s[min(idx, len(s) - 1)], 1)

        ttfts = [m.ttft_ms for m in recent if m.success]
        totals = [m.total_ms for m in recent if m.success]
        llm_ttfts = [m.llm_ttft_ms for m in recent if m.success]
        throughputs = [m.token_throughput for m in recent if m.success and m.token_throughput > 0]
        recalls = [m.recall_ms for m in recent if m.success]

        today_start = time.time() - (time.time() % 86400)
        today_chats = sum(1 for m in recent if m.timestamp > today_start)

        return {
            "total_chats": len(recent),
            "today_chats": today_chats,
            "success_count": sum(1 for m in recent if m.success),
            "ttft_avg_ms": round(sum(ttfts) / len(ttfts), 1) if ttfts else 0,
            "ttft_p95_ms": _percentile(ttfts, 0.95) if ttfts else 0,
            "total_avg_ms": round(sum(totals) / len(totals), 1) if totals else 0,
            "total_p95_ms": _percentile(totals, 0.95) if totals else 0,
            "llm_ttft_avg_ms": round(sum(llm_ttfts) / len(llm_ttfts), 1) if llm_ttfts else 0,
            "llm_ttft_p95_ms": _percentile(llm_ttfts, 0.95) if llm_ttfts else 0,
            "throughput_avg": round(sum(throughputs) / len(throughputs), 1) if throughputs else 0,
            "recall_avg_ms": round(sum(recalls) / len(recalls), 1) if recalls else 0,
        }

    def record_extraction(self, user_id: str, duration_s: float,
                          facts_extracted: int, episodes_extracted: int,
                          triples_extracted: int, messages_processed: int):
        self._extraction_metrics.append(ExtractionMetric(
            user_id=user_id, duration_s=duration_s,
            facts_extracted=facts_extracted, episodes_extracted=episodes_extracted,
            triples_extracted=triples_extracted, messages_processed=messages_processed,
        ))

    def get_extraction_stats(self, last_seconds: int = 86400) -> dict:
        """Get memory extraction stats."""
        cutoff = time.time() - last_seconds
        recent = [m for m in self._extraction_metrics if m.timestamp > cutoff]

        if not recent:
            return {"total_extractions": 0}

        durations = [m.duration_s for m in recent]
        sorted_d = sorted(durations)
        p95_idx = int(len(sorted_d) * 0.95)

        today_start = time.time() - (time.time() % 86400)
        today_count = sum(1 for m in recent if m.timestamp > today_start)

        return {
            "total_extractions": len(recent),
            "today_extractions": today_count,
            "avg_duration_s": round(sum(durations) / len(durations), 2),
            "p95_duration_s": round(sorted_d[min(p95_idx, len(sorted_d) - 1)], 2),
            "total_facts": sum(m.facts_extracted for m in recent),
            "total_episodes": sum(m.episodes_extracted for m in recent),
            "total_triples": sum(m.triples_extracted for m in recent),
            "total_messages_processed": sum(m.messages_processed for m in recent),
        }

    def get_embedding_stats(self, last_seconds: int = 86400) -> dict:
        """Get Embedding call stats for the given time window."""
        cutoff = time.time() - last_seconds
        recent = [m for m in self._embedding_metrics if m.timestamp > cutoff]

        if not recent:
            return {"total_calls": 0, "total_texts": 0, "avg_duration_ms": 0,
                    "failure_rate": 0}

        total_texts = sum(m.text_count for m in recent)
        avg_duration = sum(m.duration_ms for m in recent) / len(recent)
        failures = sum(1 for m in recent if not m.success)

        today_start = time.time() - (time.time() % 86400)
        today_calls = sum(1 for m in recent if m.timestamp > today_start)

        return {
            "total_calls": len(recent),
            "today_calls": today_calls,
            "total_texts": total_texts,
            "avg_duration_ms": round(avg_duration, 1),
            "failure_rate": round(failures / len(recent), 4) if recent else 0,
        }

    # ---- Persistence ----

    def _serialize(self) -> dict[str, Any]:
        """Serialize all metric deques to a JSON-safe dict."""
        return {
            "api": [asdict(m) for m in self._api_metrics],
            "llm": [asdict(m) for m in self._llm_metrics],
            "embedding": [asdict(m) for m in self._embedding_metrics],
            "chat": [asdict(m) for m in self._chat_metrics],
            "extraction": [asdict(m) for m in self._extraction_metrics],
            "start_time": self._start_time,
        }

    def _deserialize(self, data: dict[str, Any]):
        """Load metrics from a deserialized dict, merging with existing."""
        mapping = {
            "api": self._api_metrics,
            "llm": self._llm_metrics,
            "embedding": self._embedding_metrics,
            "chat": self._chat_metrics,
            "extraction": self._extraction_metrics,
        }
        for key, dq in mapping.items():
            cls = _METRIC_CLASSES.get(key)
            for item in data.get(key, []):
                if cls:
                    dq.append(cls(**item))
        # Restore original start_time so uptime is cumulative
        saved_start = data.get("start_time")
        if saved_start and saved_start < self._start_time:
            self._start_time = saved_start

    async def save_to_db(self):
        """Persist current metrics to PostgreSQL."""
        from app.db.database import AsyncSessionLocal
        from sqlalchemy import text

        payload = json.dumps(self._serialize())
        total = sum(
            len(dq) for dq in [
                self._api_metrics, self._llm_metrics, self._embedding_metrics,
                self._chat_metrics, self._extraction_metrics,
            ]
        )
        try:
            async with AsyncSessionLocal() as session:
                await session.execute(text(
                    "INSERT INTO metrics_snapshots (id, data, saved_at) "
                    "VALUES (1, :data, NOW()) "
                    "ON CONFLICT (id) DO UPDATE SET data = :data, saved_at = NOW()"
                ), {"data": payload})
                await session.commit()
            logger.info("📊 指标已保存到数据库 (%d 条记录)", total)
        except Exception as e:
            logger.warning("⚠️  保存指标失败: %s", e)

    async def load_from_db(self):
        """Load persisted metrics from PostgreSQL."""
        from app.db.database import AsyncSessionLocal
        from sqlalchemy import text

        try:
            async with AsyncSessionLocal() as session:
                result = await session.execute(text(
                    "SELECT data FROM metrics_snapshots WHERE id = 1"
                ))
                row = result.scalar_one_or_none()
                if row is None:
                    logger.info("📊 无历史指标数据")
                    return
                data = json.loads(row) if isinstance(row, str) else row
                self._deserialize(data)
                total = sum(
                    len(dq) for dq in [
                        self._api_metrics, self._llm_metrics, self._embedding_metrics,
                        self._chat_metrics, self._extraction_metrics,
                    ]
                )
                logger.info("📊 已从数据库恢复指标 (%d 条记录)", total)
        except Exception as e:
            logger.warning("⚠️  加载指标失败: %s", e)

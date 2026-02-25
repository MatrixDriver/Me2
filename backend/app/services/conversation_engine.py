"""对话引擎 - 基于 NeuroMemory v0.6 的温暖陪伴式聊天"""
import asyncio
import logging
import time
from typing import Dict, Any
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.services.llm_client import LLMClient
from app.services.metrics_collector import MetricsCollector
from app.db.models import Message, Session

logger = logging.getLogger(__name__)


class ConversationEngine:
    """对话引擎 - Me2 高层对话逻辑"""

    def __init__(self):
        """初始化对话引擎"""
        self.llm = LLMClient()

    async def _recall_memories(self, nm, user_id: str, message: str, timings: dict | None = None):
        """统一的记忆召回逻辑（非流式和流式共用）

        使用 nm.recall() 公开 API，内容增强（情景记忆时间前缀、情感标签）
        和图谱增强由 NeuroMemory 内部完成。
        """
        t0 = time.time()
        result = await nm.recall(user_id=user_id, query=message, limit=20)
        recall_duration = time.time() - t0

        merged = result.get("merged", [])
        graph_context = result.get("graph_context", [])
        user_profile = result.get("user_profile", {})

        if timings is not None:
            timings['recall_detail'] = {
                'total': recall_duration,
                'vector_count': len(result.get("vector_results", [])),
                'graph_count': len(result.get("graph_results", [])),
            }

        return merged, graph_context, user_profile

    async def chat(
        self,
        user_id: str,
        session_id: str,
        message: str,
        db: AsyncSession,
        debug_mode: bool = False
    ) -> Dict[str, Any]:
        """处理对话 - 温暖、懂用户的回复"""
        try:
            timings = {}
            start_time = time.time()

            from app.main import nm

            # === 1. 获取历史消息 ===
            step_start = time.time()
            stmt = select(Message).where(
                Message.session_id == session_id
            ).order_by(Message.created_at.asc()).limit(20)
            result = await db.execute(stmt)
            history = result.scalars().all()
            timings['fetch_history'] = time.time() - step_start

            history_messages = [
                {"role": msg.role, "content": msg.content}
                for msg in history
            ]
            logger.info(f"获取历史消息: {len(history_messages)} 条")

            # === 2. 保存用户消息 ===
            step_start = time.time()
            user_msg = Message(
                session_id=session_id,
                user_id=user_id,
                role="user",
                content=message
            )
            db.add(user_msg)
            await db.flush()
            timings['save_user_message'] = time.time() - step_start

            # === 3. 召回记忆（一次 recall 获取所有上下文）===
            step_start = time.time()
            memories, graph_context, user_profile = await self._recall_memories(
                nm, user_id, message, timings=timings
            )
            timings['recall_memories'] = time.time() - step_start
            logger.info(f"召回 {len(memories)} 条记忆 + {len(graph_context)} 条图谱")

            # === 4. 构建 system prompt（按类型分层）===
            step_start = time.time()
            system_prompt = self._build_prompt(memories, graph_context, user_profile)
            timings['build_prompt'] = time.time() - step_start

            # === 5. 调用 LLM ===
            step_start = time.time()
            llm_result = await self.llm.generate(
                prompt=message,
                system_prompt=system_prompt,
                history_messages=history_messages,
                temperature=0.8,
                max_tokens=500,
                return_debug_info=debug_mode
            )
            timings['llm_generate'] = time.time() - step_start

            if debug_mode and isinstance(llm_result, dict):
                response = llm_result["response"]
                debug_info = llm_result["debug_info"]
            else:
                response = llm_result
                debug_info = None

            # === 6. 保存 AI 回复 ===
            step_start = time.time()
            ai_msg = Message(
                session_id=session_id,
                user_id=user_id,
                role="assistant",
                content=response,
                system_prompt=system_prompt,
                recalled_memories=[{
                    "content": m["content"],
                    "score": m.get("score", 0),
                    "memory_type": m.get("memory_type", ""),
                    "created_at": m.get("created_at").isoformat() if m.get("created_at") else None,
                    "metadata": m.get("metadata", {})
                } for m in memories],
                meta={
                    "memories_count": len(memories),
                    "temperature": 0.8,
                    "max_tokens": 500,
                    "model": "deepseek-chat",
                    "history_messages_count": len(history_messages),
                    "timings": timings
                }
            )
            db.add(ai_msg)

            from sqlalchemy.sql import func
            stmt_session = select(Session).where(Session.id == session_id)
            result_session = await db.execute(stmt_session)
            session = result_session.scalar_one_or_none()
            if session:
                session.last_active_at = func.now()

            await db.commit()
            timings['save_to_db'] = time.time() - step_start

            # === 7. 异步同步到 NeuroMemory（不阻塞响应）===
            async def _sync_neuromemory():
                try:
                    await nm.conversations.add_message(
                        user_id=user_id,
                        role="user",
                        content=message
                    )
                except Exception as e:
                    logger.error(f"NeuroMemory 同步失败: {e}", exc_info=True)
            asyncio.create_task(_sync_neuromemory())
            timings['sync_neuromemory'] = 0  # 异步执行，不计入响应时间

            timings['total'] = time.time() - start_time
            logger.info(f"对话处理完成: 总耗时: {timings['total']:.3f}s")

            result = {
                "response": response,
                "memories_recalled": len(memories),
                "insights_used": 0,
                "history_messages_count": len(history_messages)
            }

            if debug_mode and debug_info:
                debug_info["timings"] = timings
                result["debug_info"] = debug_info

            return result

        except Exception as e:
            logger.error(f"对话处理失败: {e}", exc_info=True)
            await db.rollback()
            return {
                "response": "抱歉，我遇到了一些问题，请稍后再试。",
                "error": str(e)
            }

    def _build_prompt(
        self,
        memories: list[dict],
        graph_context: list[str] | None = None,
        user_profile: dict | None = None,
    ) -> str:
        """按 NeuroMemory 最佳实践组装 system prompt

        核心原则：
        - recall() 的 merged 已按综合评分排序（RRF + 时间衰减 + 重要度 + 图谱增强）
        - 按类型分层注入：fact → episodic → insight → graph → others
        - profile 始终注入
        """
        # 1. 用户画像
        profile_lines = []
        if user_profile:
            label_map = {
                "identity": "身份", "occupation": "职业",
                "interests": "兴趣", "preferences": "偏好",
                "values": "价值观", "relationships": "关系",
                "personality": "性格",
            }
            for key, value in user_profile.items():
                label = label_map.get(key, key)
                if isinstance(value, list):
                    profile_lines.append(f"- {label}: {', '.join(str(v) for v in value)}")
                else:
                    profile_lines.append(f"- {label}: {value}")
        profile_text = "\n".join(profile_lines) if profile_lines else "暂无"

        # 2. merged 按类型分层（merged 已按 score 排序）
        facts = [m for m in memories if m.get("memory_type") == "fact"][:5]
        episodes = [m for m in memories if m.get("memory_type") == "episodic"][:5]
        insights = [m for m in memories if m.get("memory_type") == "insight"][:3]
        graph_facts = [m for m in memories if m.get("source") == "graph"][:5]
        others = [m for m in memories
                  if m.get("memory_type") not in ("fact", "episodic", "insight")
                  and m.get("source") != "graph"][:3]

        def fmt(items: list[dict]) -> str:
            lines = []
            for m in items:
                lines.append(f"- {m['content']}")
            return "\n".join(lines) if lines else "暂无"

        # 3. 图谱关系（三元组补充）
        graph_lines = (graph_context or [])[:5]
        # 合并 graph_facts 中的内容
        for m in graph_facts:
            content = m.get("content", "")
            if content and content not in graph_lines:
                graph_lines.append(content)
        graph_text = "\n".join(f"- {g}" for g in graph_lines[:8]) if graph_lines else "暂无"

        # 4. 情感上下文
        emotional_hint = self._extract_emotional_context(memories)

        return f"""你是一个温暖、懂 ta 的朋友。

## 用户画像
{profile_text}

## 关于当前话题，你记得的事实
{fmt(facts)}

## 相关经历和情景（注意时间信息）
{fmt(episodes)}

## 对用户的深层理解（洞察）
{fmt(insights)}

## 结构化关系
{graph_text}

## 其他相关记忆
{fmt(others)}
{emotional_hint}

---
请根据以上记忆自然地回应用户。像真正了解 ta 的朋友那样对话，不要逐条引用记忆。
如果 ta 情绪低落，给予温暖的支持；如果 ta 分享开心的事，真诚地为 ta 高兴。
回复简洁自然，可以适当使用表情符号。如果记忆与当前问题不相关，忽略它们即可。"""

    def _extract_emotional_context(self, memories: list[dict]) -> str:
        """提取情感上下文"""
        emotions = []
        for m in memories:
            meta = m.get("metadata", {})
            if isinstance(meta, dict) and "emotion" in meta and meta["emotion"]:
                emotions.append(meta["emotion"])

        if not emotions:
            return ""

        valences = [e.get("valence", 0) for e in emotions if isinstance(e.get("valence"), (int, float))]
        if not valences:
            return ""

        avg_valence = sum(valences) / len(valences)
        if avg_valence < -0.3:
            return "\n**注意**: ta 最近情绪似乎有些低落，请给予关心和支持。"
        elif avg_valence > 0.3:
            return "\n**注意**: ta 最近心情不错，可以分享 ta 的快乐。"
        return ""

    async def chat_stream(
        self,
        user_id: str,
        session_id: str,
        message: str,
        db: AsyncSession,
        debug_mode: bool = False
    ):
        """流式对话处理"""
        try:
            from app.main import nm

            timings = {}
            start_time = time.time()

            # === 1. 获取历史 ===
            step_start = time.time()
            stmt = select(Message).where(
                Message.session_id == session_id
            ).order_by(Message.created_at.asc()).limit(20)
            result = await db.execute(stmt)
            history = result.scalars().all()
            timings['fetch_history'] = time.time() - step_start

            history_messages = [
                {"role": msg.role, "content": msg.content}
                for msg in history
            ]

            # === 2. 保存用户消息 ===
            step_start = time.time()
            user_msg = Message(
                session_id=session_id,
                user_id=user_id,
                role="user",
                content=message
            )
            db.add(user_msg)
            await db.flush()
            timings['save_user_message'] = time.time() - step_start

            # === 3. 召回记忆（一次 recall）===
            step_start = time.time()
            try:
                memories, graph_context, user_profile = await self._recall_memories(
                    nm, user_id, message, timings=timings
                )
            except Exception as e:
                logger.warning(f"记忆召回失败: {e}")
                memories = []
                graph_context = []
                user_profile = {}
            timings['recall_memories'] = time.time() - step_start

            # === 4. 构建 prompt ===
            step_start = time.time()
            system_prompt = self._build_prompt(memories, graph_context, user_profile)
            timings['build_prompt'] = time.time() - step_start

            # === 5. 流式 LLM ===
            step_start = time.time()
            stream_generator = await self.llm.generate(
                prompt=message,
                system_prompt=system_prompt,
                history_messages=history_messages,
                temperature=0.8,
                max_tokens=500,
                stream=True
            )

            full_response = ""
            first_token_time = None
            llm_done_info = {}
            async for chunk in stream_generator:
                if isinstance(chunk, dict) and chunk.get("done"):
                    llm_done_info = chunk
                    break
                else:
                    if first_token_time is None:
                        first_token_time = time.time()
                    full_response += chunk
                    yield chunk

            timings['llm_generate'] = time.time() - step_start

            # === 6. 保存和同步 ===
            step_start = time.time()
            ai_msg = Message(
                session_id=session_id,
                user_id=user_id,
                role="assistant",
                content=full_response,
                system_prompt=system_prompt,
                recalled_memories=[{
                    "content": m["content"],
                    "score": m.get("score", 0),
                    "memory_type": m.get("memory_type", ""),
                    "created_at": m.get("created_at").isoformat() if m.get("created_at") else None,
                    "metadata": m.get("metadata", {})
                } for m in memories],
                meta={
                    "memories_count": len(memories),
                    "temperature": 0.8,
                    "max_tokens": 500,
                    "model": "deepseek-chat",
                    "history_messages_count": len(history_messages),
                    "timings": timings
                }
            )
            db.add(ai_msg)

            from sqlalchemy.sql import func
            stmt_session = select(Session).where(Session.id == session_id)
            result_session = await db.execute(stmt_session)
            session = result_session.scalar_one_or_none()
            if session:
                session.last_active_at = func.now()

            await db.commit()
            timings['save_to_db'] = time.time() - step_start

            # 异步同步到 NeuroMemory（不阻塞响应）
            async def _sync_neuromemory():
                try:
                    await nm.conversations.add_message(
                        user_id=user_id,
                        role="user",
                        content=message
                    )
                except Exception as e:
                    logger.error(f"NeuroMemory 同步失败: {e}", exc_info=True)
            asyncio.create_task(_sync_neuromemory())

            timings['total'] = time.time() - start_time

            # === Record chat UX metrics ===
            ttft_ms = ((first_token_time - start_time) * 1000) if first_token_time else timings['total'] * 1000
            total_ms = timings['total'] * 1000
            llm_ttft_ms = llm_done_info.get("llm_ttft_ms", 0)
            completion_tokens = llm_done_info.get("completion_tokens", 0)
            llm_duration_ms = llm_done_info.get("llm_duration_ms", 0)
            token_throughput = (completion_tokens / (llm_duration_ms / 1000)) if llm_duration_ms > 0 else 0
            recall_ms = timings.get('recall_memories', 0) * 1000

            MetricsCollector().record_chat(
                ttft_ms=ttft_ms,
                total_ms=total_ms,
                llm_ttft_ms=llm_ttft_ms,
                completion_tokens=completion_tokens,
                token_throughput=token_throughput,
                recall_ms=recall_ms,
                success=True,
            )

            # === 完成信号 ===
            recalled_summaries = [
                {
                    "content": m.get("content", "")[:100],
                    "score": round(m.get("score", 0), 4),
                    "memory_type": m.get("memory_type"),
                    "source": m.get("source"),
                }
                for m in memories
            ] if memories else []

            done_data = {
                "type": "done",
                "session_id": session_id,
                "memories_recalled": len(memories),
                "insights_used": 0,
                "history_messages_count": len(history_messages),
                "recalled_summaries": recalled_summaries
            }

            if debug_mode:
                done_data["debug_info"] = {
                    "model": "deepseek-chat",
                    "temperature": 0.8,
                    "max_tokens": 500,
                    "messages": [{"role": "system", "content": system_prompt}] +
                               history_messages +
                               [{"role": "user", "content": message}],
                    "message_count": len(history_messages) + 2,
                    "system_prompt": system_prompt,
                    "history_count": len(history_messages),
                    "timings": timings
                }

            yield done_data

        except Exception as e:
            logger.error(f"流式对话处理失败: {e}", exc_info=True)
            total_ms = (time.time() - start_time) * 1000 if 'start_time' in dir() else 0
            MetricsCollector().record_chat(
                ttft_ms=0, total_ms=total_ms, llm_ttft_ms=0,
                completion_tokens=0, token_throughput=0,
                recall_ms=0, success=False,
            )
            await db.rollback()
            yield {
                "type": "error",
                "error": str(e)
            }


# 全局单例
conversation_engine = ConversationEngine()

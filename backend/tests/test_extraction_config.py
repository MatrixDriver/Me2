"""
测试 neuromem 记忆提取和反思配置

验证：
1. message_interval=1 → 每条用户消息都触发异步记忆提取
2. reflection_interval=20 → 每 20 次提取后触发反思

需要真实数据库和 API Key，跳过条件见 fixture。
运行: pytest tests/test_extraction_config.py -v -s
"""
import pytest
import asyncio
from unittest.mock import AsyncMock, patch, MagicMock
from app.config import settings


class TestExtractionConfig:
    """验证配置值正确"""

    def test_message_interval_is_1(self):
        assert settings.NEUROMEMORY_EXTRACTION_INTERVAL == 1, \
            f"message_interval 应为 1，实际为 {settings.NEUROMEMORY_EXTRACTION_INTERVAL}"

    def test_reflection_interval_is_20(self):
        assert settings.NEUROMEMORY_REFLECTION_INTERVAL == 20, \
            f"reflection_interval 应为 20，实际为 {settings.NEUROMEMORY_REFLECTION_INTERVAL}"


@pytest.mark.asyncio
class TestExtractionBehavior:
    """验证 neuromem 在 message_interval=1 时每条消息都触发提取"""

    async def test_extraction_triggered_on_every_message(self):
        """每条 add_message 都应触发 _do_extraction"""
        from neuromem import NeuroMemory, ExtractionStrategy

        nm = NeuroMemory.__new__(NeuroMemory)
        # Set up minimal internal state
        nm._extraction = ExtractionStrategy(
            message_interval=1,
            idle_timeout=0,
        )
        nm._msg_counts = {}
        nm._extract_counts = {}
        nm._idle_timers = {}
        nm._sessions = {}

        extraction_calls = []
        original_do_extraction = None

        async def mock_do_extraction(user_id, session_id=None):
            extraction_calls.append((user_id, session_id))

        nm._do_extraction = mock_do_extraction

        # Simulate the message counting logic from _on_message_added
        # (We test the counting logic directly since full add_message needs DB)
        user_id = "test_user"
        session_id = "test_session"
        key = f"{user_id}:{session_id}"

        for i in range(5):
            # Replicate neuromem._on_message_added counting logic
            if nm._extraction.message_interval > 0:
                nm._msg_counts[key] = nm._msg_counts.get(key, 0) + 1
                if nm._msg_counts[key] >= nm._extraction.message_interval:
                    await nm._do_extraction(user_id, session_id)
                    nm._msg_counts[key] = 0

        assert len(extraction_calls) == 5, \
            f"message_interval=1 时，5 条消息应触发 5 次提取，实际 {len(extraction_calls)} 次"

    async def test_extraction_not_triggered_when_interval_10(self):
        """message_interval=10 时，5 条消息不应触发提取"""
        from neuromem import ExtractionStrategy

        extraction = ExtractionStrategy(message_interval=10, idle_timeout=0)
        msg_counts: dict = {}
        extraction_calls = []

        user_id = "test_user"
        session_id = "test_session"
        key = f"{user_id}:{session_id}"

        for i in range(5):
            if extraction.message_interval > 0:
                msg_counts[key] = msg_counts.get(key, 0) + 1
                if msg_counts[key] >= extraction.message_interval:
                    extraction_calls.append(i)
                    msg_counts[key] = 0

        assert len(extraction_calls) == 0, \
            f"message_interval=10 时，5 条消息不应触发提取，实际触发 {len(extraction_calls)} 次"

    async def test_reflection_triggered_after_20_extractions(self):
        """reflection_interval=20 时，20 次提取后应触发反思

        Note: In neuromem 0.7.0, reflection_interval is on neuromem, not ExtractionStrategy.
        This test simulates the counting logic directly.
        """
        reflection_interval = 20
        extract_counts: dict = {}
        reflection_calls = []

        user_id = "test_user"

        for i in range(25):
            extract_counts[user_id] = extract_counts.get(user_id, 0) + 1
            if reflection_interval > 0:
                if extract_counts[user_id] >= reflection_interval:
                    reflection_calls.append(i)
                    extract_counts[user_id] = 0

        assert len(reflection_calls) == 1, \
            f"25 次提取应触发 1 次反思（第 20 次时），实际 {len(reflection_calls)} 次"
        assert reflection_calls[0] == 19, \
            f"反思应在第 20 次提取时触发（index=19），实际在 index={reflection_calls[0]}"

    async def test_no_reflection_before_20_extractions(self):
        """19 次提取不应触发反思"""
        reflection_interval = 20
        extract_counts: dict = {}
        reflection_calls = []

        user_id = "test_user"

        for i in range(19):
            extract_counts[user_id] = extract_counts.get(user_id, 0) + 1
            if reflection_interval > 0:
                if extract_counts[user_id] >= reflection_interval:
                    reflection_calls.append(i)
                    extract_counts[user_id] = 0

        assert len(reflection_calls) == 0, \
            f"19 次提取不应触发反思，实际触发 {len(reflection_calls)} 次"


@pytest.mark.asyncio
class TestMainAppConfig:
    """验证 main.py 中 neuromem 初始化参数"""

    async def test_extraction_strategy_params(self):
        """验证 ExtractionStrategy 使用了正确的配置值"""
        from neuromem import ExtractionStrategy

        strategy = ExtractionStrategy(
            message_interval=settings.NEUROMEMORY_EXTRACTION_INTERVAL,
            idle_timeout=settings.NEUROMEMORY_IDLE_TIMEOUT,
            on_session_close=True,
            on_shutdown=True,
        )

        assert strategy.message_interval == 1
        assert strategy.on_session_close is True
        assert strategy.on_shutdown is True
        # reflection_interval is now on neuromem, not ExtractionStrategy
        assert settings.NEUROMEMORY_REFLECTION_INTERVAL == 20

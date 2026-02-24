"""
Pytest 配置和共享 fixtures
"""
import pytest
import asyncio
from typing import AsyncGenerator, Generator
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.pool import NullPool
from httpx import AsyncClient

from app.main import app
from app.db.database import Base, get_db
from app.config import settings
# Import all models so they're registered with Base before create_all
from app.db.models import User, Session, Message


# ==================== 数据库 Fixtures ====================

@pytest.fixture(scope="session")
def event_loop() -> Generator:
    """创建事件循环"""
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()


@pytest.fixture
async def test_engine():
    """测试数据库引擎"""
    # Use shared memory database so tables persist across connections
    test_db_url = "sqlite+aiosqlite:///:memory:?cache=shared&uri=true"

    engine = create_async_engine(
        test_db_url,
        echo=False,
        poolclass=NullPool,
        connect_args={"check_same_thread": False},
    )

    # 创建所有表
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    yield engine

    # 清理
    await engine.dispose()


@pytest.fixture
async def db_session(test_engine) -> AsyncGenerator[AsyncSession, None]:
    """测试数据库会话"""
    async_session = async_sessionmaker(
        test_engine,
        class_=AsyncSession,
        expire_on_commit=False,
    )

    async with async_session() as session:
        yield session
        await session.rollback()


@pytest.fixture
async def client(db_session) -> AsyncGenerator[AsyncClient, None]:
    """测试 HTTP 客户端（未认证）"""
    from httpx import ASGITransport

    # 覆盖数据库依赖
    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        yield client

    # 清理
    app.dependency_overrides.clear()


@pytest.fixture
async def authenticated_client(client: AsyncClient, db_session) -> AsyncGenerator[AsyncClient, None]:
    """已认证的测试 HTTP 客户端

    自动创建测试用户并登录，返回带有 JWT token 的客户端
    """
    # 创建测试用户
    test_username = "testuser"
    test_password = "testpass123"
    test_email = "test@example.com"

    # 注册用户
    register_resp = await client.post(
        "/api/v1/auth/register",
        json={
            "username": test_username,
            "email": test_email,
            "password": test_password
        }
    )

    if register_resp.status_code != 200:
        # 用户可能已存在，尝试登录
        login_resp = await client.post(
            "/api/v1/auth/login",
            json={
                "username": test_username,
                "password": test_password
            }
        )
        token = login_resp.json()["access_token"]
    else:
        token = register_resp.json()["access_token"]

    # 创建新的客户端实例，自动添加认证 header
    class AuthenticatedClient(AsyncClient):
        async def request(self, *args, **kwargs):
            # 自动添加 Authorization header
            if "headers" not in kwargs:
                kwargs["headers"] = {}
            kwargs["headers"]["Authorization"] = f"Bearer {token}"
            return await super().request(*args, **kwargs)

    from httpx import ASGITransport
    transport = ASGITransport(app=app)

    async with AuthenticatedClient(transport=transport, base_url="http://test") as auth_client:
        yield auth_client


# ==================== 测试数据 Fixtures ====================

@pytest.fixture
def test_user_id() -> str:
    """测试用户 ID"""
    return "test_user_001"


@pytest.fixture
def sample_message() -> str:
    """示例消息"""
    return "你好，这是一条测试消息"


@pytest.fixture
def sample_messages() -> list:
    """示例消息列表"""
    return [
        "我女儿叫小灿，今年3岁了",
        "我喜欢在周末去公园散步",
        "上周五我们去了迪士尼乐园",
        "我认为工作和生活的平衡很重要",
        "我在一家科技公司做产品经理",
    ]


@pytest.fixture
def sample_mimic_profile() -> dict:
    """示例用户画像"""
    return {
        "user_id": "test_user_001",
        "tone_style": "活泼",
        "common_phrases": ["哈哈", "确实", "感觉"],
        "sentence_patterns": ["我觉得...", "其实..."],
        "emoji_usage": 0.7,
        "punctuation_style": {"!": 0.2, "。": 0.5, "?": 0.1},
        "response_length": "中等",
        "thinking_style": "理性分析",
        "decision_patterns": ["综合考虑", "收集信息"],
        "value_priorities": {"家庭": 0.9, "工作": 0.8, "健康": 0.85},
        "confidence": 0.8,
        "sample_count": 50,
    }


# ==================== Mock Fixtures ====================

@pytest.fixture
def mock_llm_response():
    """Mock LLM 响应"""
    def _mock(prompt: str) -> str:
        if "分析" in prompt:
            return '{"tone": "活泼", "style": "友好"}'
        elif "回复" in prompt:
            return "这是一个测试回复"
        else:
            return "Mock response"

    return _mock


@pytest.fixture
def mock_neuromemory():
    """Mock NeuroMemory 客户端"""
    class MockNeuroMemory:
        async def _add_memory(self, user_id, content, memory_type="general", metadata=None, check_conflict=True):
            return {"id": "mock_memory_id", "success": True}

        async def recall(self, user_id, query, limit=20, **kwargs):
            return {
                "merged": [
                    {
                        "id": "mem_1",
                        "content": "相关记忆1",
                        "score": 0.9,
                        "source": "vector",
                        "memory_type": "fact",
                    }
                ],
                "vector_results": [],
                "graph_results": [],
                "conversation_results": [],
            }

        async def get_recent_memories(self, user_id, days=7, **kwargs):
            return []

        async def stats(self, user_id):
            return {"total": 0, "by_type": {}, "by_week": [], "active_entities": 0}

        async def delete_user_data(self, user_id):
            return {"deleted": {}}

    return MockNeuroMemory()


# ==================== 测试辅助函数 ====================

@pytest.fixture
def assert_valid_response():
    """验证响应格式"""
    def _assert(response: dict, required_fields: list):
        assert isinstance(response, dict)
        for field in required_fields:
            assert field in response, f"Missing field: {field}"

    return _assert


@pytest.fixture
def create_test_user(db_session):
    """创建测试用户"""
    async def _create(user_id: str):
        from app.db.models import User

        user = User(
            user_id=user_id,
            username=f"Test User {user_id}",
            email=f"{user_id}@test.com"
        )
        db_session.add(user)
        await db_session.commit()
        await db_session.refresh(user)
        return user

    return _create


@pytest.fixture
def create_test_session(db_session):
    """创建测试会话"""
    async def _create(user_id: str, **kwargs):
        from app.db.models import Session

        session = Session(
            user_id=user_id,
            title=kwargs.get("title", "测试会话")
        )
        db_session.add(session)
        await db_session.commit()
        await db_session.refresh(session)
        return session

    return _create


# ==================== 跳过标记 ====================

@pytest.fixture
def skip_if_no_api_key():
    """如果没有 API Key 则跳过"""
    def _skip(api_type: str):
        if api_type == "deepseek" and not settings.DEEPSEEK_API_KEY:
            pytest.skip("DEEPSEEK_API_KEY not set")
        elif api_type == "gemini" and not settings.GEMINI_API_KEY:
            pytest.skip("GEMINI_API_KEY not set")
        elif api_type == "neuromemory" and not settings.NEUROMEMORY_API_KEY:
            pytest.skip("NEUROMEMORY_API_KEY not set")

    return _skip

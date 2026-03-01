---
description: "功能实施计划: 用户认证系统和聊天引擎"
status: archived
created_at: 2026-02-12T10:30:00
updated_at: 2026-03-02T00:05:00
archived_at: 2026-03-02T00:05:00
related_files:
  - PRD.md
  - ARCHITECTURE_V2.md
---

# 功能：用户认证系统和聊天引擎

本计划旨在实现 Me2 的核心功能：基于 JWT 的用户认证系统和基于 NeuroMemory v2 的温暖陪伴式聊天引擎。

## 功能描述

实现多用户支持的聊天应用，每个用户拥有独立的记忆空间。通过 NeuroMemory v2 的三因子记忆检索（相关性 × 时效性 × 重要性）和自动记忆提取，让 AI 能够"记住"用户的所有对话，并生成温暖、懂用户的回复，实现真正的陪伴式体验。

## 用户故事

作为一个需要情感支持的用户
我想要一个能记住我所有对话的 AI 伙伴
以便在每次聊天时都能感受到被理解和被支持

## 问题陈述

当前 Me2 代码库存在以下问题：
1. 没有用户认证系统，无法支持多用户
2. 使用旧的 NeuroMemory API 客户端（已删除）
3. ConversationEngine 依赖已删除的服务（SessionManager, MimicEngine）
4. 缺少密码加密和 JWT 认证
5. 对话引擎没有使用 NeuroMemory v2 的新特性（三因子检索、自动提取、情感标注）

## 解决方案陈述

1. 实现基于 JWT 的用户认证系统（注册/登录）
2. 重写 ConversationEngine 直接使用全局 NeuroMemory 实例
3. 利用 NeuroMemory v2 的三因子检索、自动记忆提取和情感标注
4. 构建温暖、支持性的 prompt 模板
5. 简化架构，删除不必要的中间层

## 功能元数据

**功能类型**：新功能 + 重构
**估计复杂度**：中
**主要受影响的系统**：
- 后端 API（auth, chat）
- 数据库模型（User 添加 password 字段）
- 对话引擎（完全重写）
- 认证中间件（新增）

**依赖项**：
- NeuroMemory v2（已在 main.py 初始化）
- python-jose（JWT）
- passlib（密码加密）
- bcrypt（密码哈希）

---

## 上下文参考

### 相关代码库文件（必须阅读！）

**数据库和模型**：
- `backend/app/db/models.py` (行 16-30) - 原因：User 模型需要添加 hashed_password 字段
- `backend/app/db/database.py` - 原因：了解异步数据库模式

**现有 API 模式**：
- `backend/app/api/v1/users.py` (全文) - 原因：了解现有的 API 模式、依赖注入、错误处理
- `backend/app/api/v1/chat.py` (全文) - 原因：需要重写的聊天 API

**现有服务（需要重写）**：
- `backend/app/services/conversation_engine.py` (全文) - 原因：需要完全重写以使用 NeuroMemory v2
- `backend/app/services/llm_client.py` (全文) - 原因：可复用的 LLM 调用模式

**配置和初始化**：
- `backend/app/config.py` (行 14-42) - 原因：JWT 配置和数据库 URL
- `backend/app/main.py` (行 20-77) - 原因：全局 nm 实例的使用方式

**NeuroMemory 示例**：
- `/Users/jacky/code/NeuroMemory/example/chat_agent.py` (行 85-125, 296-322) - 原因：NeuroMemory 正确使用方式

### 要创建的新文件

- `backend/app/services/auth_service.py` - JWT 认证和密码加密服务
- `backend/app/api/v1/auth.py` - 注册和登录 API
- `backend/app/dependencies/auth.py` - JWT 依赖函数（get_current_user）

### 要更新的文件

- `backend/app/db/models.py` - 添加 hashed_password 字段，删除旧模型
- `backend/app/services/conversation_engine.py` - 完全重写
- `backend/app/api/v1/chat.py` - 添加 JWT 认证，简化响应
- `backend/app/api/v1/users.py` - 删除或简化（用户管理可能不需要）
- `backend/app/main.py` - 注册新的路由

### 相关文档（实施前应阅读！）

- [FastAPI Security - OAuth2 with Password and Bearer](https://fastapi.tiangolo.com/tutorial/security/oauth2-jwt/)
  - 特定部分：JWT Token 实现
  - 原因：标准的 FastAPI JWT 认证模式

- [python-jose Documentation](https://python-jose.readthedocs.io/en/latest/)
  - 特定部分：JWT 编码和解码
  - 原因：JWT token 创建和验证

- [NeuroMemory README](file:///Users/jacky/code/NeuroMemory/README.md#完整-agent-示例)
  - 特定部分：Agent 示例（行 288-403）
  - 原因：NeuroMemory v2 的正确使用方式

- [NeuroMemory chat_agent.py](file:///Users/jacky/code/NeuroMemory/example/chat_agent.py)
  - 特定部分：generate_reply 函数（行 85-124）
  - 原因：展示如何注入记忆到 prompt 和调用 LLM

### 要遵循的模式

**命名约定**（从现有代码提取）：
```python
# API 端点
router = APIRouter(prefix="/auth", tags=["认证"])

# Pydantic 模型
class UserCreate(BaseModel):
    """创建用户请求"""
    username: str
    email: str | None = None

# 数据库模型
class User(Base):
    __tablename__ = "users"
    id = Column(String, primary_key=True, default=generate_uuid)
```

**错误处理**（from users.py:92-96）：
```python
except HTTPException:
    raise
except Exception as e:
    logger.error(f"操作失败: {e}", exc_info=True)
    raise HTTPException(status_code=500, detail=str(e))
```

**日志记录**（from conversation_engine.py:61,69）：
```python
logger.info(f"检索到 {len(memories)} 条相关记忆")
logger.info(f"对话意图: {intent}")
```

**异步数据库查询**（from users.py:49-54）：
```python
stmt = select(User).where(User.username == request.username)
result = await db.execute(stmt)
existing_user = result.scalar_one_or_none()

if existing_user:
    raise HTTPException(status_code=400, detail="用户名已存在")
```

**NeuroMemory 使用模式**（from NeuroMemory example）：
```python
# 召回记忆（三因子检索）
recall_result = await nm.recall(user_id=user_id, query=user_input, limit=5)
memories = recall_result["merged"]

# 获取洞察
insights = await nm.search(user_id, user_input, memory_type="insight", limit=3)

# 保存对话
await nm.conversations.add_message(user_id, "user", content)
await nm.conversations.add_message(user_id, "assistant", response)
```

---

## 实施计划

### 阶段 1：用户认证基础

实现 JWT 认证系统，包括密码加密、token 生成和验证。

**任务**：
1. 更新 User 模型添加 hashed_password 字段
2. 创建 auth_service.py（密码加密、JWT 创建/验证）
3. 创建 auth 依赖函数（get_current_user）
4. 创建 auth API（注册/登录）

### 阶段 2：对话引擎重写

基于 NeuroMemory v2 重写对话引擎，实现温暖陪伴式聊天。

**任务**：
1. 重写 ConversationEngine 使用全局 nm 实例
2. 实现记忆召回（三因子检索 + 洞察）
3. 构建温暖的 system prompt
4. 集成情感识别

### 阶段 3：API 集成

更新聊天 API 使用 JWT 认证和新的对话引擎。

**任务**：
1. 更新 chat.py 添加 JWT 认证
2. 简化响应格式
3. 注册新路由到 main.py

### 阶段 4：清理和优化

删除不需要的旧代码和模型。

**任务**：
1. 删除旧的数据库模型（MimicProfile, Session, ProactiveContact, ImportTask）
2. 删除旧的服务文件（session_manager, intent_analyzer）
3. 验证功能完整性

---

## 逐步任务

### CREATE backend/app/dependencies/__init__.py

创建 dependencies 模块。

- **IMPLEMENT**: 空的 __init__.py 文件
- **VALIDATE**: `ls backend/app/dependencies/__init__.py`

### UPDATE backend/app/db/models.py

更新 User 模型，删除旧模型。

- **IMPLEMENT**:
  1. 在 User 模型添加 `hashed_password = Column(String(255), nullable=False)`
  2. 删除 MimicProfile, Session, ProactiveContact, ImportTask 类
  3. 删除 User 模型中的 relationships
  4. 添加 `last_login = Column(DateTime(timezone=True), nullable=True)` 字段
- **PATTERN**: 参考 User 模型现有字段定义 (models.py:16-30)
- **IMPORTS**: 保持现有导入不变
- **GOTCHA**: 删除关系字段时确保没有遗漏的外键引用
- **VALIDATE**: `python -c "from app.db.models import User; print(User.__table__.columns.keys())"`

### CREATE backend/app/services/auth_service.py

创建认证服务，处理密码加密和 JWT token。

- **IMPLEMENT**:
  ```python
  """认证服务 - 密码加密和 JWT token 管理"""
  from datetime import datetime, timedelta
  from jose import JWTError, jwt
  from passlib.context import CryptContext
  from app.config import settings
  import logging

  logger = logging.getLogger(__name__)

  # 密码加密上下文
  pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


  def verify_password(plain_password: str, hashed_password: str) -> bool:
      """验证密码"""
      return pwd_context.verify(plain_password, hashed_password)


  def get_password_hash(password: str) -> str:
      """加密密码"""
      return pwd_context.hash(password)


  def create_access_token(data: dict) -> str:
      """创建 JWT access token

      Args:
          data: 要编码的数据字典（通常包含 sub: user_id）

      Returns:
          JWT token 字符串
      """
      to_encode = data.copy()
      expire = datetime.utcnow() + timedelta(days=settings.JWT_EXPIRE_DAYS)
      to_encode.update({"exp": expire})

      encoded_jwt = jwt.encode(
          to_encode,
          settings.JWT_SECRET,
          algorithm=settings.JWT_ALGORITHM
      )
      return encoded_jwt


  def verify_token(token: str) -> dict | None:
      """验证 JWT token

      Args:
          token: JWT token 字符串

      Returns:
          解码后的 payload，如果无效则返回 None
      """
      try:
          payload = jwt.decode(
              token,
              settings.JWT_SECRET,
              algorithms=[settings.JWT_ALGORITHM]
          )
          return payload
      except JWTError as e:
          logger.error(f"JWT 验证失败: {e}")
          return None
  ```
- **PATTERN**: 参考 FastAPI Security 文档的 JWT 实现
- **IMPORTS**: jose, passlib, datetime, app.config
- **GOTCHA**: 确保 JWT_SECRET 在生产环境使用强随机字符串
- **VALIDATE**: `python -c "from app.services.auth_service import create_access_token, verify_token; t = create_access_token({'sub': 'test'}); print('Token:', t[:20]); print('Valid:', verify_token(t) is not None)"`

### CREATE backend/app/dependencies/auth.py

创建 JWT 认证依赖函数。

- **IMPLEMENT**:
  ```python
  """认证依赖 - FastAPI 依赖注入"""
  from fastapi import Depends, HTTPException, status
  from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
  from sqlalchemy.ext.asyncio import AsyncSession
  from sqlalchemy import select
  from app.db.database import get_db
  from app.db.models import User
  from app.services.auth_service import verify_token
  import logging

  logger = logging.getLogger(__name__)

  # HTTP Bearer token scheme
  security = HTTPBearer()


  async def get_current_user(
      credentials: HTTPAuthorizationCredentials = Depends(security),
      db: AsyncSession = Depends(get_db)
  ) -> User:
      """获取当前认证用户

      Args:
          credentials: HTTP Bearer token
          db: 数据库会话

      Returns:
          User 对象

      Raises:
          HTTPException: 如果 token 无效或用户不存在
      """
      token = credentials.credentials

      # 验证 token
      payload = verify_token(token)
      if payload is None:
          raise HTTPException(
              status_code=status.HTTP_401_UNAUTHORIZED,
              detail="无效的认证凭据",
              headers={"WWW-Authenticate": "Bearer"},
          )

      # 获取用户 ID
      user_id: str = payload.get("sub")
      if user_id is None:
          raise HTTPException(
              status_code=status.HTTP_401_UNAUTHORIZED,
              detail="无效的 token payload"
          )

      # 查询用户
      stmt = select(User).where(User.id == user_id)
      result = await db.execute(stmt)
      user = result.scalar_one_or_none()

      if user is None:
          raise HTTPException(
              status_code=status.HTTP_401_UNAUTHORIZED,
              detail="用户不存在"
          )

      return user
  ```
- **PATTERN**: 参考 users.py 的依赖注入模式 (users.py:33-36)
- **IMPORTS**: fastapi, fastapi.security, sqlalchemy, app.db, app.services.auth_service
- **GOTCHA**: 确保返回完整的 User 对象而非 user_id
- **VALIDATE**: 手动测试（需要先实现 auth API）

### CREATE backend/app/api/v1/auth.py

创建认证 API（注册和登录）。

- **IMPLEMENT**:
  ```python
  """认证 API - 注册和登录"""
  from fastapi import APIRouter, Depends, HTTPException, status
  from pydantic import BaseModel, EmailStr, Field
  from sqlalchemy.ext.asyncio import AsyncSession
  from sqlalchemy import select
  from app.db.database import get_db
  from app.db.models import User
  from app.services.auth_service import get_password_hash, verify_password, create_access_token
  from datetime import datetime
  import logging

  logger = logging.getLogger(__name__)

  router = APIRouter(prefix="/auth", tags=["认证"])


  class RegisterRequest(BaseModel):
      """注册请求"""
      username: str = Field(..., min_length=3, max_length=50)
      email: EmailStr
      password: str = Field(..., min_length=6, max_length=100)


  class LoginRequest(BaseModel):
      """登录请求"""
      username: str
      password: str


  class AuthResponse(BaseModel):
      """认证响应"""
      access_token: str
      token_type: str = "bearer"
      user: dict


  @router.post("/register", response_model=AuthResponse)
  async def register(
      request: RegisterRequest,
      db: AsyncSession = Depends(get_db)
  ):
      """用户注册

      Args:
          request: 注册请求
          db: 数据库会话

      Returns:
          认证响应（包含 token 和用户信息）
      """
      try:
          # 检查用户名是否已存在
          stmt = select(User).where(User.username == request.username)
          result = await db.execute(stmt)
          existing_user = result.scalar_one_or_none()

          if existing_user:
              raise HTTPException(
                  status_code=status.HTTP_400_BAD_REQUEST,
                  detail="用户名已存在"
              )

          # 检查邮箱是否已存在
          stmt = select(User).where(User.email == request.email)
          result = await db.execute(stmt)
          existing_email = result.scalar_one_or_none()

          if existing_email:
              raise HTTPException(
                  status_code=status.HTTP_400_BAD_REQUEST,
                  detail="邮箱已被注册"
              )

          # 创建用户
          hashed_password = get_password_hash(request.password)
          user = User(
              username=request.username,
              email=request.email,
              hashed_password=hashed_password
          )
          db.add(user)
          await db.commit()
          await db.refresh(user)

          # 生成 token
          access_token = create_access_token(data={"sub": user.id})

          logger.info(f"用户注册成功: {user.username}")

          return AuthResponse(
              access_token=access_token,
              user={
                  "id": user.id,
                  "username": user.username,
                  "email": user.email
              }
          )

      except HTTPException:
          raise
      except Exception as e:
          logger.error(f"注册失败: {e}", exc_info=True)
          raise HTTPException(
              status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
              detail=str(e)
          )


  @router.post("/login", response_model=AuthResponse)
  async def login(
      request: LoginRequest,
      db: AsyncSession = Depends(get_db)
  ):
      """用户登录

      Args:
          request: 登录请求
          db: 数据库会话

      Returns:
          认证响应（包含 token 和用户信息）
      """
      try:
          # 查询用户
          stmt = select(User).where(User.username == request.username)
          result = await db.execute(stmt)
          user = result.scalar_one_or_none()

          if not user:
              raise HTTPException(
                  status_code=status.HTTP_401_UNAUTHORIZED,
                  detail="用户名或密码错误"
              )

          # 验证密码
          if not verify_password(request.password, user.hashed_password):
              raise HTTPException(
                  status_code=status.HTTP_401_UNAUTHORIZED,
                  detail="用户名或密码错误"
              )

          # 更新最后登录时间
          user.last_login = datetime.utcnow()
          await db.commit()

          # 生成 token
          access_token = create_access_token(data={"sub": user.id})

          logger.info(f"用户登录成功: {user.username}")

          return AuthResponse(
              access_token=access_token,
              user={
                  "id": user.id,
                  "username": user.username,
                  "email": user.email
              }
          )

      except HTTPException:
          raise
      except Exception as e:
          logger.error(f"登录失败: {e}", exc_info=True)
          raise HTTPException(
              status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
              detail=str(e)
          )
  ```
- **PATTERN**: 参考 users.py 的 API 结构 (users.py:32-96)
- **IMPORTS**: fastapi, pydantic, sqlalchemy, app.db, app.services.auth_service, datetime
- **GOTCHA**: 登录失败时不要透露用户是否存在（统一返回"用户名或密码错误"）
- **VALIDATE**:
  ```bash
  # 注册
  curl -X POST http://localhost:8000/api/v1/auth/register \
    -H "Content-Type: application/json" \
    -d '{"username":"testuser","email":"test@example.com","password":"test123456"}'

  # 登录
  curl -X POST http://localhost:8000/api/v1/auth/login \
    -H "Content-Type: application/json" \
    -d '{"username":"testuser","password":"test123456"}'
  ```

### REFACTOR backend/app/services/conversation_engine.py

完全重写对话引擎，使用 NeuroMemory v2。

- **IMPLEMENT**:
  ```python
  """对话引擎 - 基于 NeuroMemory v2 的温暖陪伴式聊天"""
  from typing import Dict, Any
  from app.main import nm  # 导入全局 NeuroMemory 实例
  from app.services.llm_client import LLMClient
  import logging

  logger = logging.getLogger(__name__)


  class ConversationEngine:
      """对话引擎 - Me2 高层对话逻辑"""

      def __init__(self):
          """初始化对话引擎"""
          self.llm = LLMClient()

      async def chat(self, user_id: str, message: str) -> Dict[str, Any]:
          """处理对话 - 温暖、懂用户的回复

          Args:
              user_id: 用户 ID
              message: 用户消息

          Returns:
              对话响应字典
          """
          try:
              # === 1. 召回相关记忆（三因子检索）===
              recall_result = await nm.recall(
                  user_id=user_id,
                  query=message,
                  limit=5
              )
              memories = recall_result["merged"]
              logger.info(f"召回 {len(memories)} 条记忆")

              # === 2. 获取洞察（深度理解）===
              insights = await nm.search(
                  user_id=user_id,
                  query=message,
                  memory_type="insight",
                  limit=3
              )
              logger.info(f"获取 {len(insights)} 条洞察")

              # === 3. 构建温暖的 system prompt ===
              system_prompt = self._build_warm_prompt(memories, insights)

              # === 4. 调用 LLM 生成回复 ===
              response = await self.llm.generate(
                  prompt=message,
                  system_prompt=system_prompt,
                  temperature=0.8,  # 稍高温度，更自然
                  max_tokens=500
              )

              # === 5. 保存对话（NeuroMemory 自动提取记忆）===
              await nm.conversations.add_message(
                  user_id=user_id,
                  role="user",
                  content=message
              )
              await nm.conversations.add_message(
                  user_id=user_id,
                  role="assistant",
                  content=response
              )

              logger.info(f"对话处理完成: user={user_id}")

              return {
                  "response": response,
                  "memories_recalled": len(memories),
                  "insights_used": len(insights)
              }

          except Exception as e:
              logger.error(f"对话处理失败: {e}", exc_info=True)
              return {
                  "response": "抱歉，我遇到了一些问题，请稍后再试。",
                  "error": str(e)
              }

      def _build_warm_prompt(
          self,
          memories: list[dict],
          insights: list[dict]
      ) -> str:
          """构建温暖、支持性的 system prompt

          Args:
              memories: 召回的记忆列表
              insights: 洞察列表

          Returns:
              system prompt 字符串
          """
          # 格式化记忆
          memory_lines = []
          for m in memories:
              meta = m.get("metadata", {})

              # 提取情感信息
              emotion_hint = ""
              if "emotion" in meta and meta["emotion"]:
                  label = meta["emotion"].get("label", "")
                  valence = meta["emotion"].get("valence", 0)
                  if label:
                      emotion_hint = f" [用户当时感到{label}]"
                  elif valence < -0.3:
                      emotion_hint = " [负面情绪]"
                  elif valence > 0.3:
                      emotion_hint = " [正面情绪]"

              score = m.get("score", 0)
              memory_lines.append(
                  f"- {m['content']} (相关度: {score:.2f}){emotion_hint}"
              )

          memory_context = "\n".join(memory_lines) if memory_lines else "暂无相关记忆"

          # 格式化洞察
          insight_context = "\n".join([
              f"- {i['content']}" for i in insights
          ]) if insights else "暂无深度理解"

          # 提取情感上下文
          emotional_context = self._extract_emotional_context(memories)

          return f"""你是一个温暖、懂 ta 的朋友。

**你记得关于 ta 的这些事**：
{memory_context}

**你对 ta 的理解**：
{insight_context}

{emotional_context}

**重要指引**：
1. 像真正的朋友一样对话，自然地提及你记得的事
2. 如果 ta 情绪低落，给予温暖的支持和鼓励
3. 如果 ta 分享开心的事，真诚地为 ta 高兴
4. 不要机械地复述记忆，要自然融入对话
5. 让 ta 感觉被理解、被支持
6. 回复简洁自然，不要过长
7. 可以适当使用表情符号，但不要过度"""

      def _extract_emotional_context(self, memories: list[dict]) -> str:
          """提取情感上下文

          Args:
              memories: 记忆列表

          Returns:
              情感提示字符串
          """
          emotions = []
          for m in memories:
              meta = m.get("metadata", {})
              if "emotion" in meta and meta["emotion"]:
                  emotions.append(meta["emotion"])

          if not emotions:
              return ""

          # 计算平均情绪
          avg_valence = sum(e["valence"] for e in emotions) / len(emotions)

          if avg_valence < -0.3:
              return "\n**注意**: ta 最近情绪似乎有些低落，请给予关心和支持。"
          elif avg_valence > 0.3:
              return "\n**注意**: ta 最近心情不错，可以分享 ta 的快乐。"

          return ""


  # 全局单例
  conversation_engine = ConversationEngine()
  ```
- **PATTERN**: 参考 NeuroMemory chat_agent.py 的 generate_reply 函数 (chat_agent.py:85-124)
- **IMPORTS**: app.main (nm), app.services.llm_client, typing, logging
- **GOTCHA**: 必须在 main.py 启动后才能导入 nm，否则会是 None
- **VALIDATE**: 手动测试（需要先完成 chat API 更新）

### UPDATE backend/app/api/v1/chat.py

更新聊天 API，添加 JWT 认证。

- **IMPLEMENT**:
  ```python
  """聊天 API - 基于 JWT 认证的对话接口"""
  from fastapi import APIRouter, Depends, HTTPException
  from pydantic import BaseModel
  from app.db.models import User
  from app.dependencies.auth import get_current_user
  from app.services.conversation_engine import conversation_engine
  import logging

  logger = logging.getLogger(__name__)

  router = APIRouter(prefix="/chat", tags=["聊天"])


  class ChatRequest(BaseModel):
      """聊天请求"""
      message: str


  class ChatResponse(BaseModel):
      """聊天响应"""
      response: str
      memories_recalled: int
      insights_used: int


  @router.post("/", response_model=ChatResponse)
  async def chat(
      request: ChatRequest,
      current_user: User = Depends(get_current_user)
  ):
      """发送聊天消息

      需要 JWT 认证。user_id 从 token 中获取。

      Args:
          request: 聊天请求
          current_user: 当前认证用户（从 JWT 获取）

      Returns:
          聊天响应
      """
      try:
          # 调用对话引擎
          result = await conversation_engine.chat(
              user_id=current_user.id,
              message=request.message
          )

          if "error" in result:
              raise HTTPException(status_code=500, detail=result["error"])

          return ChatResponse(
              response=result["response"],
              memories_recalled=result["memories_recalled"],
              insights_used=result["insights_used"]
          )

      except HTTPException:
          raise
      except Exception as e:
          logger.error(f"聊天处理失败: {e}", exc_info=True)
          raise HTTPException(status_code=500, detail=str(e))
  ```
- **PATTERN**: 参考现有 chat.py 的结构，简化响应
- **IMPORTS**: fastapi, pydantic, app.db.models, app.dependencies.auth, app.services.conversation_engine
- **GOTCHA**: 不再需要在请求中传递 user_id，从 JWT token 中获取
- **VALIDATE**:
  ```bash
  # 先登录获取 token
  TOKEN=$(curl -X POST http://localhost:8000/api/v1/auth/login \
    -H "Content-Type: application/json" \
    -d '{"username":"testuser","password":"test123456"}' | jq -r '.access_token')

  # 发送聊天消息
  curl -X POST http://localhost:8000/api/v1/chat \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"message":"你好"}'
  ```

### UPDATE backend/app/main.py

注册新的认证路由。

- **IMPLEMENT**:
  1. 取消注释 auth 路由导入：`from app.api.v1 import auth, chat`
  2. 注册路由：
     ```python
     app.include_router(auth.router, prefix="/api/v1", tags=["认证"])
     app.include_router(chat.router, prefix="/api/v1", tags=["聊天"])
     ```
  3. 删除旧的路由导入注释
- **PATTERN**: 参考 main.py:97-102 的路由注册模式
- **GOTCHA**: 确保在 lifespan 中 nm 已初始化后才能使用
- **VALIDATE**: `curl http://localhost:8000/docs` 应该显示新的 auth 和 chat 端点

### REMOVE backend/app/services/session_manager.py

删除旧的会话管理器（已由 NeuroMemory 替代）。

- **IMPLEMENT**: `rm backend/app/services/session_manager.py`
- **VALIDATE**: `test ! -f backend/app/services/session_manager.py && echo "已删除"`

### REMOVE backend/app/services/intent_analyzer.py

删除意图分析器（简化架构）。

- **IMPLEMENT**: `rm backend/app/services/intent_analyzer.py`
- **VALIDATE**: `test ! -f backend/app/services/intent_analyzer.py && echo "已删除"`

### UPDATE backend/app/services/llm_client.py

更新 LLM 客户端配置获取方式。

- **IMPLEMENT**:
  1. 删除 `from app.config import get_deepseek_config`
  2. 添加 `from app.config import settings`
  3. 更新 __init__ 方法：
     ```python
     def __init__(self):
         """初始化 LLM 客户端"""
         self.client = AsyncOpenAI(
             api_key=settings.DEEPSEEK_API_KEY,
             base_url=settings.DEEPSEEK_BASE_URL
         )
         self.model = settings.DEEPSEEK_MODEL
     ```
- **PATTERN**: 直接使用 settings 而非 helper 函数
- **GOTCHA**: 确保 settings 已正确配置 DEEPSEEK_API_KEY
- **VALIDATE**: `python -c "from app.services.llm_client import llm_client; print('LLM Client OK')"`

---

## 测试策略

### 单元测试

创建以下单元测试文件：

**backend/tests/services/test_auth_service.py**:
- 测试密码加密和验证
- 测试 JWT token 创建和验证
- 测试 token 过期

**backend/tests/api/test_auth.py**:
- 测试用户注册（成功、用户名重复、邮箱重复）
- 测试用户登录（成功、用户不存在、密码错误）
- 测试 JWT token 有效性

**backend/tests/api/test_chat.py**:
- 测试聊天 API（有 token、无 token、无效 token）
- 测试记忆召回
- Mock NeuroMemory 的调用

### 集成测试

**backend/tests/integration/test_auth_flow.py**:
- 完整的注册 → 登录 → 聊天流程
- 多用户隔离测试

### 边缘情况

- JWT token 过期后的处理
- 密码为空或过短
- 用户名包含特殊字符
- NeuroMemory 调用失败的降级处理
- 并发请求的处理

---

## 验证命令

### 级别 1：语法和导入检查

```bash
# 检查语法错误
python -m py_compile backend/app/services/auth_service.py
python -m py_compile backend/app/dependencies/auth.py
python -m py_compile backend/app/api/v1/auth.py
python -m py_compile backend/app/services/conversation_engine.py
python -m py_compile backend/app/api/v1/chat.py

# 验证导入
python -c "from app.services.auth_service import create_access_token, verify_token, get_password_hash, verify_password"
python -c "from app.dependencies.auth import get_current_user"
python -c "from app.api.v1.auth import router as auth_router"
python -c "from app.services.conversation_engine import conversation_engine"
python -c "from app.api.v1.chat import router as chat_router"
```

### 级别 2：数据库迁移

```bash
# 检查数据库模型
python -c "from app.db.models import User; print('User fields:', User.__table__.columns.keys())"

# 启动应用验证数据库初始化
uvicorn app.main:app --host 0.0.0.0 --port 8000 &
sleep 5
curl http://localhost:8000/health
pkill -f uvicorn
```

### 级别 3：API 功能测试

```bash
# 启动应用
uvicorn app.main:app --host 0.0.0.0 --port 8000 &
sleep 5

# 测试注册
curl -X POST http://localhost:8000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"testuser","email":"test@example.com","password":"test123456"}'

# 测试登录
TOKEN=$(curl -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"testuser","password":"test123456"}' | jq -r '.access_token')

echo "Token: $TOKEN"

# 测试聊天（需要 token）
curl -X POST http://localhost:8000/api/v1/chat \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"message":"你好"}'

# 测试聊天（无 token，应该失败）
curl -X POST http://localhost:8000/api/v1/chat \
  -H "Content-Type: application/json" \
  -d '{"message":"你好"}'

# 清理
pkill -f uvicorn
```

### 级别 4：手动验证

1. **访问 API 文档**: http://localhost:8000/docs
   - 验证 /auth/register 和 /auth/login 端点存在
   - 验证 /chat 端点需要 Bearer token 认证

2. **完整注册登录流程**:
   - 注册新用户
   - 使用错误密码登录（应失败）
   - 使用正确密码登录（应成功）
   - 使用 token 发送聊天消息

3. **记忆测试**:
   - 发送："我在 Google 工作"
   - 等待 10 秒（让 NeuroMemory 提取记忆）
   - 发送："我的工作怎么样？"
   - 验证 AI 能记住之前的信息

4. **多用户隔离测试**:
   - 注册两个不同的用户
   - 用户 A 发送个人信息
   - 用户 B 查询相同问题
   - 验证用户 B 看不到用户 A 的记忆

---

## 验收标准

- [ ] 用户可以成功注册（用户名、邮箱唯一性检查）
- [ ] 用户可以使用用户名和密码登录
- [ ] 登录成功返回有效的 JWT token
- [ ] 聊天 API 需要有效的 JWT token
- [ ] 无效或过期的 token 返回 401 错误
- [ ] AI 能够召回用户的历史记忆
- [ ] AI 回复温暖、自然，不机械
- [ ] NeuroMemory 自动提取和存储记忆
- [ ] 不同用户的记忆完全隔离
- [ ] 密码使用 bcrypt 加密存储
- [ ] 所有 API 错误都有合适的状态码和消息
- [ ] 日志记录关键操作（注册、登录、聊天）

---

## 完成检查清单

- [ ] 所有新文件已创建
- [ ] 所有旧文件已删除或更新
- [ ] 数据库模型已更新（User 添加 hashed_password）
- [ ] JWT 认证系统正常工作
- [ ] 对话引擎使用 NeuroMemory v2
- [ ] 所有 API 端点已测试
- [ ] 验证命令全部通过
- [ ] 手动测试完整流程成功
- [ ] 代码无语法错误
- [ ] 日志输出正常
- [ ] API 文档更新（Swagger）

---

## 备注

### 设计决策

1. **直接使用全局 nm 实例**：避免不必要的封装，保持简洁
2. **JWT 而非 Session**：无状态认证，便于扩展
3. **删除旧的中间层**：SessionManager, MimicEngine 等由 NeuroMemory 替代
4. **温暖的 prompt 设计**：核心价值在于让用户感觉被理解
5. **自动记忆提取**：ExtractionStrategy 在后台自动运行，用户无感知

### 技术权衡

- **优势**：
  - 简化架构，易于维护
  - NeuroMemory v2 提供强大的记忆能力
  - JWT 认证标准且无状态
  - 情感标注提升用户体验

- **风险**：
  - NeuroMemory 性能依赖（需要监控）
  - LLM API 调用可能失败（需要重试机制）
  - 首次 Embedding 模型下载时间长（文档已说明）

### 后续优化

- 添加密码重置功能
- 添加邮箱验证
- 实现刷新 token 机制
- 添加速率限制（防止滥用）
- 实现对话历史查看 API
- 添加用户偏好设置
- 实现主动关心功能

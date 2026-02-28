# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

Me2 是一个温暖陪伴式 AI 聊天 Web 应用（v0.3.0），核心特色是通过 neuromem 记忆引擎让 AI 记住用户对话并生成有温度的回复。部署平台为 Railway。

## 技术栈

- **后端**: FastAPI 0.109 + SQLAlchemy 2 (async) + asyncpg
- **前端**: Next.js 14 (App Router) + React 18 + TypeScript 5 + TailwindCSS 3
- **数据库**: PostgreSQL 18 (含 AGE 图扩展 + pgvector)，端口 5434
- **记忆引擎**: `neuromem==0.8.0`（PyPI 包名，核心依赖）
- **LLM**: OpenAI 兼容接口，默认通过 OpenRouter 调用 deepseek/deepseek-v3.2
- **Embedding**: 默认 remote 模式（OpenAI/SiliconFlow API）

## 常用命令

### 启动开发环境

```bash
# 1. 启动 PostgreSQL（需要自定义镜像含 AGE+pgvector）
docker-compose up -d

# 2. 后端（端口 8000）
cd backend
cp .env.example .env  # 首次需配置 API Key
pip install -r requirements.txt
uvicorn app.main:app --reload

# 3. 前端（端口 3000）
cd frontend
npm install
npm run dev
```

### 后端测试（在 backend/ 目录下）

```bash
pytest tests/ -v                          # 全部测试
pytest tests/ -m unit -v                  # 单元测试
pytest tests/ -m api -v                   # API 测试
pytest tests/api/test_chat.py -v          # 单个文件
pytest tests/api/test_chat.py::test_name  # 单个用例
make test-coverage                        # 覆盖率报告
```

pytest 配置：`asyncio_mode = auto`，标记有 `unit`/`integration`/`api`/`slow`/`requires_db`/`requires_llm`。

### 前端测试与构建（在 frontend/ 目录下）

```bash
npm test               # Jest 单次运行
npm run test:watch     # 监听模式
npm run lint           # next lint
npm run build          # 生产构建
```

## 核心架构

### neuromem 全局单例

```python
# backend/app/main.py 中初始化
nm: NeuroMemory = None  # 全局实例

# 其他模块通过延迟导入获取
from app.main import nm
```

所有 neuromem 访问走 `from app.main import nm`，不使用依赖注入。查询 neuromem 内部表（GraphNode、EmotionProfile 等）时用 `async with nm._db.session() as session:`，不用 Me2 自己的 `AsyncSessionLocal`。

### 对话流程

用户请求 → `/api/v1/chat/stream` (SSE) → `ConversationEngine.chat_stream()`:
1. 从 DB 取最近 20 条历史消息
2. `nm.recall()` 召回相关记忆
3. `_build_prompt()` 按类型分层组装 system prompt（fact/episodic/insight/graph）
4. `LLMClient.generate(stream=True)` 流式调用 LLM
5. `asyncio.create_task(_sync_neuromem())` 异步 ingest（不阻塞响应）

SSE 数据格式：`{"type": "token"|"done"|"error", ...}`

### 服务单例模式

`conversation_engine`、`MetricsCollector` 等在模块底部实例化为单例，路由文件直接导入使用。

### 前端认证

- JWT token 存 `localStorage` (key: `me2_access_token`)
- `AuthContext` → `ProtectedRoute` 保护需登录页面
- `AdminRoute` 额外检查 `is_admin`
- `/admin/*` 路径绕过主 `AppShell` 侧边栏，有独立 `AdminLayout`

### 数据库

Me2 管理的表：`users`、`sessions`、`messages`、`metrics_snapshots`。neuromem 自动管理 `memories`、`conversations`、`graph_nodes`、`graph_edges`、`emotion_profiles`、`kv_store` 等表。

新增列通过 `main.py` lifespan 中的内联 SQL 迁移（`ALTER TABLE ... ADD COLUMN IF NOT EXISTS`），未使用 Alembic。

## 开发约定

### 后端

- **路由顺序**：固定路径（`/profile`、`/emotion`、`/graph`）必须在参数化路径（`/{memory_id}`）之前声明
- **LLM 温度**：聊天回复 `temperature=0.8`，分析类 `temperature=0.3`
- **错误信息**：API 返回中文错误详情（如 `"用户名已存在"`）
- **异步 only**：全部使用 SQLAlchemy 2 异步 API，不混用同步操作
- **DATABASE_URL 转换**：config.py 自动将 `postgresql://` 转为 `postgresql+asyncpg://`

### 前端

- **路径别名**：`@/*` 指向前端根目录 `./`
- **API 基础 URL**：`lib/api-client.ts` 中统一管理，环境变量 `NEXT_PUBLIC_API_URL` 或回退到 `/api/v1`
- **组件分层**：`app/` 页面级、`components/` 可复用（按 `memories/`、`admin/`、`layout/`、`ui/` 分目录）
- **主题**：深色主题，HSL CSS 变量，glassmorphism 风格

## API 路由结构

- `/api/v1/auth/` — 注册、登录（JWT）
- `/api/v1/chat/` — 流式/非流式聊天、会话 CRUD、消息历史
- `/api/v1/memories/` — 记忆列表、语义搜索、图谱、情绪档案、用户画像、统计
- `/api/v1/admin/` — 仪表盘、用户管理（需 `is_admin`）
- `/health` — 健康检查
- `/api/v1/version` — 版本信息

## 环境变量

必须配置（`backend/.env`）：
- `DEEPSEEK_API_KEY` — LLM API Key
- `DATABASE_URL` — PostgreSQL 连接串（本地默认 `postgresql+asyncpg://me2_user:me2_secure_password_2026@localhost:5434/me2db`）
- `SECRET_KEY` / `JWT_SECRET` — 生产环境必须更改

前端可选（`frontend/.env.local`）：
- `NEXT_PUBLIC_API_URL` — 后端 API 地址，开发环境设为 `http://localhost:8000/api/v1`

## 部署

Railway 部署（`railway.json`）：
- build: `pip install -r backend/requirements.txt`
- start: `cd backend && uvicorn app.main:app --host 0.0.0.0 --port $PORT`
- healthcheck: `/health`（超时 300s）

## rpiv/ 目录

`rpiv/plans/` 存放功能实施计划，带 YAML frontmatter（`status`、`created_at`、`updated_at`）。修改后必须同步更新 `status` 和 `updated_at`。

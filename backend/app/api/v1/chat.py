"""聊天 API - 基于 JWT 认证的对话接口"""
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc, func as sql_func, or_, case
from typing import Optional, List
from datetime import datetime
from app.db.models import User, Session, Message
from app.dependencies import get_db
from app.dependencies.auth import get_current_user
from app.services.conversation_engine import conversation_engine
import logging
import json

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/chat", tags=["聊天"])


class ChatRequest(BaseModel):
    """聊天请求"""
    message: str
    session_id: Optional[str] = None  # 可选，不提供则创建新会话
    debug_mode: bool = False  # 调试模式


class ChatResponse(BaseModel):
    """聊天响应"""
    response: str
    session_id: str
    memories_recalled: int
    insights_used: int
    history_messages_count: int = 0
    debug_info: Optional[dict] = None  # 调试信息（仅debug_mode=True时返回）


class SessionCreate(BaseModel):
    """创建会话请求"""
    title: Optional[str] = None


class SessionUpdate(BaseModel):
    """更新会话请求"""
    title: Optional[str] = None
    pinned: Optional[bool] = None


class SessionResponse(BaseModel):
    """会话响应"""
    id: str
    title: Optional[str]
    created_at: datetime
    last_active_at: datetime
    message_count: int
    pinned: bool = False


class RecalledMemorySummary(BaseModel):
    content: str
    score: float
    memory_type: Optional[str] = None
    source: Optional[str] = None

class MessageResponse(BaseModel):
    """消息响应"""
    id: str
    role: str
    content: str
    created_at: datetime
    # 仅 assistant 消息有以下字段
    system_prompt: Optional[str] = None
    memories_recalled: Optional[int] = None
    insights_used: Optional[int] = None
    recalled_summaries: Optional[List[RecalledMemorySummary]] = None
    debug_info: Optional[dict] = None


class SessionExport(BaseModel):
    """会话导出响应"""
    session: SessionResponse
    messages: List[MessageResponse]


def _build_debug_info(msg) -> Optional[dict]:
    """从 Message.meta 和 system_prompt 构建 debug_info（供历史消息使用）"""
    if msg.role != "assistant" or not msg.meta:
        return None
    meta = msg.meta
    timings = meta.get("timings")
    if not timings:
        return None
    return {
        "model": meta.get("model", ""),
        "temperature": meta.get("temperature"),
        "max_tokens": meta.get("max_tokens"),
        "history_count": meta.get("history_messages_count", 0),
        "system_prompt": msg.system_prompt,
        "timings": timings,
    }


def _get_recalled_summaries(msg) -> Optional[List[RecalledMemorySummary]]:
    """从 Message.recalled_memories 提取摘要"""
    if not msg.recalled_memories or msg.role != "assistant":
        return None
    try:
        return [
            RecalledMemorySummary(
                content=m.get("content", "")[:100],
                score=round(m.get("score", 0), 2),
                memory_type=m.get("memory_type"),
                source=m.get("source"),
            )
            for m in msg.recalled_memories
        ]
    except Exception:
        return None


def _get_pinned(session: Session) -> bool:
    """从 session.meta 中读取 pinned 状态"""
    if session.meta and isinstance(session.meta, dict):
        return session.meta.get("pinned", False)
    return False


@router.post("/sessions", response_model=SessionResponse)
async def create_session(
    request: SessionCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """创建新的对话会话"""
    try:
        session = Session(
            user_id=current_user.id,
            title=request.title
        )
        db.add(session)
        await db.commit()
        await db.refresh(session)

        logger.info(f"创建新会话: {session.id}")

        return SessionResponse(
            id=session.id,
            title=session.title,
            created_at=session.created_at,
            last_active_at=session.last_active_at,
            message_count=0,
            pinned=_get_pinned(session)
        )

    except Exception as e:
        logger.error(f"创建会话失败: {e}", exc_info=True)
        await db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/sessions/search", response_model=List[SessionResponse])
async def search_sessions(
    q: str = Query(..., min_length=1),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """按 title 和消息 content 模糊搜索会话"""
    try:
        keyword = f"%{q}%"

        # 搜索标题匹配的会话
        title_stmt = select(Session.id).where(
            Session.user_id == current_user.id,
            Session.title.ilike(keyword)
        )

        # 搜索消息内容匹配的会话
        content_stmt = select(Message.session_id).where(
            Message.user_id == current_user.id,
            Message.content.ilike(keyword)
        ).distinct()

        title_result = await db.execute(title_stmt)
        content_result = await db.execute(content_stmt)

        title_ids = {row[0] for row in title_result}
        content_ids = {row[0] for row in content_result}
        all_ids = title_ids | content_ids

        if not all_ids:
            return []

        # 获取匹配的会话详情
        stmt = select(Session).where(
            Session.id.in_(all_ids)
        ).order_by(desc(Session.last_active_at))

        result = await db.execute(stmt)
        sessions = result.scalars().all()

        session_responses = []
        for session in sessions:
            msg_count_stmt = select(sql_func.count(Message.id)).where(
                Message.session_id == session.id
            )
            msg_result = await db.execute(msg_count_stmt)
            message_count = msg_result.scalar() or 0

            session_responses.append(SessionResponse(
                id=session.id,
                title=session.title,
                created_at=session.created_at,
                last_active_at=session.last_active_at,
                message_count=message_count,
                pinned=_get_pinned(session)
            ))

        return session_responses

    except Exception as e:
        logger.error(f"搜索会话失败: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/sessions", response_model=List[SessionResponse])
async def list_sessions(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """获取用户的会话列表（置顶会话排前面）"""
    try:
        stmt = select(Session).where(
            Session.user_id == current_user.id
        ).order_by(desc(Session.last_active_at))

        result = await db.execute(stmt)
        sessions = result.scalars().all()

        # 获取每个会话的消息数量
        session_responses = []
        for session in sessions:
            msg_count_stmt = select(sql_func.count(Message.id)).where(
                Message.session_id == session.id
            )
            msg_result = await db.execute(msg_count_stmt)
            message_count = msg_result.scalar() or 0

            session_responses.append(SessionResponse(
                id=session.id,
                title=session.title,
                created_at=session.created_at,
                last_active_at=session.last_active_at,
                message_count=message_count,
                pinned=_get_pinned(session)
            ))

        # 置顶会话排前面，其余按 last_active_at 降序
        pinned = [s for s in session_responses if s.pinned]
        unpinned = [s for s in session_responses if not s.pinned]
        return pinned + unpinned

    except Exception as e:
        logger.error(f"获取会话列表失败: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/sessions/{session_id}/messages", response_model=List[MessageResponse])
async def get_session_messages(
    session_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """获取会话的消息历史"""
    try:
        # 验证会话属于当前用户
        stmt = select(Session).where(
            Session.id == session_id,
            Session.user_id == current_user.id
        )
        result = await db.execute(stmt)
        session = result.scalar_one_or_none()

        if not session:
            raise HTTPException(status_code=404, detail="会话不存在")

        # 获取消息列表
        msg_stmt = select(Message).where(
            Message.session_id == session_id
        ).order_by(Message.created_at)

        msg_result = await db.execute(msg_stmt)
        messages = msg_result.scalars().all()

        return [MessageResponse(
            id=msg.id,
            role=msg.role,
            content=msg.content,
            created_at=msg.created_at,
            system_prompt=msg.system_prompt,
            memories_recalled=msg.meta.get("memories_count") if msg.meta else None,
            insights_used=msg.meta.get("insights_count") if msg.meta else None,
            recalled_summaries=_get_recalled_summaries(msg),
            debug_info=_build_debug_info(msg)
        ) for msg in messages]

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"获取消息历史失败: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/sessions/{session_id}/export", response_model=SessionExport)
async def export_session(
    session_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """导出会话（session + messages JSON）"""
    try:
        stmt = select(Session).where(
            Session.id == session_id,
            Session.user_id == current_user.id
        )
        result = await db.execute(stmt)
        session = result.scalar_one_or_none()

        if not session:
            raise HTTPException(status_code=404, detail="会话不存在")

        # 获取消息
        msg_stmt = select(Message).where(
            Message.session_id == session_id
        ).order_by(Message.created_at)
        msg_result = await db.execute(msg_stmt)
        messages = msg_result.scalars().all()

        # 消息数量
        message_count = len(messages)

        session_resp = SessionResponse(
            id=session.id,
            title=session.title,
            created_at=session.created_at,
            last_active_at=session.last_active_at,
            message_count=message_count,
            pinned=_get_pinned(session)
        )

        message_resps = [MessageResponse(
            id=msg.id,
            role=msg.role,
            content=msg.content,
            created_at=msg.created_at,
            system_prompt=msg.system_prompt,
            memories_recalled=msg.meta.get("memories_count") if msg.meta else None,
            insights_used=msg.meta.get("insights_count") if msg.meta else None,
            recalled_summaries=_get_recalled_summaries(msg),
            debug_info=_build_debug_info(msg)
        ) for msg in messages]

        return SessionExport(session=session_resp, messages=message_resps)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"导出会话失败: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.patch("/sessions/{session_id}", response_model=SessionResponse)
async def update_session(
    session_id: str,
    request: SessionUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """更新会话（title 和/或 pinned）"""
    try:
        stmt = select(Session).where(
            Session.id == session_id,
            Session.user_id == current_user.id
        )
        result = await db.execute(stmt)
        session = result.scalar_one_or_none()

        if not session:
            raise HTTPException(status_code=404, detail="会话不存在")

        if request.title is not None:
            session.title = request.title

        if request.pinned is not None:
            meta = session.meta or {}
            meta["pinned"] = request.pinned
            session.meta = meta

        await db.commit()
        await db.refresh(session)

        msg_count_stmt = select(sql_func.count(Message.id)).where(
            Message.session_id == session.id
        )
        msg_result = await db.execute(msg_count_stmt)
        message_count = msg_result.scalar() or 0

        return SessionResponse(
            id=session.id,
            title=session.title,
            created_at=session.created_at,
            last_active_at=session.last_active_at,
            message_count=message_count,
            pinned=_get_pinned(session)
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"更新会话失败: {e}", exc_info=True)
        await db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/sessions/{session_id}")
async def delete_session(
    session_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """删除会话及其所有消息（CASCADE）"""
    try:
        stmt = select(Session).where(
            Session.id == session_id,
            Session.user_id == current_user.id
        )
        result = await db.execute(stmt)
        session = result.scalar_one_or_none()

        if not session:
            raise HTTPException(status_code=404, detail="会话不存在")

        await db.delete(session)
        await db.commit()

        logger.info(f"删除会话: {session_id}")
        return {"detail": "会话已删除"}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"删除会话失败: {e}", exc_info=True)
        await db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/sessions/{session_id}/generate-title")
async def generate_title(
    session_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """用第一条用户消息截取前20字作标题"""
    try:
        stmt = select(Session).where(
            Session.id == session_id,
            Session.user_id == current_user.id
        )
        result = await db.execute(stmt)
        session = result.scalar_one_or_none()

        if not session:
            raise HTTPException(status_code=404, detail="会话不存在")

        # 获取第一条用户消息
        msg_stmt = select(Message).where(
            Message.session_id == session_id,
            Message.role == "user"
        ).order_by(Message.created_at).limit(1)

        msg_result = await db.execute(msg_stmt)
        first_msg = msg_result.scalar_one_or_none()

        if not first_msg:
            return {"title": "新对话"}

        # 截取前20字作为标题
        title = first_msg.content[:20]
        if len(first_msg.content) > 20:
            title += "..."

        session.title = title
        await db.commit()

        logger.info(f"生成会话标题: {session_id} -> {title}")
        return {"title": title}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"生成标题失败: {e}", exc_info=True)
        await db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/", response_model=ChatResponse)
async def chat(
    request: ChatRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """发送聊天消息

    需要 JWT 认证。user_id 从 token 中获取。
    如果不提供 session_id，会自动创建新会话。
    """
    try:
        # 如果没有提供 session_id，创建新会话
        session_id = request.session_id
        if not session_id:
            session = Session(user_id=current_user.id)
            db.add(session)
            await db.flush()
            session_id = session.id
            logger.info(f"自动创建新会话: {session_id}")
        else:
            # 验证会话存在且属于当前用户
            stmt = select(Session).where(
                Session.id == session_id,
                Session.user_id == current_user.id
            )
            result = await db.execute(stmt)
            session = result.scalar_one_or_none()

            if not session:
                raise HTTPException(status_code=404, detail="会话不存在")

        # 调用对话引擎
        result = await conversation_engine.chat(
            user_id=current_user.id,
            session_id=session_id,
            message=request.message,
            db=db,
            debug_mode=request.debug_mode
        )

        if "error" in result:
            raise HTTPException(status_code=500, detail=result["error"])

        response = ChatResponse(
            response=result["response"],
            session_id=session_id,
            memories_recalled=result["memories_recalled"],
            insights_used=result["insights_used"],
            history_messages_count=result.get("history_messages_count", 0)
        )

        # 添加调试信息
        if request.debug_mode and "debug_info" in result:
            response.debug_info = result["debug_info"]

        return response

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"聊天处理失败: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/stream")
async def chat_stream(
    request: ChatRequest,
    current_user: User = Depends(get_current_user),
):
    """流式聊天接口（SSE）

    返回 Server-Sent Events 流式响应，实时推送生成的内容。
    注：不使用 Depends(get_db)，而是在 generator 内部管理 session，
    确保客户端断开时连接能正确归还连接池。

    事件类型：
    - token: 生成的文本片段
    - done: 生成完成，包含完整响应和调试信息
    - error: 错误信息
    """
    async def event_generator():
        from app.db.database import AsyncSessionLocal

        async with AsyncSessionLocal() as db:
            try:
                # 验证或创建会话
                session_id = request.session_id
                is_new_session = not session_id
                if not session_id:
                    session = Session(user_id=current_user.id)
                    db.add(session)
                    await db.flush()
                    session_id = session.id
                    logger.info(f"自动创建新会话: {session_id}")
                else:
                    stmt = select(Session).where(
                        Session.id == session_id,
                        Session.user_id == current_user.id
                    )
                    result = await db.execute(stmt)
                    session = result.scalar_one_or_none()
                    if not session:
                        yield f"data: {json.dumps({'type': 'error', 'error': '会话不存在'})}\n\n"
                        return

                # 调用流式对话引擎
                async for chunk in conversation_engine.chat_stream(
                    user_id=current_user.id,
                    session_id=session_id,
                    message=request.message,
                    db=db,
                    debug_mode=request.debug_mode
                ):
                    # chunk可能是字符串（token）或字典（done/error）
                    if isinstance(chunk, str):
                        # 文本token
                        yield f"data: {json.dumps({'type': 'token', 'content': chunk})}\n\n"
                    elif isinstance(chunk, dict):
                        # 完成事件：注入 session_title 和 is_new_session
                        if chunk.get("type") == "done":
                            # 获取会话标题
                            sess_stmt = select(Session).where(Session.id == session_id)
                            sess_result = await db.execute(sess_stmt)
                            sess = sess_result.scalar_one_or_none()
                            chunk["session_title"] = sess.title if sess else None
                            chunk["is_new_session"] = is_new_session
                        yield f"data: {json.dumps(chunk)}\n\n"

            except Exception as e:
                logger.error(f"流式聊天失败: {e}", exc_info=True)
                yield f"data: {json.dumps({'type': 'error', 'error': str(e)})}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"  # 禁用nginx缓冲
        }
    )

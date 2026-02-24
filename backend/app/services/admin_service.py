"""
Admin Service - 管理后台业务逻辑
提供仪表盘统计、用户管理等功能
"""
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from sqlalchemy import select, func, and_, text, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import User, Session, Message


class AdminService:
    """管理后台服务"""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_dashboard_stats(self) -> dict[str, Any]:
        """获取仪表盘全局统计"""
        now = datetime.now(timezone.utc)
        seven_days_ago = now - timedelta(days=7)

        # 用户统计
        total_users_result = await self.db.execute(select(func.count(User.id)))
        total_users = total_users_result.scalar() or 0

        active_users_result = await self.db.execute(
            select(func.count(User.id)).where(User.last_login >= seven_days_ago)
        )
        active_users_7d = active_users_result.scalar() or 0

        admin_count_result = await self.db.execute(
            select(func.count(User.id)).where(User.is_admin == True)  # noqa: E712
        )
        admin_count = admin_count_result.scalar() or 0

        # 会话统计
        total_sessions_result = await self.db.execute(select(func.count(Session.id)))
        total_sessions = total_sessions_result.scalar() or 0

        active_sessions_result = await self.db.execute(
            select(func.count(Session.id)).where(
                Session.last_active_at >= seven_days_ago
            )
        )
        active_sessions_7d = active_sessions_result.scalar() or 0

        # 消息统计
        total_messages_result = await self.db.execute(select(func.count(Message.id)))
        total_messages = total_messages_result.scalar() or 0

        messages_7d_result = await self.db.execute(
            select(func.count(Message.id)).where(
                Message.created_at >= seven_days_ago
            )
        )
        messages_7d = messages_7d_result.scalar() or 0

        # 记忆统计
        memory_stats = await self._get_memory_stats()

        return {
            "users": {
                "total": total_users,
                "active_7d": active_users_7d,
                "admin_count": admin_count,
            },
            "sessions": {
                "total": total_sessions,
                "active_7d": active_sessions_7d,
            },
            "messages": {
                "total": total_messages,
                "last_7d": messages_7d,
            },
            "memories": memory_stats,
        }

    async def _get_memory_stats(self) -> dict[str, Any]:
        """查询 NeuroMemory embeddings 表获取记忆统计"""
        stats: dict[str, Any] = {
            "total": 0,
            "by_type": {},
            "graph_nodes": 0,
            "graph_edges": 0,
        }

        # 查询 embeddings 表 (NeuroMemory 管理的表)
        try:
            result = await self.db.execute(
                text("SELECT memory_type, COUNT(*) as cnt FROM embeddings GROUP BY memory_type")
            )
            rows = result.fetchall()
            total = 0
            by_type = {}
            for row in rows:
                memory_type = row[0] or "unknown"
                count = row[1]
                by_type[memory_type] = count
                total += count
            stats["total"] = total
            stats["by_type"] = by_type
        except Exception:
            # embeddings 表可能不存在
            pass

        # 查询 graph 相关表
        try:
            result = await self.db.execute(text("SELECT COUNT(*) FROM graph_nodes"))
            stats["graph_nodes"] = result.scalar() or 0
        except Exception:
            pass

        try:
            result = await self.db.execute(text("SELECT COUNT(*) FROM graph_edges"))
            stats["graph_edges"] = result.scalar() or 0
        except Exception:
            pass

        return stats

    async def get_user_list(
        self, limit: int = 20, offset: int = 0
    ) -> dict[str, Any]:
        """获取用户列表（分页），附带每个用户的统计信息"""
        # 总数
        total_result = await self.db.execute(select(func.count(User.id)))
        total = total_result.scalar() or 0

        # 用户列表
        users_result = await self.db.execute(
            select(User)
            .order_by(desc(User.created_at))
            .limit(limit)
            .offset(offset)
        )
        users = users_result.scalars().all()

        items = []
        for user in users:
            # 每个用户的会话数
            session_count_result = await self.db.execute(
                select(func.count(Session.id)).where(Session.user_id == user.id)
            )
            session_count = session_count_result.scalar() or 0

            # 每个用户的消息数
            message_count_result = await self.db.execute(
                select(func.count(Message.id)).where(Message.user_id == user.id)
            )
            message_count = message_count_result.scalar() or 0

            items.append({
                "id": user.id,
                "username": user.username,
                "email": user.email,
                "is_admin": user.is_admin,
                "created_at": user.created_at.isoformat() if user.created_at else None,
                "last_login": user.last_login.isoformat() if user.last_login else None,
                "session_count": session_count,
                "message_count": message_count,
            })

        return {
            "total": total,
            "limit": limit,
            "offset": offset,
            "items": items,
        }

    async def get_user_detail(self, user_id: str) -> Optional[dict[str, Any]]:
        """获取单个用户的详细信息，包括最近会话"""
        # 查询用户
        user_result = await self.db.execute(
            select(User).where(User.id == user_id)
        )
        user = user_result.scalar_one_or_none()
        if not user:
            return None

        # 会话数
        session_count_result = await self.db.execute(
            select(func.count(Session.id)).where(Session.user_id == user_id)
        )
        session_count = session_count_result.scalar() or 0

        # 消息数
        message_count_result = await self.db.execute(
            select(func.count(Message.id)).where(Message.user_id == user_id)
        )
        message_count = message_count_result.scalar() or 0

        # 最近 10 个会话
        recent_sessions_result = await self.db.execute(
            select(Session)
            .where(Session.user_id == user_id)
            .order_by(desc(Session.last_active_at))
            .limit(10)
        )
        recent_sessions = recent_sessions_result.scalars().all()

        sessions_data = []
        for s in recent_sessions:
            # 每个会话的消息数
            msg_count_result = await self.db.execute(
                select(func.count(Message.id)).where(Message.session_id == s.id)
            )
            msg_count = msg_count_result.scalar() or 0

            # 会话标题：优先用 title 字段，其次从 meta 中取
            title = s.title
            if not title and s.meta and isinstance(s.meta, dict):
                title = s.meta.get("title", "Untitled")
            title = title or "Untitled"

            sessions_data.append({
                "id": s.id,
                "title": title,
                "created_at": s.created_at.isoformat() if s.created_at else None,
                "last_active_at": s.last_active_at.isoformat() if s.last_active_at else None,
                "is_active": s.is_active,
                "message_count": msg_count,
            })

        # 用户记忆统计
        memory_count = 0
        try:
            result = await self.db.execute(
                text("SELECT COUNT(*) FROM embeddings WHERE user_id = :uid"),
                {"uid": user_id},
            )
            memory_count = result.scalar() or 0
        except Exception:
            pass

        return {
            "id": user.id,
            "username": user.username,
            "email": user.email,
            "is_admin": user.is_admin,
            "created_at": user.created_at.isoformat() if user.created_at else None,
            "updated_at": user.updated_at.isoformat() if user.updated_at else None,
            "last_login": user.last_login.isoformat() if user.last_login else None,
            "session_count": session_count,
            "message_count": message_count,
            "memory_count": memory_count,
            "recent_sessions": sessions_data,
        }

    async def update_user(
        self,
        user_id: str,
        current_admin_id: str,
        updates: dict[str, Any],
    ) -> Optional[dict[str, Any]]:
        """
        更新用户属性（目前仅支持 is_admin）。
        安全守卫：不能移除自己的管理员权限。
        """
        # 查询目标用户
        user_result = await self.db.execute(
            select(User).where(User.id == user_id)
        )
        user = user_result.scalar_one_or_none()
        if not user:
            return None

        # 安全守卫：不能移除自己的 admin 权限
        if "is_admin" in updates:
            if user_id == current_admin_id and not updates["is_admin"]:
                raise ValueError("Cannot remove your own admin status")
            user.is_admin = bool(updates["is_admin"])

        await self.db.commit()
        await self.db.refresh(user)

        return {
            "id": user.id,
            "username": user.username,
            "email": user.email,
            "is_admin": user.is_admin,
            "updated_at": user.updated_at.isoformat() if user.updated_at else None,
        }

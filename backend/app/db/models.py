"""
数据库模型定义
"""
from sqlalchemy import Column, String, DateTime, Boolean, Text, ForeignKey, JSON
from sqlalchemy.sql import func
from app.db.database import Base
import uuid


def generate_uuid():
    """生成 UUID"""
    return str(uuid.uuid4())


class User(Base):
    """用户表"""
    __tablename__ = "users"

    id = Column(String, primary_key=True, default=generate_uuid)
    username = Column(String(100), unique=True, nullable=False, index=True)
    email = Column(String(255), unique=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    last_login = Column(DateTime(timezone=True), nullable=True)
    is_admin = Column(Boolean, default=False, nullable=False)


class Session(Base):
    """会话表 - 管理用户的对话会话"""
    __tablename__ = "sessions"

    id = Column(String, primary_key=True, default=generate_uuid)
    user_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    title = Column(String(200), nullable=True)  # 会话标题
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    last_active_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)
    is_active = Column(Boolean, default=True, nullable=False)
    meta = Column(JSON, nullable=True)  # 额外元数据（标签、置顶等）


class Message(Base):
    """消息表 - 存储完整的对话上下文（包括 prompt 和召回的记忆）"""
    __tablename__ = "messages"

    id = Column(String, primary_key=True, default=generate_uuid)
    session_id = Column(String, ForeignKey("sessions.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    role = Column(String(20), nullable=False)  # 'user' | 'assistant'

    # 核心内容
    content = Column(Text, nullable=False)  # 用户消息 或 AI 回复

    # AI 回复时的上下文（仅 role='assistant' 时有值）
    system_prompt = Column(Text, nullable=True)  # 完整的 system prompt
    recalled_memories = Column(JSON, nullable=True)  # 召回的记忆列表
    insights_used = Column(JSON, nullable=True)  # 使用的洞察列表

    # 元数据
    meta = Column(JSON, nullable=True)  # memories_count, temperature, tokens 等

    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)

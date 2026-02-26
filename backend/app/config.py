"""
配置管理模块
"""
from pydantic_settings import BaseSettings
from pydantic import model_validator, field_validator
from typing import List
import os
from pathlib import Path


class Settings(BaseSettings):
    """应用配置"""

    # App
    APP_NAME: str = "Me2"
    APP_VERSION: str = "0.2.0"
    DEBUG: bool = True
    SECRET_KEY: str = "change-me-in-production"
    ADMIN_DEFAULT_PASSWORD: str = "change-me-in-production"

    # Database (Me2 用户表 + neuromem 共用)
    # Railway 提供 postgresql://... 格式，需要转为 postgresql+asyncpg://...
    DATABASE_URL: str = "postgresql+asyncpg://me2_user:me2_secure_password_2026@localhost:5434/me2db"

    @model_validator(mode="after")
    def fix_database_url(self):
        """Railway 的 DATABASE_URL 是 postgresql://，需要转为 asyncpg 驱动"""
        url = self.DATABASE_URL
        if url.startswith("postgresql://"):
            self.DATABASE_URL = url.replace("postgresql://", "postgresql+asyncpg://", 1)
        elif url.startswith("postgres://"):
            self.DATABASE_URL = url.replace("postgres://", "postgresql+asyncpg://", 1)
        return self

    # JWT 认证
    JWT_SECRET: str = "change-me-in-production-use-random-string"
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRE_DAYS: int = 7

    # LLM (OpenRouter - DeepSeek)
    DEEPSEEK_API_KEY: str = ""  # OpenRouter API Key，需要配置
    DEEPSEEK_BASE_URL: str = "https://openrouter.ai/api/v1"
    DEEPSEEK_MODEL: str = "deepseek/deepseek-v3.2"

    # Embedding API (OpenRouter - OpenAI)
    OPENAI_API_KEY: str = ""  # OpenRouter API Key，不配置则使用 DEEPSEEK_API_KEY
    OPENAI_BASE_URL: str = "https://openrouter.ai/api/v1"

    # Embedding
    EMBEDDING_PROVIDER: str = "remote"  # "local" | "remote" | "auto"
    EMBEDDING_MODEL: str = "BAAI/bge-small-zh-v1.5"  # 本地模型名称（EMBEDDING_PROVIDER=local 时）
    EMBEDDING_DIMENSIONS: int = 512  # 本地模型维度
    REMOTE_EMBEDDING_MODEL: str = "openai/text-embedding-3-small"
    REMOTE_EMBEDDING_DIMENSIONS: int = 1536

    # neuromem 配置
    NEUROMEMORY_EXTRACTION_INTERVAL: int = 1  # 每条用户消息都异步提取记忆
    NEUROMEMORY_REFLECTION_INTERVAL: int = 20  # 每 20 次提取后反思（即每 20 条消息）
    NEUROMEMORY_IDLE_TIMEOUT: int = 600  # 闲置 10 分钟后自动提取和反思
    NEUROMEMORY_GRAPH_ENABLED: bool = True  # 启用知识图谱

    # CORS
    ALLOWED_ORIGINS: List[str] = [
        "http://localhost:3000", "http://127.0.0.1:3000",
        "http://localhost:3001", "http://127.0.0.1:3001",
        "http://localhost:3333", "http://127.0.0.1:3333",
        "https://me2.up.railway.app",
    ]

    @field_validator("ALLOWED_ORIGINS", mode="before")
    @classmethod
    def parse_allowed_origins(cls, v):
        if isinstance(v, str):
            return [s.strip() for s in v.split(",") if s.strip()]
        return v

    # 主动关心
    PROACTIVE_CHECK_INTERVAL: int = 3600  # 每小时检查一次（未来功能）

    class Config:
        env_file = ".env"
        case_sensitive = True


# 全局配置实例
settings = Settings()



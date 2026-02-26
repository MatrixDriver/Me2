"""OpenAI 兼容的 Embedding Provider（远程 API，无需 torch）"""
import time
import logging
from typing import List

from neuromem.providers import EmbeddingProvider
from openai import AsyncOpenAI
from app.services.metrics_collector import MetricsCollector

logger = logging.getLogger(__name__)


class OpenAIEmbedding(EmbeddingProvider):
    """使用 OpenAI API 的 Embedding Provider

    支持 OpenAI、DeepSeek 等兼容 OpenAI API 的服务
    无需本地模型，避免 torch 依赖
    """

    def __init__(
        self,
        api_key: str,
        base_url: str = "https://api.openai.com/v1",
        model: str = "text-embedding-3-small",
        dimensions: int = 1536
    ):
        """初始化 OpenAI Embedding Provider

        Args:
            api_key: API 密钥
            base_url: API 基础 URL
            model: embedding 模型名称
            dimensions: embedding 维度
        """
        self.client = AsyncOpenAI(api_key=api_key, base_url=base_url)
        self.model = model
        self._dims = dimensions
        logger.info(f"使用远程 Embedding: {model} (维度: {dimensions})")

    async def embed(self, text: str) -> List[float]:
        """生成单个文本的 embedding（NeuroMemory 接口）

        Args:
            text: 单个文本

        Returns:
            embedding 向量
        """
        start = time.time()
        try:
            response = await self.client.embeddings.create(
                input=[text],
                model=self.model
            )
            duration_ms = (time.time() - start) * 1000
            MetricsCollector().record_embedding(self.model, 1, duration_ms, True)
            return response.data[0].embedding
        except Exception as e:
            duration_ms = (time.time() - start) * 1000
            MetricsCollector().record_embedding(self.model, 1, duration_ms, False)
            logger.error(f"生成 embedding 失败: {e}")
            raise

    async def embed_batch(self, texts: List[str]) -> List[List[float]]:
        """批量生成 embedding（NeuroMemory 接口）

        Args:
            texts: 文本列表

        Returns:
            embedding 向量列表
        """
        start = time.time()
        try:
            response = await self.client.embeddings.create(
                input=texts,
                model=self.model
            )
            duration_ms = (time.time() - start) * 1000
            MetricsCollector().record_embedding(self.model, len(texts), duration_ms, True)
            return [item.embedding for item in response.data]
        except Exception as e:
            duration_ms = (time.time() - start) * 1000
            MetricsCollector().record_embedding(self.model, len(texts), duration_ms, False)
            logger.error(f"批量生成 embedding 失败: {e}")
            raise

    @property
    def dims(self) -> int:
        """返回 embedding 维度（NeuroMemory 接口）"""
        return self._dims

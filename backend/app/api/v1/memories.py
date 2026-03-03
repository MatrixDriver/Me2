"""记忆管理 API — 与 neuromem 数据模型对齐"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timedelta
import logging

from app.dependencies.auth import get_current_user
from app.db.models import User

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/memories", tags=["记忆管理"])


# ── Request / Response Models ──────────────────────────────────────────

class SearchRequest(BaseModel):
    query: str
    limit: int = 20
    threshold: float = 0.7
    memory_type: Optional[str] = None


class CorrectionRequest(BaseModel):
    correction: str


class UpdateMemoryRequest(BaseModel):
    content: Optional[str] = None
    memory_type: Optional[str] = None


class ProfileUpdateRequest(BaseModel):
    value: object  # str | list | dict


class PreferenceCreateRequest(BaseModel):
    key: str
    value: object


# ── Helpers ────────────────────────────────────────────────────────────

def _get_nm():
    from app.main import nm
    return nm


# ── Fixed-path endpoints (MUST be declared before /{memory_id}) ───────

# -- Profile --

@router.get("/profile")
async def get_profile(current_user: User = Depends(get_current_user)):
    """获取用户档案 (key_values namespace=profile)"""
    try:
        nm = _get_nm()
        items = await nm.kv.list(current_user.id, "profile")
        profile = {item.key: item.value for item in items}
        return {"profile": profile}
    except Exception as e:
        logger.error(f"获取档案失败: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/profile/{key}")
async def update_profile_key(
    key: str,
    request: ProfileUpdateRequest,
    current_user: User = Depends(get_current_user),
):
    """更新档案某个字段"""
    try:
        nm = _get_nm()
        await nm.kv.set(current_user.id, "profile", key, request.value)
        return {"success": True, "key": key}
    except Exception as e:
        logger.error(f"更新档案失败: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


# -- Preferences --

@router.get("/preferences")
async def get_preferences(current_user: User = Depends(get_current_user)):
    """获取用户偏好列表"""
    try:
        nm = _get_nm()
        items = await nm.kv.list(current_user.id, "preferences")
        prefs = [
            {"key": item.key, "value": item.value}
            for item in items
        ]
        return {"preferences": prefs}
    except Exception as e:
        logger.error(f"获取偏好失败: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/preferences")
async def create_preference(
    request: PreferenceCreateRequest,
    current_user: User = Depends(get_current_user),
):
    """创建/更新偏好"""
    try:
        nm = _get_nm()
        await nm.kv.set(current_user.id, "preferences", request.key, request.value)
        return {"success": True, "key": request.key}
    except Exception as e:
        logger.error(f"创建偏好失败: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/preferences/{key}")
async def delete_preference(
    key: str,
    current_user: User = Depends(get_current_user),
):
    """删除偏好"""
    try:
        nm = _get_nm()
        deleted = await nm.kv.delete(current_user.id, "preferences", key)
        if not deleted:
            raise HTTPException(status_code=404, detail="偏好不存在")
        return {"success": True}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"删除偏好失败: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


# -- Graph --

@router.get("/graph")
async def get_knowledge_graph(
    current_user: User = Depends(get_current_user),
    limit: int = 200,
):
    """获取真实知识图谱 (graph_nodes + graph_edges)"""
    try:
        nm = _get_nm()
        from neuromem.models.graph import GraphNode, GraphEdge
        from sqlalchemy import select

        async with nm._db.session() as session:
            # 查询节点
            node_rows = (
                await session.execute(
                    select(GraphNode)
                    .where(GraphNode.user_id == current_user.id)
                    .limit(limit)
                )
            ).scalars().all()

            # 查询边
            edge_rows = (
                await session.execute(
                    select(GraphEdge)
                    .where(GraphEdge.user_id == current_user.id)
                    .limit(limit * 2)
                )
            ).scalars().all()

            # 在 session 内序列化，避免 lazy loading 失败
            node_key_to_cy_id = {}
            nodes = []
            for n in node_rows:
                cy_id = f"{n.node_type}:{n.node_id}"
                node_key_to_cy_id[(n.node_type, n.node_id)] = cy_id
                nodes.append({
                    "data": {
                        "id": cy_id,
                        "label": (n.properties or {}).get("name", n.node_id),
                        "type": n.node_type.lower(),
                        "node_type": n.node_type,
                        "node_id": n.node_id,
                        "properties": n.properties or {},
                        "db_id": str(n.id),
                    }
                })

            edges = []
            for e in edge_rows:
                src = node_key_to_cy_id.get((e.source_type, e.source_id))
                tgt = node_key_to_cy_id.get((e.target_type, e.target_id))
                if src and tgt:
                    props = e.properties or {}
                    valid_until = props.get("valid_until")
                    if valid_until:
                        continue
                    edges.append({
                        "data": {
                            "id": str(e.id),
                            "source": src,
                            "target": tgt,
                            "label": e.edge_type,
                            "edge_type": e.edge_type,
                        }
                    })

        return {
            "elements": {"nodes": nodes, "edges": edges},
            "total_nodes": len(nodes),
            "total_edges": len(edges),
        }
    except Exception as e:
        logger.error(f"获取知识图谱失败: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/graph/nodes/{node_type}/{node_id}")
async def delete_graph_node(
    node_type: str,
    node_id: str,
    current_user: User = Depends(get_current_user),
):
    """删除图谱节点（及其关联边）"""
    try:
        nm = _get_nm()
        await nm.graph.delete_node(current_user.id, node_type, node_id)
        return {"success": True}
    except Exception as e:
        logger.error(f"删除节点失败: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/graph/edges/{edge_id}")
async def delete_graph_edge(
    edge_id: str,
    current_user: User = Depends(get_current_user),
):
    """删除图谱边"""
    try:
        nm = _get_nm()
        from neuromem.models.graph import GraphEdge
        from sqlalchemy import select
        import uuid

        async with nm._db.session() as session:
            result = await session.execute(
                select(GraphEdge).where(
                    GraphEdge.id == uuid.UUID(edge_id),
                    GraphEdge.user_id == current_user.id,
                )
            )
            edge = result.scalar_one_or_none()
            if not edge:
                raise HTTPException(status_code=404, detail="边不存在")
            await session.delete(edge)
            await session.commit()

        return {"success": True}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"删除边失败: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


# -- Delete All --

@router.delete("/all")
async def delete_all_memories(
    memory_type: Optional[str] = None,
    current_user: User = Depends(get_current_user),
):
    """清除所有记忆（可按类型过滤）"""
    try:
        nm = _get_nm()
        from neuromem.services.memory import MemoryService
        from neuromem.models.graph import GraphEdge
        from sqlalchemy import delete

        async with nm._db.session() as session:
            svc = MemoryService(session)
            deleted_count = await svc.delete_all_memories(
                current_user.id, memory_type=memory_type
            )

            # 同时清除关联的 graph edges
            if not memory_type:
                edge_stmt = delete(GraphEdge).where(
                    GraphEdge.user_id == current_user.id
                )
                await session.execute(edge_stmt)

            await session.commit()

        return {"success": True, "deleted_count": deleted_count}
    except Exception as e:
        logger.error(f"清除所有记忆失败: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/reset-all")
async def reset_all_user_data(
    current_user: User = Depends(get_current_user),
):
    """清除用户所有 AI 记忆数据（via nm.delete_user_data）"""
    try:
        nm = _get_nm()
        result = await nm.delete_user_data(current_user.id)
        return {
            "success": True,
            "deleted": result.get("deleted", {}),
        }
    except Exception as e:
        logger.error(f"重置所有数据失败: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


# -- Stats --

@router.get("/stats")
async def get_memory_stats(current_user: User = Depends(get_current_user)):
    """获取记忆统计信息（via nm.stats）"""
    try:
        nm = _get_nm()
        stats = await nm.stats(current_user.id)

        try:
            from importlib.metadata import version as pkg_version
            nm_version = pkg_version("neuromem")
        except Exception:
            nm_version = "unknown"

        total = stats.get("total", 0)
        by_type = stats.get("by_type", {})

        # 从 by_week 计算最近 7 天近似值
        by_week = stats.get("by_week", [])
        recent_count = by_week[-1]["count"] if by_week else 0

        return {
            "total": total,
            "by_type": by_type,
            "recent_7_days_total": recent_count,
            "avg_per_day": round(recent_count / 7, 1) if recent_count > 0 else 0,
            "active_entities": stats.get("active_entities", 0),
            "neuromem_version": nm_version,
        }
    except Exception as e:
        logger.error(f"获取统计信息失败: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


# -- Search --

@router.post("/search")
async def search_memories(
    request: SearchRequest,
    current_user: User = Depends(get_current_user),
):
    """语义搜索记忆（via nm.recall）"""
    try:
        nm = _get_nm()
        result = await nm.recall(
            user_id=current_user.id,
            query=request.query,
            limit=request.limit,
            memory_type=request.memory_type,
        )
        memories = result.get("merged", [])
        # Use vector_score (cosine similarity 0~1) for display if available
        for m in memories:
            if "vector_score" in m:
                m["score"] = m["vector_score"]
        filtered = [m for m in memories if m.get("score", 0) >= request.threshold]
        return {"memories": filtered, "query": request.query, "count": len(filtered)}
    except Exception as e:
        logger.error(f"搜索记忆失败: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


# -- Recent / Timeline --

@router.get("/recent")
async def get_recent_memories_endpoint(
    current_user: User = Depends(get_current_user),
    days: int = 30,
    limit: int = 100,
    memory_type: Optional[str] = None,
):
    """获取最近的记忆"""
    try:
        nm = _get_nm()
        types = [memory_type] if memory_type else None
        mems = await nm.get_recent_memories(
            current_user.id, days=days, memory_types=types, limit=limit
        )

        memories = []
        for m in mems:
            memories.append({
                "id": str(m.id),
                "content": m.content,
                "memory_type": m.memory_type or "general",
                "timestamp": m.extracted_timestamp.isoformat() if m.extracted_timestamp else None,
                "created_at": m.extracted_timestamp.isoformat() if m.extracted_timestamp else None,
                "metadata": m.metadata_ or {},
                "access_count": m.access_count,
            })

        return {"memories": memories, "days": days}
    except Exception as e:
        logger.error(f"获取最近记忆失败: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/timeline")
async def get_timeline(
    current_user: User = Depends(get_current_user),
    granularity: str = "day",
    days: int = 30,
):
    """获取时间线"""
    try:
        nm = _get_nm()
        from neuromem.services.memory import MemoryService

        async with nm._db.session() as session:
            svc = MemoryService(session)
            result = await svc.get_memory_timeline(
                current_user.id,
                start_date=datetime.now() - timedelta(days=days),
                end_date=datetime.now(),
                granularity=granularity,
            )

        return {"timeline": result.get("timeline", []), "granularity": granularity}
    except Exception as e:
        logger.error(f"获取时间线失败: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


# -- Correct --

@router.post("/correct")
async def conversational_correct(
    request: CorrectionRequest,
    current_user: User = Depends(get_current_user),
):
    """对话式纠正"""
    try:
        nm = _get_nm()
        from app.services.llm_client import LLMClient
        import json

        user_id = current_user.id
        llm = LLMClient()

        prompt = f"""用户说："{request.correction}"

请分析这句话，提取以下信息（JSON 格式）：
- old_value: 旧的错误值
- new_value: 新的正确值
- entity_type: 实体类型（人物、地点、偏好等）
- search_query: 用于搜索相关记忆的查询词

只返回 JSON，不要其他内容。"""

        response = await llm.generate(prompt=prompt, temperature=0.3, max_tokens=200)

        try:
            correction_info = json.loads(response.strip())
        except Exception:
            correction_info = {
                "old_value": "",
                "new_value": request.correction,
                "entity_type": "信息",
                "search_query": request.correction,
            }

        search_query = correction_info.get("search_query", request.correction)
        recall_result = await nm.recall(user_id=user_id, query=search_query, limit=10)
        related = recall_result.get("merged", [])

        await nm._add_memory(
            user_id=user_id,
            content=request.correction,
            memory_type="fact",
            metadata={
                "correction_info": correction_info,
                "affected_memories": [m.get("id") for m in related[:5]],
            },
        )

        return {
            "success": True,
            "message": "纠正已记录",
            "affected_memories": len(related),
            "correction_info": correction_info,
        }
    except Exception as e:
        logger.error(f"对话式纠正失败: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


# ── Parameterized endpoints (/{memory_id}) ────────────────────────────

@router.get("/")
async def get_memories(
    current_user: User = Depends(get_current_user),
    limit: int = 50,
    offset: int = 0,
    memory_type: Optional[str] = None,
):
    """获取记忆列表（真实分页）"""
    try:
        nm = _get_nm()
        from neuromem.services.memory import MemoryService

        async with nm._db.session() as session:
            svc = MemoryService(session)
            total, mems = await svc.list_all_memories(
                current_user.id,
                memory_type=memory_type,
                limit=limit,
                offset=offset,
            )

            # 在 session 内序列化，避免 lazy loading 失败
            items = []
            for m in mems:
                items.append({
                    "id": str(m.id),
                    "content": m.content,
                    "memory_type": m.memory_type or "general",
                    "timestamp": m.extracted_timestamp.isoformat() if m.extracted_timestamp else None,
                    "created_at": m.extracted_timestamp.isoformat() if m.extracted_timestamp else None,
                    "metadata": m.metadata_ or {},
                    "access_count": m.access_count,
                })

        return {"total": total, "items": items, "limit": limit, "offset": offset}
    except Exception as e:
        logger.error(f"获取记忆失败: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{memory_id}")
async def get_memory(
    memory_id: str,
    current_user: User = Depends(get_current_user),
):
    """获取单个记忆详情"""
    try:
        nm = _get_nm()
        from neuromem.services.memory import MemoryService

        async with nm._db.session() as session:
            svc = MemoryService(session)
            m = await svc.get_memory_by_id(memory_id, current_user.id)

            if not m:
                raise HTTPException(status_code=404, detail="记忆不存在")

            return {
                "id": str(m.id),
                "content": m.content,
                "memory_type": m.memory_type or "general",
                "timestamp": m.extracted_timestamp.isoformat() if m.extracted_timestamp else None,
                "created_at": m.extracted_timestamp.isoformat() if m.extracted_timestamp else None,
                "metadata": m.metadata_ or {},
                "access_count": m.access_count,
                "last_accessed_at": m.last_accessed_at.isoformat() if m.last_accessed_at else None,
                "user_id": m.user_id,
            }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"获取记忆详情失败: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/{memory_id}")
async def update_memory(
    memory_id: str,
    request: UpdateMemoryRequest,
    current_user: User = Depends(get_current_user),
):
    """更新记忆（真实更新）"""
    try:
        nm = _get_nm()
        from neuromem.services.memory import MemoryService

        async with nm._db.session() as session:
            svc = MemoryService(session, embedding=nm._embedding)
            updated = await svc.update_memory(
                memory_id=memory_id,
                user_id=current_user.id,
                content=request.content,
                memory_type=request.memory_type,
            )

            if not updated:
                raise HTTPException(status_code=404, detail="记忆不存在")

            return {"success": True, "message": "记忆已更新", "id": str(updated.id)}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"更新记忆失败: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{memory_id}")
async def delete_memory(
    memory_id: str,
    current_user: User = Depends(get_current_user),
):
    """删除记忆（物理删除）"""
    try:
        nm = _get_nm()
        from neuromem.services.memory import MemoryService

        async with nm._db.session() as session:
            svc = MemoryService(session)
            deleted = await svc.delete_memory(memory_id, current_user.id)

        if not deleted:
            raise HTTPException(status_code=404, detail="记忆不存在")

        return {"success": True, "message": "记忆已删除"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"删除记忆失败: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

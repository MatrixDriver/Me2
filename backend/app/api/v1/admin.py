"""Admin API endpoints."""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.models import User
from app.dependencies.admin import require_admin
from app.dependencies import get_db
from app.services.admin_service import AdminService
from app.services.metrics_collector import MetricsCollector

router = APIRouter(prefix="/admin", tags=["管理"])


# --- Dashboard ---

@router.get("/dashboard")
async def get_dashboard(
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    svc = AdminService(db)
    return await svc.get_dashboard_stats()


# --- Users ---

@router.get("/users")
async def list_users(
    limit: int = 50,
    offset: int = 0,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    svc = AdminService(db)
    return await svc.get_user_list(limit=limit, offset=offset)


@router.get("/users/{user_id}")
async def get_user_detail(
    user_id: str,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    svc = AdminService(db)
    result = await svc.get_user_detail(user_id)
    if not result:
        raise HTTPException(status_code=404, detail="User not found")
    return result


class UserUpdateRequest(BaseModel):
    is_admin: bool | None = None


@router.put("/users/{user_id}")
async def update_user(
    user_id: str,
    body: UserUpdateRequest,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    svc = AdminService(db)
    updates = body.model_dump(exclude_none=True)
    if not updates:
        raise HTTPException(status_code=400, detail="No updates provided")
    try:
        result = await svc.update_user(user_id, admin.id, updates)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    if not result:
        raise HTTPException(status_code=404, detail="User not found")
    return result


# --- User data management ---

@router.delete("/users/{user_id}")
async def delete_user(
    user_id: str,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    svc = AdminService(db)
    try:
        result = await svc.delete_user(user_id, admin.id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    if not result:
        raise HTTPException(status_code=404, detail="User not found")
    return result


@router.delete("/users/{user_id}/data")
async def clear_user_data(
    user_id: str,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    svc = AdminService(db)
    result = await svc.clear_user_data(user_id)
    if not result:
        raise HTTPException(status_code=404, detail="User not found")
    return result


# --- Reset ---

@router.delete("/reset-all")
async def reset_all_data(
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    svc = AdminService(db)
    deleted = await svc.reset_all_data()
    return {"deleted": deleted}


# --- System ---

# --- NM Config ---

class NMConfigUpdate(BaseModel):
    reflection_interval: int | None = None
    auto_extract: bool | None = None
    graph_enabled: bool | None = None


@router.get("/system/nm-config")
async def get_nm_config(
    admin: User = Depends(require_admin),
):
    from app.main import nm
    if nm is None:
        raise HTTPException(status_code=503, detail="neuromem not initialized")
    extraction = nm._extraction
    return {
        "reflection_interval": nm.reflection_interval,
        "auto_extract": nm.auto_extract,
        "graph_enabled": nm.graph_enabled,
        "extraction": {
            "message_interval": extraction.message_interval,
            "idle_timeout": extraction.idle_timeout,
        },
    }


@router.put("/system/nm-config")
async def update_nm_config(
    body: NMConfigUpdate,
    admin: User = Depends(require_admin),
):
    from app.main import nm
    if nm is None:
        raise HTTPException(status_code=503, detail="neuromem not initialized")
    updated = {}
    if body.reflection_interval is not None:
        nm.reflection_interval = body.reflection_interval
        updated["reflection_interval"] = nm.reflection_interval
    if body.auto_extract is not None:
        nm.auto_extract = body.auto_extract
        updated["auto_extract"] = nm.auto_extract
    if body.graph_enabled is not None:
        nm.graph_enabled = body.graph_enabled
        updated["graph_enabled"] = nm.graph_enabled
    return {"updated": updated}


@router.post("/users/{user_id}/reflect")
async def trigger_user_reflect(
    user_id: str,
    admin: User = Depends(require_admin),
):
    from app.main import nm
    if nm is None:
        raise HTTPException(status_code=503, detail="neuromem not initialized")
    await nm.digest(user_id, background=True)
    return {"status": "triggered", "user_id": user_id}


# --- System ---

@router.get("/system/health")
async def get_system_health(
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    collector = MetricsCollector()
    import neuromem

    # DB pool info
    pool = db.get_bind().pool
    pool_info = {
        "size": pool.size(),
        "checked_in": pool.checkedin(),
        "checked_out": pool.checkedout(),
        "overflow": pool.overflow(),
    }

    return {
        "uptime_seconds": round(collector.get_uptime()),
        "neuromem_version": neuromem.__version__,
        "db_pool": pool_info,
    }


@router.get("/system/api-stats")
async def get_api_stats(
    hours: int = 24,
    admin: User = Depends(require_admin),
):
    collector = MetricsCollector()
    return collector.get_api_stats(last_seconds=hours * 3600)


@router.get("/system/llm-stats")
async def get_llm_stats(
    hours: int = 24,
    admin: User = Depends(require_admin),
):
    collector = MetricsCollector()
    return collector.get_llm_stats(last_seconds=hours * 3600)


@router.get("/system/extraction-stats")
async def get_extraction_stats(
    hours: int = 24,
    admin: User = Depends(require_admin),
):
    collector = MetricsCollector()
    return collector.get_extraction_stats(last_seconds=hours * 3600)


@router.get("/system/chat-stats")
async def get_chat_stats(
    hours: int = 24,
    admin: User = Depends(require_admin),
):
    collector = MetricsCollector()
    return collector.get_chat_stats(last_seconds=hours * 3600)


@router.get("/system/embedding-stats")
async def get_embedding_stats(
    hours: int = 24,
    admin: User = Depends(require_admin),
):
    collector = MetricsCollector()
    return collector.get_embedding_stats(last_seconds=hours * 3600)

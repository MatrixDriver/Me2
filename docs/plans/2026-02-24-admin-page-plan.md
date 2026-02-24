# Admin Page Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build an admin dashboard with system stats, user management, and full system monitoring for Me2.

**Architecture:** Add `is_admin` field to User model, create `/api/v1/admin/` backend router with `require_admin` guard, build independent `/admin` frontend sub-app with its own layout. In-memory MetricsCollector for API/LLM stats (no extra DB).

**Tech Stack:** FastAPI, SQLAlchemy, Next.js App Router, Tailwind CSS (glassmorphism theme), Pydantic

---

### Task 1: Add is_admin to User Model

**Files:**
- Modify: `backend/app/db/models.py:15-26`

**Step 1: Add is_admin column**

In `backend/app/db/models.py`, add after line 25 (`last_login`):

```python
    is_admin = Column(Boolean, default=False, nullable=False)
```

Add `Boolean` to the sqlalchemy import on line 3 if not present.

**Step 2: Verify existing tests still pass**

Run: `cd backend && python -m pytest tests/ -x -q 2>&1 | tail -5`

**Step 3: Commit**

```bash
git add backend/app/db/models.py
git commit -m "feat: add is_admin field to User model"
```

---

### Task 2: Create require_admin Dependency

**Files:**
- Create: `backend/app/dependencies/admin.py`
- Reference: `backend/app/dependencies/auth.py`

**Step 1: Create admin dependency**

Create `backend/app/dependencies/admin.py`:

```python
from fastapi import Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.models import User
from app.dependencies.auth import get_current_user


async def require_admin(
    current_user: User = Depends(get_current_user),
) -> User:
    """Require the current user to be an admin."""
    if not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )
    return current_user
```

**Step 2: Commit**

```bash
git add backend/app/dependencies/admin.py
git commit -m "feat: add require_admin dependency"
```

---

### Task 3: Create MetricsCollector for API & LLM Stats

**Files:**
- Create: `backend/app/services/metrics_collector.py`

**Step 1: Create the metrics collector**

Create `backend/app/services/metrics_collector.py`:

```python
"""In-memory metrics collector for API and LLM monitoring.

Uses a ring buffer of data points (last 24h). Resets on server restart.
"""
import time
import threading
from collections import defaultdict, deque
from dataclasses import dataclass, field


@dataclass
class ApiMetric:
    path: str
    method: str
    status_code: int
    duration_ms: float
    timestamp: float = field(default_factory=time.time)


@dataclass
class LLMMetric:
    model: str
    prompt_tokens: int
    completion_tokens: int
    duration_ms: float
    success: bool
    timestamp: float = field(default_factory=time.time)


class MetricsCollector:
    """Singleton in-memory metrics store."""

    _instance = None
    _lock = threading.Lock()
    MAX_POINTS = 100_000  # ~24h at moderate traffic

    def __new__(cls):
        with cls._lock:
            if cls._instance is None:
                cls._instance = super().__new__(cls)
                cls._instance._api_metrics = deque(maxlen=cls.MAX_POINTS)
                cls._instance._llm_metrics = deque(maxlen=cls.MAX_POINTS)
                cls._instance._start_time = time.time()
            return cls._instance

    def record_api(self, path: str, method: str, status_code: int, duration_ms: float):
        self._api_metrics.append(ApiMetric(path, method, status_code, duration_ms))

    def record_llm(self, model: str, prompt_tokens: int, completion_tokens: int,
                   duration_ms: float, success: bool):
        self._llm_metrics.append(LLMMetric(model, prompt_tokens, completion_tokens,
                                            duration_ms, success))

    def get_uptime(self) -> float:
        return time.time() - self._start_time

    def get_api_stats(self, last_seconds: int = 86400) -> dict:
        """Get API performance stats for the given time window."""
        cutoff = time.time() - last_seconds
        recent = [m for m in self._api_metrics if m.timestamp > cutoff]

        if not recent:
            return {"total_requests": 0, "endpoints": {}}

        by_endpoint: dict[str, list[float]] = defaultdict(list)
        for m in recent:
            key = f"{m.method} {m.path}"
            by_endpoint[key].append(m.duration_ms)

        endpoints = {}
        for key, durations in sorted(by_endpoint.items(), key=lambda x: -len(x[1])):
            sorted_d = sorted(durations)
            p95_idx = int(len(sorted_d) * 0.95)
            endpoints[key] = {
                "count": len(durations),
                "avg_ms": round(sum(durations) / len(durations), 1),
                "p95_ms": round(sorted_d[min(p95_idx, len(sorted_d) - 1)], 1),
            }

        error_count = sum(1 for m in recent if m.status_code >= 400)

        return {
            "total_requests": len(recent),
            "error_count": error_count,
            "endpoints": endpoints,
        }

    def get_llm_stats(self, last_seconds: int = 86400) -> dict:
        """Get LLM call stats for the given time window."""
        cutoff = time.time() - last_seconds
        recent = [m for m in self._llm_metrics if m.timestamp > cutoff]

        if not recent:
            return {"total_calls": 0, "total_prompt_tokens": 0,
                    "total_completion_tokens": 0, "avg_duration_ms": 0,
                    "failure_rate": 0}

        total_prompt = sum(m.prompt_tokens for m in recent)
        total_completion = sum(m.completion_tokens for m in recent)
        avg_duration = sum(m.duration_ms for m in recent) / len(recent)
        failures = sum(1 for m in recent if not m.success)

        # Today's calls
        today_start = time.time() - (time.time() % 86400)
        today_calls = sum(1 for m in recent if m.timestamp > today_start)

        return {
            "total_calls": len(recent),
            "today_calls": today_calls,
            "total_prompt_tokens": total_prompt,
            "total_completion_tokens": total_completion,
            "avg_duration_ms": round(avg_duration, 1),
            "failure_rate": round(failures / len(recent), 4) if recent else 0,
        }
```

**Step 2: Commit**

```bash
git add backend/app/services/metrics_collector.py
git commit -m "feat: add in-memory MetricsCollector for API and LLM stats"
```

---

### Task 4: Add API Timing Middleware

**Files:**
- Modify: `backend/app/main.py:145-171`

**Step 1: Add middleware after CORS setup**

In `backend/app/main.py`, add after the CORS middleware block (after line 165) and before router registration:

```python
# API metrics middleware
from app.services.metrics_collector import MetricsCollector

@app.middleware("http")
async def metrics_middleware(request, call_next):
    start = time.time()
    response = await call_next(request)
    duration_ms = (time.time() - start) * 1000
    # Only track API routes
    if request.url.path.startswith("/api/"):
        MetricsCollector().record_api(
            path=request.url.path,
            method=request.method,
            status_code=response.status_code,
            duration_ms=duration_ms,
        )
    return response
```

Add `import time` at the top of main.py if not already imported.

**Step 2: Commit**

```bash
git add backend/app/main.py
git commit -m "feat: add API timing middleware for metrics collection"
```

---

### Task 5: Add LLM Metrics to LLMClient

**Files:**
- Modify: `backend/app/services/llm_client.py`

**Step 1: Instrument LLM calls**

In `backend/app/services/llm_client.py`, add import at the top:

```python
from app.services.metrics_collector import MetricsCollector
```

In the `generate()` method, wrap the API call (around line 94-121 for stream, line 124-142 for non-stream) to record metrics.

For the **non-stream** path (around line 124), wrap the call:

```python
            llm_start = time.time()
            try:
                response = await self.client.chat.completions.create(**kwargs)
                llm_duration = (time.time() - llm_start) * 1000
                usage = response.usage
                MetricsCollector().record_llm(
                    model=kwargs.get("model", "unknown"),
                    prompt_tokens=usage.prompt_tokens if usage else 0,
                    completion_tokens=usage.completion_tokens if usage else 0,
                    duration_ms=llm_duration,
                    success=True,
                )
```

For the **stream** path (around line 94), add timing + a collector call after the stream completes. Since streaming is an async generator, add metrics recording in the finally block of the stream consumer, or record a basic metric at stream start.

For errors, record failure:

```python
            except Exception as e:
                llm_duration = (time.time() - llm_start) * 1000
                MetricsCollector().record_llm(
                    model=kwargs.get("model", "unknown"),
                    prompt_tokens=0, completion_tokens=0,
                    duration_ms=llm_duration, success=False,
                )
                raise
```

Add `import time` if not already imported.

**Step 2: Commit**

```bash
git add backend/app/services/llm_client.py
git commit -m "feat: add LLM call metrics tracking"
```

---

### Task 6: Create Admin Service (Stats Queries)

**Files:**
- Create: `backend/app/services/admin_service.py`

**Step 1: Create admin service**

Create `backend/app/services/admin_service.py`:

```python
"""Admin service - stats and management queries."""
import logging
from datetime import datetime, timedelta
from sqlalchemy import func, select, case, and_
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.models import User, Session, Message

logger = logging.getLogger(__name__)


class AdminService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_dashboard_stats(self) -> dict:
        """Get global dashboard statistics."""
        now = datetime.utcnow()
        today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        week_ago = now - timedelta(days=7)

        # Users
        user_total = (await self.db.execute(select(func.count(User.id)))).scalar() or 0
        user_today = (await self.db.execute(
            select(func.count(User.id)).where(User.created_at >= today_start)
        )).scalar() or 0
        user_active_7d = (await self.db.execute(
            select(func.count(User.id)).where(User.last_login >= week_ago)
        )).scalar() or 0

        # Sessions
        session_total = (await self.db.execute(select(func.count(Session.id)))).scalar() or 0
        session_today = (await self.db.execute(
            select(func.count(Session.id)).where(Session.created_at >= today_start)
        )).scalar() or 0
        session_active = (await self.db.execute(
            select(func.count(Session.id)).where(Session.is_active == True)
        )).scalar() or 0

        # Messages
        msg_total = (await self.db.execute(select(func.count(Message.id)))).scalar() or 0
        msg_today = (await self.db.execute(
            select(func.count(Message.id)).where(Message.created_at >= today_start)
        )).scalar() or 0

        # Memories (via NeuroMemory - query embeddings table directly)
        memory_stats = await self._get_memory_stats()

        return {
            "users": {"total": user_total, "today_new": user_today, "active_7d": user_active_7d},
            "sessions": {"total": session_total, "today": session_today, "active": session_active},
            "messages": {"total": msg_total, "today": msg_today},
            "memories": memory_stats,
        }

    async def _get_memory_stats(self) -> dict:
        """Query NeuroMemory embeddings table for memory stats."""
        try:
            from sqlalchemy import text
            result = await self.db.execute(text(
                "SELECT memory_type, COUNT(*) as cnt FROM embeddings GROUP BY memory_type"
            ))
            rows = result.fetchall()
            by_type = {row[0]: row[1] for row in rows}
            total = sum(by_type.values())

            # Graph stats
            node_count = 0
            edge_count = 0
            try:
                node_result = await self.db.execute(text("SELECT COUNT(*) FROM graph_nodes"))
                node_count = node_result.scalar() or 0
                edge_result = await self.db.execute(text("SELECT COUNT(*) FROM graph_edges"))
                edge_count = edge_result.scalar() or 0
            except Exception:
                pass  # Graph tables may not exist

            return {
                "total": total,
                "by_type": by_type,
                "graph_nodes": node_count,
                "graph_edges": edge_count,
            }
        except Exception as e:
            logger.warning(f"Failed to query memory stats: {e}")
            return {"total": 0, "by_type": {}, "graph_nodes": 0, "graph_edges": 0}

    async def get_user_list(self, limit: int = 50, offset: int = 0) -> dict:
        """Get paginated user list with stats."""
        # Total count
        total = (await self.db.execute(select(func.count(User.id)))).scalar() or 0

        # Users with session/message counts
        stmt = (
            select(
                User.id, User.username, User.email, User.is_admin,
                User.created_at, User.last_login,
                func.count(Session.id.distinct()).label("session_count"),
            )
            .outerjoin(Session, Session.user_id == User.id)
            .group_by(User.id)
            .order_by(User.created_at.desc())
            .limit(limit)
            .offset(offset)
        )
        result = await self.db.execute(stmt)
        rows = result.all()

        users = []
        for row in rows:
            # Get message count per user
            msg_count = (await self.db.execute(
                select(func.count(Message.id))
                .join(Session, Message.session_id == Session.id)
                .where(Session.user_id == row.id)
            )).scalar() or 0

            users.append({
                "id": row.id,
                "username": row.username,
                "email": row.email,
                "is_admin": row.is_admin,
                "created_at": row.created_at.isoformat() if row.created_at else None,
                "last_login": row.last_login.isoformat() if row.last_login else None,
                "session_count": row.session_count,
                "message_count": msg_count,
            })

        return {"users": users, "total": total}

    async def get_user_detail(self, user_id: str) -> dict:
        """Get detailed stats for a specific user."""
        user = (await self.db.execute(
            select(User).where(User.id == user_id)
        )).scalar_one_or_none()

        if not user:
            return None

        now = datetime.utcnow()
        today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)

        # Sessions
        session_total = (await self.db.execute(
            select(func.count(Session.id)).where(Session.user_id == user_id)
        )).scalar() or 0
        session_active = (await self.db.execute(
            select(func.count(Session.id)).where(
                and_(Session.user_id == user_id, Session.is_active == True)
            )
        )).scalar() or 0

        # Messages
        msg_total = (await self.db.execute(
            select(func.count(Message.id))
            .join(Session, Message.session_id == Session.id)
            .where(Session.user_id == user_id)
        )).scalar() or 0
        msg_today = (await self.db.execute(
            select(func.count(Message.id))
            .join(Session, Message.session_id == Session.id)
            .where(and_(Session.user_id == user_id, Message.created_at >= today_start))
        )).scalar() or 0

        # Memories for this user
        try:
            from sqlalchemy import text
            result = await self.db.execute(text(
                "SELECT memory_type, COUNT(*) as cnt FROM embeddings "
                "WHERE user_id = :uid GROUP BY memory_type"
            ), {"uid": user_id})
            rows = result.fetchall()
            memory_by_type = {row[0]: row[1] for row in rows}
            memory_total = sum(memory_by_type.values())
        except Exception:
            memory_by_type = {}
            memory_total = 0

        # Recent sessions
        recent_sessions_result = await self.db.execute(
            select(Session)
            .where(Session.user_id == user_id)
            .order_by(Session.last_active_at.desc())
            .limit(20)
        )
        recent_sessions = []
        for s in recent_sessions_result.scalars().all():
            s_msg_count = (await self.db.execute(
                select(func.count(Message.id)).where(Message.session_id == s.id)
            )).scalar() or 0
            recent_sessions.append({
                "id": s.id,
                "title": (s.meta or {}).get("title", "Untitled"),
                "last_active_at": s.last_active_at.isoformat() if s.last_active_at else None,
                "message_count": s_msg_count,
                "is_active": s.is_active,
            })

        return {
            "user": {
                "id": user.id,
                "username": user.username,
                "email": user.email,
                "is_admin": user.is_admin,
                "created_at": user.created_at.isoformat() if user.created_at else None,
                "last_login": user.last_login.isoformat() if user.last_login else None,
            },
            "stats": {
                "sessions": {"total": session_total, "active": session_active},
                "messages": {"total": msg_total, "today": msg_today},
                "memories": {"total": memory_total, "by_type": memory_by_type},
            },
            "recent_sessions": recent_sessions,
        }

    async def update_user(self, user_id: str, current_admin_id: str, updates: dict) -> dict:
        """Update user attributes (admin toggle, disable)."""
        user = (await self.db.execute(
            select(User).where(User.id == user_id)
        )).scalar_one_or_none()

        if not user:
            return None

        # Safety: cannot remove own admin
        if "is_admin" in updates and user_id == current_admin_id and not updates["is_admin"]:
            raise ValueError("Cannot remove your own admin status")

        for key, value in updates.items():
            if hasattr(user, key) and key in ("is_admin",):
                setattr(user, key, value)

        await self.db.commit()
        return {"id": user.id, "username": user.username, "is_admin": user.is_admin}
```

**Step 2: Commit**

```bash
git add backend/app/services/admin_service.py
git commit -m "feat: add AdminService for stats queries and user management"
```

---

### Task 7: Create Admin API Router

**Files:**
- Create: `backend/app/api/v1/admin.py`
- Modify: `backend/app/main.py:167-171`

**Step 1: Create admin router**

Create `backend/app/api/v1/admin.py`:

```python
"""Admin API endpoints."""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.models import User
from app.dependencies.admin import require_admin
from app.dependencies.database import get_db
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


# --- System ---

@router.get("/system/health")
async def get_system_health(
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    collector = MetricsCollector()
    import neuromemory

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
        "neuromemory_version": neuromemory.__version__,
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
```

**Step 2: Register admin router in main.py**

In `backend/app/main.py`, modify the router registration (after line 171):

```python
from app.api.v1 import auth, chat, memories, admin
app.include_router(auth.router, prefix="/api/v1")
app.include_router(chat.router, prefix="/api/v1")
app.include_router(memories.router, prefix="/api/v1")
app.include_router(admin.router, prefix="/api/v1")
```

**Step 3: Commit**

```bash
git add backend/app/api/v1/admin.py backend/app/main.py
git commit -m "feat: add admin API router with dashboard, users, and system endpoints"
```

---

### Task 8: Update AuthContext to Include is_admin

**Files:**
- Modify: `frontend/contexts/AuthContext.tsx`

**Step 1: Add isAdmin to auth context**

In `frontend/contexts/AuthContext.tsx`:

1. Add `isAdmin: boolean;` to the AuthContextType interface
2. Add state: `const [isAdmin, setIsAdmin] = useState(false);`
3. In the login response handling, decode the JWT to check for admin flag, or add an API call to get user info including is_admin
4. Add `isAdmin` to the context value

The simplest approach: include `is_admin` in the JWT token payload, then decode it on the frontend.

**Backend change needed:** In `backend/app/services/auth_service.py`, add `is_admin` to the JWT payload when creating tokens:

```python
# In create_access_token or login endpoint, include is_admin:
payload = {"sub": user.id, "username": user.username, "is_admin": user.is_admin}
```

**Frontend:** Parse `is_admin` from the JWT token:

```typescript
function parseToken(token: string): { sub: string; username: string; is_admin?: boolean } | null {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload;
  } catch {
    return null;
  }
}
```

Then in the login handler and initial auth check, set `setIsAdmin(payload.is_admin || false)`.

**Step 2: Commit**

```bash
git add frontend/contexts/AuthContext.tsx backend/app/services/auth_service.py
git commit -m "feat: include is_admin in JWT and AuthContext"
```

---

### Task 9: Create AdminRoute Guard Component

**Files:**
- Create: `frontend/components/admin/AdminRoute.tsx`

**Step 1: Create admin route guard**

Create `frontend/components/admin/AdminRoute.tsx`:

```tsx
'use client';

import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { Loader2 } from 'lucide-react';

export default function AdminRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isAdmin, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && (!isAuthenticated || !isAdmin)) {
      router.replace('/');
    }
  }, [loading, isAuthenticated, isAdmin, router]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAuthenticated || !isAdmin) return null;

  return <>{children}</>;
}
```

**Step 2: Commit**

```bash
git add frontend/components/admin/AdminRoute.tsx
git commit -m "feat: add AdminRoute guard component"
```

---

### Task 10: Create Admin Layout

**Files:**
- Create: `frontend/app/admin/layout.tsx`

**Step 1: Create admin layout with top nav**

Create `frontend/app/admin/layout.tsx`:

```tsx
'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { LayoutDashboard, Users, Activity, ArrowLeft } from 'lucide-react';
import AdminRoute from '@/components/admin/AdminRoute';

const NAV_ITEMS = [
  { href: '/admin', label: 'Dashboard', icon: LayoutDashboard, exact: true },
  { href: '/admin/users', label: 'Users', icon: Users },
  { href: '/admin/system', label: 'System', icon: Activity },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  const isActive = (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname.startsWith(href);

  return (
    <AdminRoute>
      <div className="h-screen flex flex-col">
        {/* Top nav */}
        <header className="glass border-b border-white/5 px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <Link
              href="/"
              className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors text-sm"
            >
              <ArrowLeft className="w-4 h-4" />
              Me2
            </Link>
            <span className="text-foreground font-semibold">Admin</span>
          </div>
          <nav className="flex items-center gap-1">
            {NAV_ITEMS.map(({ href, label, icon: Icon, exact }) => (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-colors ${
                  isActive(href, exact)
                    ? 'bg-primary/15 text-primary'
                    : 'text-muted-foreground hover:text-foreground hover:bg-white/5'
                }`}
              >
                <Icon className="w-4 h-4" />
                {label}
              </Link>
            ))}
          </nav>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-y-auto p-6">
          {children}
        </main>
      </div>
    </AdminRoute>
  );
}
```

**Step 2: Commit**

```bash
git add frontend/app/admin/layout.tsx
git commit -m "feat: add admin layout with top navigation"
```

---

### Task 11: Create Dashboard Page

**Files:**
- Create: `frontend/app/admin/page.tsx`
- Create: `frontend/components/admin/StatsCard.tsx`

**Step 1: Create StatsCard component**

Create `frontend/components/admin/StatsCard.tsx`:

```tsx
import { LucideIcon } from 'lucide-react';

interface StatsCardProps {
  title: string;
  value: number | string;
  subtitle?: string;
  icon: LucideIcon;
  trend?: { label: string; value: number | string }[];
}

export default function StatsCard({ title, value, subtitle, icon: Icon, trend }: StatsCardProps) {
  return (
    <div className="glass-card rounded-xl p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-muted-foreground text-sm">{title}</span>
        <Icon className="w-4 h-4 text-muted-foreground/50" />
      </div>
      <div className="text-2xl font-bold text-foreground">{value}</div>
      {subtitle && <div className="text-xs text-muted-foreground/60 mt-1">{subtitle}</div>}
      {trend && trend.length > 0 && (
        <div className="flex gap-3 mt-2">
          {trend.map((t, i) => (
            <span key={i} className="text-xs text-muted-foreground/50">
              {t.label}: <span className="text-foreground/70">{t.value}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
```

**Step 2: Create dashboard page**

Create `frontend/app/admin/page.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { Users, MessageCircle, Database, Network, MessagesSquare, Loader2 } from 'lucide-react';
import StatsCard from '@/components/admin/StatsCard';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || '/api/v1';

function getAuthHeaders() {
  const token = localStorage.getItem('me2_access_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      const res = await fetch(`${API_BASE}/admin/dashboard`, { headers: getAuthHeaders() });
      if (res.ok) setStats(await res.json());
    } catch (e) {
      console.error('Failed to load dashboard:', e);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!stats) return <div className="text-muted-foreground">Failed to load stats</div>;

  const { users, sessions, messages, memories } = stats;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatsCard
          title="Users"
          value={users.total}
          icon={Users}
          trend={[
            { label: 'Today', value: `+${users.today_new}` },
            { label: '7d active', value: users.active_7d },
          ]}
        />
        <StatsCard
          title="Sessions"
          value={sessions.total}
          icon={MessagesSquare}
          trend={[
            { label: 'Today', value: sessions.today },
            { label: 'Active', value: sessions.active },
          ]}
        />
        <StatsCard
          title="Messages"
          value={messages.total}
          icon={MessageCircle}
          trend={[{ label: 'Today', value: `+${messages.today}` }]}
        />
        <StatsCard
          title="Memories"
          value={memories.total}
          icon={Database}
          trend={[
            { label: 'fact', value: memories.by_type?.fact || 0 },
            { label: 'episodic', value: memories.by_type?.episodic || 0 },
            { label: 'insight', value: memories.by_type?.insight || 0 },
          ]}
        />
      </div>

      {/* Graph stats */}
      {(memories.graph_nodes > 0 || memories.graph_edges > 0) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <StatsCard title="Graph Nodes" value={memories.graph_nodes} icon={Network} />
          <StatsCard title="Graph Edges" value={memories.graph_edges} icon={Network} />
        </div>
      )}
    </div>
  );
}
```

**Step 3: Commit**

```bash
git add frontend/components/admin/StatsCard.tsx frontend/app/admin/page.tsx
git commit -m "feat: add admin dashboard page with stats cards"
```

---

### Task 12: Create Users List Page

**Files:**
- Create: `frontend/app/admin/users/page.tsx`

**Step 1: Create users page**

Create `frontend/app/admin/users/page.tsx` with:
- Table of users (username, email, registered, last active, sessions, messages, admin badge)
- Toggle admin button (disabled for self)
- Click row to navigate to `/admin/users/[id]`
- Pagination
- Use glass-card styling, text-foreground/text-muted-foreground colors

**Step 2: Commit**

```bash
git add frontend/app/admin/users/page.tsx
git commit -m "feat: add admin users list page"
```

---

### Task 13: Create User Detail Page

**Files:**
- Create: `frontend/app/admin/users/[id]/page.tsx`

**Step 1: Create user detail page**

Create `frontend/app/admin/users/[id]/page.tsx` with:
- User info header (username, email, admin badge, registered/last active dates)
- Stats cards (same as dashboard but scoped to this user)
- Recent sessions table (title, last active, message count, active badge)
- Memory breakdown by type
- Use glass-card styling

**Step 2: Commit**

```bash
git add frontend/app/admin/users/[id]/page.tsx
git commit -m "feat: add admin user detail page"
```

---

### Task 14: Create System Monitoring Page

**Files:**
- Create: `frontend/app/admin/system/page.tsx`

**Step 1: Create system page**

Create `frontend/app/admin/system/page.tsx` with three sections:

1. **Service Health**: uptime, DB pool stats, NeuroMemory version
2. **API Performance**: table of endpoints with count, avg ms, p95 ms
3. **LLM Stats**: call count (total/today), token usage, avg duration, failure rate

Fetch from `/admin/system/health`, `/admin/system/api-stats`, `/admin/system/llm-stats`.

Use glass-card styling, auto-refresh every 30 seconds.

**Step 2: Commit**

```bash
git add frontend/app/admin/system/page.tsx
git commit -m "feat: add admin system monitoring page"
```

---

### Task 15: Add Admin Link to Navigation

**Files:**
- Modify: `frontend/components/layout/Sidebar.tsx`
- Modify: `frontend/components/layout/MobileNav.tsx`

**Step 1: Add admin link to Sidebar**

In `frontend/components/layout/Sidebar.tsx`, import `Shield` from lucide-react and `useAuth` from AuthContext. Conditionally render an admin nav item:

```tsx
import { useAuth } from '@/contexts/AuthContext';
import { MessageCircle, Database, Settings, Shield } from 'lucide-react';

// Inside the component:
const { isAdmin } = useAuth();

// In the nav section, add after Settings:
{isAdmin && <SidebarItem href="/admin" icon={Shield} label="管理" />}
```

**Step 2: Add admin to MobileNav**

In `frontend/components/layout/MobileNav.tsx`, add admin to `drawerItems` conditionally:

```tsx
const { logout, isAdmin } = useAuth();

const drawerItems = [
  { href: '/settings', icon: Settings, label: '设置' },
  ...(isAdmin ? [{ href: '/admin', icon: Shield, label: '管理' }] : []),
];
```

**Step 3: Commit**

```bash
git add frontend/components/layout/Sidebar.tsx frontend/components/layout/MobileNav.tsx
git commit -m "feat: show admin link in nav for admin users"
```

---

### Task 16: Build, Test, and Push

**Step 1: Run frontend build**

```bash
cd frontend && npx next build
```

Fix any type errors.

**Step 2: Run backend tests**

```bash
cd backend && python -m pytest tests/ -x -q
```

**Step 3: Manual test**

1. Set a user as admin: `UPDATE users SET is_admin = true WHERE username = 'your_username';`
2. Login and verify admin link appears in sidebar
3. Navigate to /admin and verify dashboard loads
4. Check /admin/users, /admin/system pages

**Step 4: Push**

```bash
git push
```

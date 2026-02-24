# Admin Page Design

**Goal:** Build an admin dashboard for Me2 with system stats, user management, and full system monitoring.

**Target users:** 2-3 admins with equal privileges.

**Architecture:** Independent sub-app under `/admin` with its own layout and navigation, reusing the glassmorphism theme.

---

## Auth & Permissions

- Add `is_admin: Boolean = False` to User model
- Backend: `require_admin` dependency checks `is_admin` flag, returns 403 if not admin
- Frontend: `AdminRoute` wrapper redirects non-admin users
- All admins have equal privileges
- Admin cannot remove their own admin status (safety guard)
- Sidebar shows "Admin" link only for admin users

## Page Structure

```
/admin                → Dashboard (stats overview)
/admin/users          → User management list
/admin/users/[id]     → User detail (per-user stats)
/admin/system         → System monitoring
```

Admin has its own top navigation bar: Dashboard | Users | System

## Module 1: Dashboard (`/admin`)

Stats cards showing global metrics:

| Category | Metrics |
|----------|---------|
| Users | Total, today new, 7-day active |
| Sessions | Total, today, currently active |
| Messages | Total, today |
| Memories | Total, by type (fact / episodic / insight) |
| Graph | Node count, edge count |

## Module 2: User Management

### User List (`/admin/users`)

Table columns:
- Username, email, registered date, last active
- Session count, message count, memory count
- Admin badge (if admin)

Actions:
- Enable / disable user
- Grant / revoke admin (cannot revoke self)
- Click username to navigate to detail

### User Detail (`/admin/users/[id]`)

- Same stats cards as dashboard, scoped to this user
- Session list (title, last active, message count)
- Memory breakdown by type

## Module 3: System Monitoring (`/admin/system`)

### Service Health
- Server uptime
- DB connection pool (active / idle / total)
- NeuroMemory version and status

### API Performance (requires middleware)
- Per-endpoint average and P95 response time
- Request count trend

### LLM Monitoring (requires LLMClient instrumentation)
- Call count (total / today)
- Token usage (prompt / completion)
- Average latency
- Failure rate

## Backend API

All endpoints under `/api/v1/admin/`, protected by `require_admin`.

```
GET  /admin/dashboard         → Global stats
GET  /admin/users             → User list (paginated)
GET  /admin/users/{id}        → User detail + per-user stats
PUT  /admin/users/{id}        → Update user (disable/admin toggle)
GET  /admin/system/health     → Service health + DB + NeuroMemory
GET  /admin/system/api-stats  → API performance metrics
GET  /admin/system/llm-stats  → LLM call metrics
```

## Files to Create / Modify

**Backend (new):**
- `app/api/v1/admin.py` — Admin router with all endpoints
- `app/dependencies/admin.py` — `require_admin` dependency
- `app/services/admin_service.py` — Stats query logic
- `app/services/metrics_collector.py` — In-memory metrics for API/LLM stats

**Backend (modify):**
- `app/db/models.py` — Add `is_admin` field to User
- `app/main.py` — Register admin router, add API timing middleware
- `app/services/llm_client.py` — Add call/token/error tracking

**Frontend (new):**
- `app/admin/layout.tsx` — Admin layout with top nav
- `app/admin/page.tsx` — Dashboard
- `app/admin/users/page.tsx` — User list
- `app/admin/users/[id]/page.tsx` — User detail
- `app/admin/system/page.tsx` — System monitoring
- `components/admin/AdminRoute.tsx` — Auth guard
- `components/admin/StatsCard.tsx` — Reusable stat card

**Frontend (modify):**
- `components/layout/Sidebar.tsx` — Show admin link for admin users
- `components/layout/MobileNav.tsx` — Show admin in mobile nav for admin users

## Metrics Collection Strategy

API and LLM metrics use in-memory collection (no extra DB):
- `MetricsCollector` singleton with ring buffer (last 24h of data points)
- FastAPI middleware records request path, status, duration
- LLMClient wrapper records call count, tokens, latency, errors
- `/admin/system/*` endpoints read from this collector
- Data resets on server restart (acceptable for this scale)

---
title: "升级 neuromem SDK 0.9.4 → 0.12.1"
type: todo
status: open
priority: high
on_hold: true
on_hold_since: "2026-06-15"
created_at: 2026-05-13T11:55:00
updated_at: 2026-06-15T12:00:00+08:00
---

# 升级 neuromem SDK 0.9.4 → 0.12.1

> ⏸️ **2026-06-15 用户主动暂缓 (on hold)**: 用户集中力量先推进 NeuroMem SDK + neuromem-cloud, Me2 短期不推进、不主动提醒。**重启条件**: 用户主动重提 Me2。**重启时先刷新目标版本**: 0.12.1 已过时, SDK 当前 0.13.2 (cloud 已 `>=0.13.2`), 跨度含 0.13.0 删 P-B + 0.13.2 pending 驱动调度, 重启时需把目标改 0.13.2 并重评破坏性变更清单。

## 触发来源

2026-05-13 SDK 发版 0.12.1（fix: `_store_facts` event_time → valid_from 映射）。
neuromem-cloud 已升 0.12.1 + Railway 部署 SUCCESS。Me2 是 ecosystem 内最后一个未升的项目。

## 当前现状

- `backend/requirements.txt`: `neuromem==0.9.4`（落后 cloud 两个 minor + 一个 patch）
- `backend/.venv` 当前甚至**没装** neuromem 包（`import neuromem` ModuleNotFoundError）
- 调用 SDK 的位置：9 个 .py 文件,共 45 处（grep `from neuromem|nm\.<facade>` 命中）

## 升级跨度（0.9.4 → 0.12.1）含 3 类破坏性变更

### 1. insight → trait 重命名（0.11 引入）

数据模型 + API + CLI 全部把 `insight` 改成 `trait`：
- `nm.digest()` 返回类型字段重命名
- 数据库 `memories.memory_type = 'insight'` → `'trait'`
- 新增 `nm.feedback_trait()` API

Me2 受影响代码（grep 已确认）：
- `backend/app/services/conversation_engine.py:225` `memories if m.get("memory_type") == "insight"`
- `backend/app/services/conversation_engine.py:228` `m.get("memory_type") not in ("fact", "episodic", "insight")`
- `backend/app/services/conversation_engine.py:202,261` prompt 模板里的 "insight"
- `backend/app/services/conversation_engine.py:174,466` `insights_used` 业务字段

不影响（Me2 自己的业务字段,与 SDK 解耦）：
- `chat.py` 的 `insights_used` API 字段（response schema）
- `db/models.py` 的 `insights_used = Column(JSON)` 消息表列

**已有 sibling todo**: `rpiv/todo/todo-cleanup-insight-remnants.md`（2026-03-08 创建,high priority）涵盖这部分清理。本升级需要先完成 cleanup,或一并完成。

### 2. 新增公共方法（向后兼容,可选启用）

0.11+ 新增：
- `ingest_window()` 滑动窗口提取
- `find_duplicates()` / `merge_duplicates()`
- `feedback_trait()` 反馈调整置信度
- `extraction_mode='window'` ingest 参数

可选启用,不升级也能跑。

### 3. 数据库迁移

PostgreSQL 5434 中既有数据：
```sql
SELECT memory_type, COUNT(*) FROM memories GROUP BY memory_type;
-- 期望看到 'insight' 行;需要 UPDATE 改成 'trait'
```

迁移 SQL（建议运行前先 backup）:
```sql
BEGIN;
UPDATE memories SET memory_type = 'trait' WHERE memory_type = 'insight';
COMMIT;
```

Me2 用内联 `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` 做迁移（无 Alembic）。memory_type 列值的批量修正属于一次性 SQL,直接跑即可,不需要 framework。

## 升级工作清单

按顺序：

### Pre

- [ ] 检查 PostgreSQL 5434 是否能起（Me2 docker-compose up -d）
- [ ] backup 5434 数据库（`pg_dump`）

### 代码

- [ ] `backend/requirements.txt`: `neuromem==0.9.4` → `neuromem==0.12.1`
- [ ] `pip install -r requirements.txt` 验证装得上
- [ ] 完成 `todo-cleanup-insight-remnants.md` 的 insight → trait 全栈替换（或并入本次）
- [ ] grep `'insight'` `"insight"` 确认 0 残留

### 数据库

- [ ] 跑 `UPDATE memories SET memory_type = 'trait' WHERE memory_type = 'insight'`
- [ ] 验证 `SELECT memory_type, COUNT(*) FROM memories GROUP BY memory_type` 无 insight 行

### 测试

- [ ] `cd backend && pytest tests/ -v`（特别看 test_extraction_config.py）
- [ ] 手动起 backend (`uvicorn app.main:app --reload`) + 前端调一遍 chat 流程,确认 recall 正常
- [ ] 验证 dashboard 时间线视图（如有）显示 fact 的 event_time 历史时刻而非 ingest 时刻——SDK 0.12.1 的核心 fix 目标

### 部署

- [ ] commit + push
- [ ] Railway 部署（Me2 部署在 Railway, 详情见 Me2 的 CLAUDE.md）
- [ ] smoke test 生产 health endpoint

## 风险点

1. **prompt 模板分层注入逻辑** (`conversation_engine.py:225-228`): 改 `insight` 为 `trait` 后,recall 出来的 trait 记忆走的字段位置变。要 verify 注入仍生效
2. **新数据格式 vs 旧数据**: 升级 SDK 后,新 ingest 的 fact 会带正确 valid_from（事件时间）,旧 fact 仍是 ingest 时间。如果 Me2 业务依赖 valid_from 做排序/过滤,新老数据会出现"穿插"
3. **测试覆盖盲区**: Me2 backend 当前 venv 没装 neuromem,说明可能很久没跑测试,升级后 pytest 通过不代表生产路径都通

## 不在本任务范围

- 启用 sliding window extraction / dedup / procedural memory 等新特性（独立 follow-up）
- 改造业务字段 `insights_used` → `traits_used`（如要做,跟 db schema 一起）

## 关联

- 触发 PR / SDK 0.12.1 发版: `D:/CODE/NeuroMem/rpiv/issues/fact-event-time-not-mapped-to-valid-from.md`
- 已存在 sibling: `rpiv/todo/todo-cleanup-insight-remnants.md`

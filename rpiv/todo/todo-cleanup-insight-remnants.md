---
title: "清理 insight 概念残留：全栈重命名为 trait"
type: todo
status: open
priority: high
created_at: 2026-03-08T10:00:00
updated_at: 2026-03-08T10:00:00
---

# 清理 insight 概念残留：全栈重命名为 trait

## 任务描述

neuromem SDK V2 已将 insight 降级为 trait 的 trend 阶段，数据库迁移已完成（insight → trait）。但 Me2 代码中大量 insight 残留，包括数据库字段、API 字段、prompt 分拣逻辑和前端 UI。

SDK 的 `digest()` 公共 API 返回值完成重命名后，Me2 需同步适配。

## 涉及文件

### 后端
- `backend/app/db/models.py:58` — `insights_used` 列（数据库字段）
- `backend/app/api/v1/chat.py` — `insights_used` 在请求/响应 schema 中
- `backend/app/services/conversation_engine.py:225-261` — 按 `memory_type == "insight"` 分拣记忆注入 prompt（V2 后已是死代码）

### 前端（10+ 文件）
- `frontend/app/memories/page.tsx:126` — `allowedTypes={['insight']}`
- `frontend/app/memories/[id]/MemoryDetailClient.tsx:299` — insight 下拉选项
- `frontend/app/admin/page.tsx:254` — insight 统计
- `frontend/app/analysis/page.tsx` — `key_insights` 字段
- `frontend/components/MemoryFilters.tsx:21` — insight 筛选项
- `frontend/components/memories/MemoryStore.tsx` — insight tab 和颜色
- `frontend/components/MemoryList.tsx` — insight 颜色和标签
- `frontend/components/MemoryTimeline.tsx` — insight 颜色和标签
- `frontend/components/DebugPanel.tsx` — `fetch_insights` 字段
- `frontend/lib/api-client.ts` — insight 相关类型定义
- `frontend/lib/utils.ts` — insight 颜色和中文标签映射

## 完成标准

1. 后端 `insights_used` 重命名为 `traits_used`（含数据库迁移）
2. `conversation_engine.py` 移除 insight 分拣，改为按 trait 处理
3. 前端所有 insight 引用替换为 trait（筛选器、颜色、标签、类型定义）
4. 全项目 `grep -ri insight` 无功能性残留（注释中的历史说明可保留）

## 备注

- 依赖 SDK `digest()` 返回值重命名完成后再处理
- 与现有 todo `v2-profile-alignment.md` 相关但聚焦点不同：本 todo 专注 insight→trait 命名清理，v2-profile-alignment 覆盖更广的 V2 对齐工作

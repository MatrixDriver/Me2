---
title: "清理 insight 概念残留:全栈重命名为 trait"
type: todo
status: open
priority: high
created_at: 2026-03-08T10:00:00
updated_at: 2026-05-22T15:05:00
related:
  - D:/CODE/me2/rpiv/todo/todo-sdk-upgrade-0.12.1.md
  - D:/CODE/me2/rpiv/todo/v2-profile-alignment.md
---

# 清理 insight 概念残留:全栈重命名为 trait

## 🚨 Blocked By

**`todo-sdk-upgrade-0.12.1.md` (high priority, open)** — Me2 当前仍 `neuromem==0.9.4`,
本 todo 依赖 SDK 0.11+ 的 insight→trait 重命名 (含数据模型/API/CLI 破坏性变更)。
SDK `digest()` 返回值在 0.11 已 trait 化, Me2 升级后才能同步前后端字段。

## 🔄 与 v2-profile-alignment 合并执行

本 todo 的 M3-M6 几乎完全等同于 `v2-profile-alignment.md` 的 M3-M6。
两者**SDK 升级后应一次性合并执行, 单 PR 提交**, 避免重复 grep / 重复测试。

差异点:
- 本 todo 范围聚焦"insight 命名清理"
- v2-profile-alignment 额外含 M1/M2 (profile_view API 切换) 和 M7 (ProfileSection 动态化)
- 即本 todo 是 v2-profile-alignment 的**真子集**, 可考虑归档此 todo, 由 v2-profile-alignment 统一推进

## 任务描述

neuromem SDK V2 已将 insight 降级为 trait 的 trend 阶段, 数据库迁移已完成 (insight → trait)。
但 Me2 代码中大量 insight 残留, 包括数据库字段、API 字段、prompt 分拣逻辑和前端 UI。
SDK 的 `digest()` 公共 API 返回值完成重命名后, Me2 需同步适配。

## 涉及文件 (2026-05-22 验证现状)

### 后端 (全部仍存在 insight 残留)

- `backend/app/db/models.py:58` — `insights_used` 列 (数据库字段)
- `backend/app/api/v1/chat.py` — `insights_used` 在请求/响应 schema 中
- `backend/app/services/conversation_engine.py:225-261` — 按 `memory_type == "insight"` 分拣记忆注入 prompt (V2 后已是死代码)

### 前端 (10+ 文件, 全部仍存在 insight 残留)

- `frontend/app/memories/page.tsx:126` — `allowedTypes={['insight']}`
- `frontend/app/memories/[id]/MemoryDetailClient.tsx:299` — insight 下拉选项
- `frontend/app/admin/users/[id]/page.tsx` — insight 统计
- `frontend/app/admin/page.tsx:254` — insight 统计 (另一处)
- `frontend/app/analysis/page.tsx` — `key_insights` 字段 (待 verify 是否仍存在)
- `frontend/components/MemoryFilters.tsx:21` — insight 筛选项
- `frontend/components/memories/MemoryStore.tsx` — insight tab 和颜色
- `frontend/components/MemoryList.tsx` — insight 颜色和标签
- `frontend/components/MemoryTimeline.tsx` — insight 颜色和标签
- `frontend/components/DebugPanel.tsx` — `fetch_insights` 字段
- `frontend/lib/api-client.ts` — insight 相关类型定义
- `frontend/lib/utils.ts` — insight 颜色和中文标签映射

## 完成标准

1. 后端 `insights_used` 重命名为 `traits_used` (含数据库迁移)
2. `conversation_engine.py` 移除 insight 分拣, 改为按 trait 处理
3. 前端所有 insight 引用替换为 trait (筛选器、颜色、标签、类型定义)
4. 全项目 `grep -ri insight` 无功能性残留 (注释中的历史说明可保留)
5. 数据库迁移脚本: 已有的 memory_type='insight' 行升级为 trait (与 SDK 0.11 迁移对齐)

## 推进顺序建议

1. 先做 `todo-sdk-upgrade-0.12.1.md` (验证 nm.profile_view, nm.digest 等新 API 可用)
2. **合并** v2-profile-alignment 与本 todo 一起做, 不要分两轮
3. 单 PR 提交 + 数据库迁移一并执行

## 2026-05-22 验证结论

grep 全项目 `insights_used / insight.*洞察 / allowedTypes.*insight` 命中 25+ 文件, 无任何子任务已完成,
状态与 2026-03-08 创建时一致。Me2 在过去 2.5 个月没有推进此 todo, 但产品仍可运行 (因为 insight 字段恒为 0, 死代码不影响功能)。

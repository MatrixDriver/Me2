---
title: "对齐 V2 记忆分类体系:Profile + insight 残留清理"
type: todo
status: open
priority: high
on_hold: true
on_hold_since: "2026-06-15"
created_at: 2026-03-04T12:00:00
updated_at: 2026-06-15T12:00:00+08:00
related:
  - D:/CODE/NeuroMem/docs/design/memory-classification-v2.md
  - D:/CODE/me2/rpiv/todo/todo-sdk-upgrade-0.12.1.md
  - D:/CODE/me2/rpiv/todo/todo-cleanup-insight-remnants.md
---

# 对齐 V2 记忆分类体系:Profile + insight 残留清理

> ⏸️ **2026-06-15 用户主动暂缓 (on hold)**: 用户集中力量先推进 NeuroMem SDK + neuromem-cloud 两个子项目, Me2 短期不推进、不主动提醒。**重启条件**: 用户主动重提 Me2。本 todo 内容与依赖关系不变 (仍 blocked by `todo-sdk-upgrade-0.12.1.md`)。

## 🚨 Blocked By

**`todo-sdk-upgrade-0.12.1.md` (high priority, open)** — Me2 当前仍 `neuromem==0.9.4`,
本 todo 所有子任务 (M1-M7) 都依赖 SDK 0.10+ 的能力:
- `nm.profile_view()` API (SDK 0.10+ 新增, M1/M2 需要)
- insight→trait 重命名 (SDK 0.11 破坏性变更, M3-M7 需要)
- `profile_view()` 返回的 `{facts, traits, recent_mood}` 数据结构 (M2/M7 需要)

**不要在 SDK 升级完成前推进本 todo**, 否则会引入临时兼容层后再删, 浪费工时。

## 背景

2026-03-04 全面审计发现 Me2 的 profile 逻辑和 memory_type 使用与 V2 记忆分类体系存在多处不一致。SDK 和 Cloud 已率先修复, Me2 需要跟进。

## 进度总览 (2026-05-22 重新验证)

**7 项 (M1-M7) 全部未做**。Me2 后端 / 前端从 2026-03-04 审计到现在状态无变化:

| M# | 子任务 | 状态 | 证据 |
|----|--------|------|------|
| M1 | backend GET /memories/profile 改用 nm.profile_view() | ❌ 未做 | `memories.py:59` 仍 `nm.kv.list(current_user.id, "profile")` |
| M2 | conversation_engine._build_prompt() 适配新数据结构 | ❌ 未做 | `conversation_engine.py` 仍硬编码 label_map |
| M3 | 前端 MemoryDetailClient.tsx 删 insight 选项 | ❌ 未做 | grep `insight.*洞察` 命中 |
| M4 | 前端 memories/page.tsx 删 insight tab | ❌ 未做 | grep `allowedTypes.*insight` 命中 |
| M5 | 管理后台 admin/users/[id]/page.tsx 统计改 trait | ❌ 未做 | grep 命中 |
| M6 | 后端 insights_used 字段废弃 | ❌ 未做 | `chat.py`/`models.py`/`conversation_engine.py` 均命中 |
| M7 | 前端 ProfileSection 改动态读取 | ❌ 未做 | `ProfileSection.tsx` 仍硬编码 PROFILE_FIELDS |

与 `todo-cleanup-insight-remnants.md` 高度重叠 — M3-M6 几乎完全等同于该 todo 的工作。
建议 SDK 升级后**合并执行**, 避免重复 Grep / 重复测试。

> **(2026-06-14) `todo-cleanup-insight-remnants.md` 已归档合并入本 todo**(它是本 todo 真子集)。其后端/前端 insight 残留清单(后端 `conversation_engine.py:225-261`/`models.py:58`/`chat.py`, 前端 24 处/12 文件)与本 todo M3-M7 一致, SDK 升级后由本 todo 一次性执行。

## 变更清单 (保留原详细方案)

### P0:Profile 架构对齐

#### M1. 后端 `GET /memories/profile` 改用 `nm.profile_view()`

- **文件**:`backend/app/api/v1/memories.py:54-80`
- **现状 (2026-05-22)**:`memories.py:59` 仍 `items = await nm.kv.list(current_user.id, "profile")`
- **目标**:改为调用 `nm.profile_view(user_id)`, 返回 `{facts, traits, recent_mood}`
- **注意**:`PUT /profile/{key}` 端点也需要重新评估 — 如果保留用户手动编辑能力, 应写入 fact 而非 kv_store

#### M2. 后端 `conversation_engine._build_prompt()` 适配新数据结构

- **文件**:`backend/app/services/conversation_engine.py:206-220`
- **现状**:`label_map` 硬编码 `{identity, occupation, interests, preferences, values, relationships, personality}`, 期望扁平化 dict
- **目标**:适配 `profile_view()` 返回的 `{facts: {category: value}, traits: [...], recent_mood: {...}}`
- **建议实现**:见原 todo (`_format_profile` 函数), 保持不变

### P1:insight 残留清理

#### M3. 前端记忆编辑界面删除 insight 选项

- **文件**:`frontend/app/memories/[id]/MemoryDetailClient.tsx:299`
- **操作**:删除 `<option value="insight">洞察</option>` 选项

#### M4. 前端"反思"标签页删除 insight 输入

- **文件**:`frontend/app/memories/page.tsx:126`
- **操作**:删除 `<MemoryStore allowedTypes={['insight']} />` 或重构为只展示 reflection 结果
  (违反 V2 核心规范:trait 只能由 reflection 引擎产生)

#### M5. 管理后台统计改用 trait

- **文件**:`frontend/app/admin/users/[id]/page.tsx:27`
- **现状**:`insight: { label: '洞察', icon: Lightbulb, color: 'bg-amber-500' }`
- **操作**:改为 `trait: { label: '特征', icon: ..., color: ... }`

- **文件**:`frontend/app/admin/page.tsx:254`
- **现状**:`{ label: '洞察', value: memories?.by_type?.insight || 0 }`
- **操作**:改为 trait 统计

#### M6. 后端 `insights_used` 字段废弃

- **文件**:`backend/app/db/models.py:58` — `insights_used = Column(JSON, nullable=True)`
- **文件**:`backend/app/api/v1/chat.py:33,74` — `insights_used: int`
- **文件**:`backend/app/services/conversation_engine.py:174,466` — `"insights_used": 0`
- **现状 (2026-06-14 复核)**:`insights_used` (backend) 写入端恒为 0；但 `backend/app/api/v1/chat.py:301/357/553` 已从 `msg.meta.get("insights_count")` 实际**读取**填充 — 故并非纯死代码, 重命名/废弃时需一并处理这些读取点
- **操作**:删除/重命名所有引用 (含上述读取点), 数据库字段标记废弃

### P1:前端 ProfileSection 字段灵活化

#### M7. 前端 ProfileSection 改为动态读取

- **文件**:`frontend/components/memories/ProfileSection.tsx:27-34`
- **现状**:硬编码 `PROFILE_FIELDS = [{key: 'identity'}, {key: 'occupation'}, ...]`
- **目标**:从 API 响应的 `facts` 键动态生成字段列表

## 测试要求

- `_build_prompt()` 使用新 profile 结构后, 对话质量不退化
- 管理后台统计数据正确显示 trait 而非 insight
- 记忆编辑界面不再出现 insight 选项

## 推进建议 (2026-05-22 新增)

**顺序**:

1. 先做 `todo-sdk-upgrade-0.12.1.md` (high)
2. SDK 升级完成后, 一次性合并执行 M1-M7 + `todo-cleanup-insight-remnants.md`
3. 单次提交一个 PR (前后端 + 数据库迁移一起), 因为这些改动跨多个文件且强相关

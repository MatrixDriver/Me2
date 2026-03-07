---
title: "对齐 V2 记忆分类体系：Profile + insight 残留清理"
type: refactor
status: open
priority: high
created_at: 2026-03-04T12:00:00
updated_at: 2026-03-04T12:00:00
related:
  - D:/CODE/NeuroMem/docs/design/memory-classification-v2.md
  - D:/CODE/neuromem-cloud/rpiv/todo/feature-sidebar-cognitive-hierarchy-restructure.md
---

# 对齐 V2 记忆分类体系：Profile + insight 残留清理

## 背景

2026-03-04 全面审计发现 Me2 的 profile 逻辑和 memory_type 使用与 V2 记忆分类体系存在多处不一致。SDK 和 Cloud 已率先修复，Me2 需要跟进。

## 变更清单

### P0：Profile 架构对齐

#### M1. 后端 `GET /memories/profile` 改用 `nm.profile_view()`

- **文件**: `backend/app/api/v1/memories.py:54-80`
- **现状**: 读 `nm.kv.list(user_id, "profile")`，返回 kv_store 静态数据
- **目标**: 改为调用 `nm.profile_view(user_id)`，返回 `{facts, traits, recent_mood}`
- **注意**: `PUT /profile/{key}` 端点也需要重新评估——如果保留用户手动编辑能力，应写入 fact 而非 kv_store

#### M2. 后端 `conversation_engine._build_prompt()` 适配新数据结构

- **文件**: `backend/app/services/conversation_engine.py:206-220`
- **现状**: `label_map` 硬编码 `{identity, occupation, interests, preferences, values, relationships, personality}`，期望扁平化 dict
- **目标**: 适配 `profile_view()` 返回的 `{facts: {category: value}, traits: [...], recent_mood: {...}}`
- **建议实现**:
  ```python
  def _format_profile(self, profile: dict) -> str:
      lines = []
      # facts
      for cat, val in profile.get("facts", {}).items():
          if isinstance(val, list):
              lines.append(f"- {cat}: {', '.join(str(v) for v in val)}")
          else:
              lines.append(f"- {cat}: {val}")
      # top traits
      for t in profile.get("traits", [])[:5]:
          stage_label = t.get("stage", "")
          lines.append(f"- [{stage_label}] {t['content']}")
      # mood
      mood = profile.get("recent_mood")
      if mood:
          lines.append(f"- 近期情绪: valence={mood['valence_avg']}, arousal={mood['arousal_avg']}")
      return "\n".join(lines) if lines else "暂无"
  ```

### P1：insight 残留清理

#### M3. 前端记忆编辑界面删除 insight 选项

- **文件**: `frontend/app/memories/[id]/MemoryDetailClient.tsx:299`
- **现状**: `<option value="insight">洞察</option>` 仍存在
- **操作**: 删除该选项

#### M4. 前端"反思"标签页删除 insight 输入

- **文件**: `frontend/app/memories/page.tsx:126`
- **现状**: `<MemoryStore allowedTypes={['insight']} />` 允许用户手动创建 insight
- **操作**: 删除或重构为只展示 reflection 结果（违反 V2 核心规范：trait 只能由 reflection 引擎产生）

#### M5. 管理后台统计改用 trait

- **文件**: `frontend/app/admin/users/[id]/page.tsx:27`
- **现状**: `insight: { label: '洞察', icon: Lightbulb, color: 'bg-amber-500' }`
- **操作**: 改为 `trait: { label: '特征', icon: ..., color: ... }`

- **文件**: `frontend/app/admin/page.tsx:254`
- **现状**: `{ label: '洞察', value: memories?.by_type?.insight || 0 }`
- **操作**: 改为 trait 统计

#### M6. 后端 `insights_used` 字段废弃

- **文件**: `backend/app/db/models.py:58` — `insights_used = Column(JSON, nullable=True)`
- **文件**: `backend/app/api/v1/chat.py:33,74` — `insights_used: int`
- **文件**: `backend/app/services/conversation_engine.py:174,466` — `"insights_used": 0`
- **现状**: 字段恒为 0，从未填充
- **操作**: 删除所有引用，数据库字段标记废弃

### P1：前端 ProfileSection 字段灵活化

#### M7. 前端 ProfileSection 改为动态读取

- **文件**: `frontend/components/memories/ProfileSection.tsx:27-34`
- **现状**: 硬编码 `PROFILE_FIELDS = [{key: 'identity'}, {key: 'occupation'}, ...]`
- **目标**: 从 API 响应的 `facts` 键动态生成字段列表

## 测试要求

- `_build_prompt()` 使用新 profile 结构后，对话质量不退化
- 管理后台统计数据正确显示 trait 而非 insight
- 记忆编辑界面不再出现 insight 选项

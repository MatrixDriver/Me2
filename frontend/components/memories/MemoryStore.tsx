'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  Loader2,
  ChevronDown,
  ChevronUp,
  Trash2,
  Edit,
  Calendar,
  Tag,
  Clock,
  List,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { getMemoryTypeName, getMemoryTypeColor } from '@/lib/utils';
import MemoryTimeline from '@/components/MemoryTimeline';

interface Memory {
  id: string;
  content: string;
  memory_type: string;
  timestamp: string;
  created_at?: string;
  metadata?: Record<string, any>;
  access_count?: number;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || '/api/v1';

function getAuthHeaders(): Record<string, string> {
  const token = localStorage.getItem('me2_access_token');
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
}

const TYPE_FILTERS = [
  { key: 'all', label: '全部' },
  { key: 'fact', label: '事实' },
  { key: 'episodic', label: '情节' },
  { key: 'insight', label: '洞察' },
];

const TYPE_COLORS: Record<string, string> = {
  fact: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  episodic: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  insight: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
};

const PAGE_SIZE = 20;

export default function MemoryStore({ allowedTypes }: { allowedTypes?: string[] }) {
  const singleType = allowedTypes?.length === 1 ? allowedTypes[0] : undefined;
  const [memories, setMemories] = useState<Memory[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [typeFilter, setTypeFilter] = useState(singleType ?? 'all');
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<'list' | 'timeline'>('list');

  // Timeline state
  const [timeline, setTimeline] = useState<any[]>([]);
  const [granularity, setGranularity] = useState<'day' | 'week' | 'month'>('day');
  const [timelineLoaded, setTimelineLoaded] = useState(false);

  // Stats
  const [stats, setStats] = useState<any>(null);

  const loadMemories = useCallback(async () => {
    setLoading(true);
    try {
      const mt = typeFilter === 'all' ? '' : `&memory_type=${typeFilter}`;
      const response = await fetch(
        `${API_BASE}/memories/?limit=${PAGE_SIZE}&offset=${page * PAGE_SIZE}${mt}`,
        { headers: getAuthHeaders() }
      );
      if (response.ok) {
        const data = await response.json();
        let items = data.items || [];
        // Client-side filter when showing "全部" but restricted to allowedTypes
        if (typeFilter === 'all' && allowedTypes && allowedTypes.length > 1) {
          items = items.filter((m: Memory) => allowedTypes.includes(m.memory_type));
        }
        setMemories(items);
        setTotal(data.total || 0);
      }
    } catch (error) {
      console.error('加载记忆失败:', error);
    } finally {
      setLoading(false);
    }
  }, [page, typeFilter, allowedTypes]);

  const loadStats = async () => {
    try {
      const response = await fetch(`${API_BASE}/memories/stats`, {
        headers: getAuthHeaders(),
      });
      if (response.ok) {
        setStats(await response.json());
      }
    } catch (error) {
      console.error('加载统计失败:', error);
    }
  };

  const loadTimeline = async (gran: 'day' | 'week' | 'month') => {
    try {
      const response = await fetch(
        `${API_BASE}/memories/timeline?granularity=${gran}&days=30`,
        { headers: getAuthHeaders() }
      );
      if (response.ok) {
        const data = await response.json();
        setTimeline(data.timeline || []);
        setTimelineLoaded(true);
      }
    } catch (error) {
      console.error('加载时间线失败:', error);
    }
  };

  useEffect(() => {
    loadMemories();
    loadStats();
  }, [loadMemories]);

  const handleDelete = async (id: string) => {
    if (!confirm('确定要删除这条记忆吗？')) return;
    try {
      const response = await fetch(`${API_BASE}/memories/${id}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });
      if (response.ok) {
        loadMemories();
        loadStats();
      }
    } catch (error) {
      console.error('删除失败:', error);
    }
  };

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const s = new Set(prev);
      s.has(id) ? s.delete(id) : s.add(id);
      return s;
    });
  };

  const handleViewModeChange = (mode: 'list' | 'timeline') => {
    setViewMode(mode);
    if (mode === 'timeline' && !timelineLoaded) {
      loadTimeline(granularity);
    }
  };

  const handleGranularityChange = (gran: 'day' | 'week' | 'month') => {
    setGranularity(gran);
    loadTimeline(gran);
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="p-6">
      {/* 统计 */}
      {stats && (
        <div className="mb-4 text-sm text-gray-500 dark:text-gray-400">
          共 {total} 条记忆
        </div>
      )}

      {/* 过滤 + 视图切换 + 清除 */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        {!singleType && (
          <div className="flex flex-wrap gap-2">
            {TYPE_FILTERS.filter(
              (f) => f.key === 'all' || !allowedTypes || allowedTypes.includes(f.key)
            ).map((f) => (
              <button
                key={f.key}
                onClick={() => {
                  setTypeFilter(f.key);
                  setPage(0);
                }}
                className={`px-3 py-1.5 rounded-full text-sm transition-colors ${
                  typeFilter === f.key
                    ? 'bg-blue-500 text-white'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                }`}
              >
                {f.label}
                {stats?.by_type?.[f.key] !== undefined && (
                  <span className="ml-1 text-xs opacity-75">
                    ({stats.by_type[f.key]})
                  </span>
                )}
              </button>
            ))}
          </div>
        )}

        <div className="flex gap-1">
          <button
            onClick={() => handleViewModeChange('list')}
            className={`p-2 rounded transition-colors ${
              viewMode === 'list'
                ? 'bg-blue-100 text-blue-600 dark:bg-blue-900 dark:text-blue-400'
                : 'text-gray-400 hover:text-gray-600'
            }`}
          >
            <List className="w-4 h-4" />
          </button>
          <button
            onClick={() => handleViewModeChange('timeline')}
            className={`p-2 rounded transition-colors ${
              viewMode === 'timeline'
                ? 'bg-blue-100 text-blue-600 dark:bg-blue-900 dark:text-blue-400'
                : 'text-gray-400 hover:text-gray-600'
            }`}
          >
            <Clock className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 内容 */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
        </div>
      ) : viewMode === 'timeline' ? (
        <MemoryTimeline
          timeline={timeline}
          granularity={granularity}
          onGranularityChange={handleGranularityChange}
        />
      ) : (
        <>
          {/* 列表 */}
          {memories.length === 0 ? (
            <div className="text-center py-12 text-gray-500 dark:text-gray-400">
              {singleType === 'insight' ? (
                <div className="space-y-2">
                  <div>暂无洞察记忆</div>
                  <div className="text-xs text-gray-400 dark:text-gray-500 max-w-xs mx-auto">
                    多聊几轮后，系统会自动分析对话，提炼出关于你的高层洞察
                  </div>
                </div>
              ) : (
                '暂无记忆数据'
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {memories.map((memory) => {
                const isExpanded = expandedIds.has(memory.id);
                const preview =
                  memory.content.length > 120
                    ? memory.content.slice(0, 120) + '...'
                    : memory.content;
                const typeClass =
                  TYPE_COLORS[memory.memory_type] || 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200';

                return (
                  <div
                    key={memory.id}
                    className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 hover:shadow-md transition-shadow"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className={`px-2 py-0.5 rounded text-xs font-medium ${typeClass}`}
                        >
                          {getMemoryTypeName(memory.memory_type)}
                        </span>
                        <span className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                          <Calendar className="w-3 h-3" />
                          {memory.timestamp
                            ? new Date(memory.timestamp).toLocaleDateString('zh-CN')
                            : '未知'}
                        </span>
                        {memory.access_count !== undefined && memory.access_count > 0 && (
                          <span className="text-xs text-gray-400">
                            访问 {memory.access_count}x
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        <a
                          href={`/memories/${memory.id}`}
                          className="p-1 text-gray-400 hover:text-blue-600 transition-colors"
                          title="编辑"
                        >
                          <Edit className="w-4 h-4" />
                        </a>
                        <button
                          onClick={() => handleDelete(memory.id)}
                          className="p-1 text-gray-400 hover:text-red-600 transition-colors"
                          title="删除"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    <div className="text-gray-800 dark:text-gray-200 text-sm">
                      {isExpanded ? memory.content : preview}
                    </div>

                    {memory.content.length > 120 && (
                      <button
                        onClick={() => toggleExpand(memory.id)}
                        className="flex items-center gap-1 text-xs text-blue-600 mt-2 hover:text-blue-700"
                      >
                        {isExpanded ? (
                          <>
                            <ChevronUp className="w-3 h-3" /> 收起
                          </>
                        ) : (
                          <>
                            <ChevronDown className="w-3 h-3" /> 展开
                          </>
                        )}
                      </button>
                    )}

                    {/* Metadata (expanded only) */}
                    {isExpanded && memory.metadata && Object.keys(memory.metadata).length > 0 && (
                      <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700">
                        <div className="flex items-center gap-1 text-xs text-gray-500 mb-1">
                          <Tag className="w-3 h-3" /> 元数据
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {Object.entries(memory.metadata)
                            .filter(([k]) => !k.startsWith('_'))
                            .slice(0, 8)
                            .map(([k, v]) => (
                              <span
                                key={k}
                                className="px-2 py-0.5 bg-gray-50 dark:bg-gray-700 rounded text-xs text-gray-600 dark:text-gray-400"
                              >
                                {k}: {typeof v === 'object' ? JSON.stringify(v).slice(0, 30) : String(v).slice(0, 30)}
                              </span>
                            ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* 分页 */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-3 mt-6">
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                className="p-2 rounded disabled:opacity-30"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-sm text-gray-600 dark:text-gray-400">
                {page + 1} / {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                className="p-2 rounded disabled:opacity-30"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

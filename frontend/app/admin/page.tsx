'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  Users, MessageCircle, Database, Network, MessagesSquare,
  Loader2, RefreshCw, Clock, Cpu, Activity, Zap,
  AlertTriangle, Server, BarChart3, Brain, Trash2,
} from 'lucide-react';
import StatsCard from '@/components/admin/StatsCard';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || '/api/v1';
const REFRESH_INTERVAL = 30_000;

function getAuthHeaders(): Record<string, string> {
  const token = localStorage.getItem('me2_access_token');
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
}

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const parts: string[] = [];
  if (d > 0) parts.push(`${d}天`);
  if (h > 0 || d > 0) parts.push(`${h}时`);
  parts.push(`${m}分`);
  return parts.join(' ');
}

function formatNumber(n: number): string {
  return (n ?? 0).toLocaleString();
}

interface HealthData {
  uptime_seconds: number;
  neuromemory_version: string;
  db_pool: { size: number; checked_in: number; checked_out: number; overflow: number };
}

interface ApiStatsData {
  total_requests: number;
  error_count: number;
  endpoints: Record<string, { count: number; avg_ms: number; p95_ms: number }>;
}

interface LlmStatsData {
  total_calls: number;
  today_calls: number;
  total_prompt_tokens: number;
  total_completion_tokens: number;
  avg_duration_ms: number;
  failure_rate: number;
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<any>(null);
  const [health, setHealth] = useState<HealthData | null>(null);
  const [apiStats, setApiStats] = useState<ApiStatsData | null>(null);
  const [llmStats, setLlmStats] = useState<LlmStatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [showResetModal, setShowResetModal] = useState(false);
  const [resetConfirmText, setResetConfirmText] = useState('');
  const [resetting, setResetting] = useState(false);
  const [resetResult, setResetResult] = useState<Record<string, number> | null>(null);
  const [resetError, setResetError] = useState('');

  const fetchAll = useCallback(async (isManual = false) => {
    if (isManual) setRefreshing(true);
    try {
      const headers = getAuthHeaders();
      const [dashRes, healthRes, apiRes, llmRes] = await Promise.allSettled([
        fetch(`${API_BASE}/admin/dashboard`, { headers }),
        fetch(`${API_BASE}/admin/system/health`, { headers }),
        fetch(`${API_BASE}/admin/system/api-stats?hours=24`, { headers }),
        fetch(`${API_BASE}/admin/system/llm-stats?hours=24`, { headers }),
      ]);

      if (dashRes.status === 'fulfilled' && dashRes.value.ok)
        setStats(await dashRes.value.json());
      if (healthRes.status === 'fulfilled' && healthRes.value.ok)
        setHealth(await healthRes.value.json());
      if (apiRes.status === 'fulfilled' && apiRes.value.ok)
        setApiStats(await apiRes.value.json());
      if (llmRes.status === 'fulfilled' && llmRes.value.ok)
        setLlmStats(await llmRes.value.json());

      setLastRefresh(new Date());
    } catch (e) {
      console.error('Failed to load dashboard:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const handleResetAll = useCallback(async () => {
    setResetting(true);
    setResetError('');
    setResetResult(null);
    try {
      const res = await fetch(`${API_BASE}/admin/reset-all`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: '请求失败' }));
        throw new Error(err.detail || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setResetResult(data.deleted);
      setResetConfirmText('');
      // 刷新仪表盘数据
      fetchAll();
    } catch (e: any) {
      setResetError(e.message || '重置失败');
    } finally {
      setResetting(false);
    }
  }, [fetchAll]);

  useEffect(() => {
    fetchAll();
    const timer = setInterval(() => fetchAll(), REFRESH_INTERVAL);
    return () => clearInterval(timer);
  }, [fetchAll]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const { users, sessions, messages, memories } = stats ?? {};

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">仪表盘</h1>
        <div className="flex items-center gap-3">
          {lastRefresh && (
            <span className="text-xs text-muted-foreground/50">
              更新于 {lastRefresh.toLocaleTimeString('zh-CN')}
            </span>
          )}
          <button
            onClick={() => fetchAll(true)}
            disabled={refreshing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            刷新
          </button>
        </div>
      </div>

      {/* 数据总览 */}
      {stats && (
        <section className="space-y-3">
          <h2 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <BarChart3 className="w-4 h-4" />
            数据总览
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatsCard
              title="用户"
              value={users?.total ?? 0}
              icon={Users}
              trend={[
                { label: '7天活跃', value: users?.active_7d ?? 0 },
                { label: '管理员', value: users?.admin_count ?? 0 },
              ]}
            />
            <StatsCard
              title="会话"
              value={sessions?.total ?? 0}
              icon={MessagesSquare}
              trend={[
                { label: '7天活跃', value: sessions?.active_7d ?? 0 },
              ]}
            />
            <StatsCard
              title="消息"
              value={messages?.total ?? 0}
              icon={MessageCircle}
              trend={[{ label: '近7天', value: messages?.last_7d ?? 0 }]}
            />
            <StatsCard
              title="记忆"
              value={memories?.total ?? 0}
              icon={Database}
              trend={[
                { label: '事实', value: memories?.by_type?.fact || 0 },
                { label: '情景', value: memories?.by_type?.episodic || 0 },
                ...(memories?.graph_nodes > 0 || memories?.graph_edges > 0
                  ? [{ label: '节点/边', value: `${memories.graph_nodes}/${memories.graph_edges}` }]
                  : [{ label: '洞察', value: memories?.by_type?.insight || 0 }]),
              ]}
            />
          </div>
        </section>
      )}

      {/* 服务状态 */}
      {health && (
        <section className="space-y-3">
          <h2 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <Server className="w-4 h-4" />
            服务状态
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="glass-card rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-muted-foreground text-sm">运行时间</span>
                <Clock className="w-4 h-4 text-muted-foreground/50" />
              </div>
              <div className="text-2xl font-bold text-foreground">
                {formatUptime(health.uptime_seconds)}
              </div>
            </div>

            <div className="glass-card rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-muted-foreground text-sm">NeuroMemory</span>
                <Cpu className="w-4 h-4 text-muted-foreground/50" />
              </div>
              <div className="text-2xl font-bold text-foreground">
                v{health.neuromemory_version}
              </div>
            </div>

            <div className="glass-card rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-muted-foreground text-sm">连接池</span>
                <Database className="w-4 h-4 text-muted-foreground/50" />
              </div>
              <div className="text-2xl font-bold text-foreground">
                {health.db_pool.checked_out}/{health.db_pool.size}
              </div>
              <div className="flex gap-3 mt-2">
                <span className="text-xs text-muted-foreground/50">
                  空闲: <span className="text-foreground/70">{health.db_pool.checked_in}</span>
                </span>
                <span className="text-xs text-muted-foreground/50">
                  溢出: <span className="text-foreground/70">{health.db_pool.overflow}</span>
                </span>
              </div>
            </div>

            <div className="glass-card rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-muted-foreground text-sm">状态</span>
                <Activity className="w-4 h-4 text-muted-foreground/50" />
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full bg-green-400 animate-pulse" />
                <span className="text-2xl font-bold text-green-400">正常</span>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* LLM 用量 */}
      {llmStats && (
        <section className="space-y-3">
          <h2 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <Brain className="w-4 h-4" />
            LLM 用量
            <span className="text-xs text-muted-foreground/50">(24小时)</span>
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="glass-card rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-muted-foreground text-sm">调用次数</span>
                <Zap className="w-4 h-4 text-muted-foreground/50" />
              </div>
              <div className="text-2xl font-bold text-foreground">
                {formatNumber(llmStats.total_calls)}
              </div>
              <div className="text-xs text-muted-foreground/50 mt-1">
                今天: <span className="text-foreground/70">{formatNumber(llmStats.today_calls)}</span>
              </div>
            </div>

            <div className="glass-card rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-muted-foreground text-sm">Token 用量</span>
                <BarChart3 className="w-4 h-4 text-muted-foreground/50" />
              </div>
              <div className="text-2xl font-bold text-foreground">
                {formatNumber((llmStats.total_prompt_tokens || 0) + (llmStats.total_completion_tokens || 0))}
              </div>
              <div className="flex gap-3 mt-2">
                <span className="text-xs text-muted-foreground/50">
                  输入: <span className="text-foreground/70">{formatNumber(llmStats.total_prompt_tokens)}</span>
                </span>
                <span className="text-xs text-muted-foreground/50">
                  输出: <span className="text-foreground/70">{formatNumber(llmStats.total_completion_tokens)}</span>
                </span>
              </div>
            </div>

            <div className="glass-card rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-muted-foreground text-sm">平均耗时</span>
                <Clock className="w-4 h-4 text-muted-foreground/50" />
              </div>
              <div className="text-2xl font-bold text-foreground">
                {(llmStats.avg_duration_ms ?? 0).toFixed(0)}
                <span className="text-sm font-normal text-muted-foreground ml-1">ms</span>
              </div>
            </div>

            <div className="glass-card rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-muted-foreground text-sm">失败率</span>
                <AlertTriangle className="w-4 h-4 text-muted-foreground/50" />
              </div>
              <div className={`text-2xl font-bold ${(llmStats.failure_rate ?? 0) > 0.05 ? 'text-red-400' : 'text-green-400'}`}>
                {((llmStats.failure_rate ?? 0) * 100).toFixed(2)}%
              </div>
            </div>
          </div>
        </section>
      )}

      {/* API 性能 */}
      {apiStats && (
        <section className="space-y-3">
          <h2 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <Zap className="w-4 h-4" />
            API 性能
            <span className="text-xs text-muted-foreground/50">(24小时)</span>
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="glass-card rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-muted-foreground text-sm">总请求</span>
                <Zap className="w-4 h-4 text-muted-foreground/50" />
              </div>
              <div className="text-2xl font-bold text-foreground">
                {formatNumber(apiStats.total_requests)}
              </div>
            </div>
            <div className="glass-card rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-muted-foreground text-sm">错误</span>
                <AlertTriangle className="w-4 h-4 text-muted-foreground/50" />
              </div>
              <div className="text-2xl font-bold text-foreground">
                {formatNumber(apiStats.error_count)}
              </div>
              {apiStats.total_requests > 0 && (
                <div className="text-xs text-muted-foreground/50 mt-1">
                  错误率 {((apiStats.error_count / apiStats.total_requests) * 100).toFixed(2)}%
                </div>
              )}
            </div>
          </div>

          {apiStats.endpoints && Object.keys(apiStats.endpoints).length > 0 && (
            <div className="glass-card rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/5">
                      <th className="text-left px-4 py-3 text-muted-foreground font-medium">接口</th>
                      <th className="text-right px-4 py-3 text-muted-foreground font-medium">次数</th>
                      <th className="text-right px-4 py-3 text-muted-foreground font-medium">平均 (ms)</th>
                      <th className="text-right px-4 py-3 text-muted-foreground font-medium">P95 (ms)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(apiStats.endpoints)
                      .sort(([, a], [, b]) => b.count - a.count)
                      .map(([endpoint, s]) => (
                        <tr key={endpoint} className="border-b border-white/5 last:border-b-0 hover:bg-white/5 transition-colors">
                          <td className="px-4 py-3 font-mono text-xs text-foreground">{endpoint}</td>
                          <td className="px-4 py-3 text-right text-foreground tabular-nums">{formatNumber(s.count)}</td>
                          <td className="px-4 py-3 text-right text-foreground tabular-nums">{s.avg_ms?.toFixed(1) ?? '-'}</td>
                          <td className="px-4 py-3 text-right text-foreground tabular-nums">{s.p95_ms?.toFixed(1) ?? '-'}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>
      )}

      {!stats && !health && !apiStats && !llmStats && (
        <div className="text-center py-20 text-muted-foreground">
          加载数据失败
        </div>
      )}

      {/* 危险操作 */}
      <section className="space-y-3">
        <h2 className="text-sm font-medium text-red-400 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4" />
          危险操作
        </h2>
        <div className="border border-red-500/30 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-foreground">重置所有数据</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                删除所有用户、会话、消息、记忆、图谱等数据，重建默认 admin 账号
              </p>
            </div>
            <button
              onClick={() => { setShowResetModal(true); setResetConfirmText(''); setResetError(''); setResetResult(null); }}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-red-600 text-white hover:bg-red-700 transition-colors flex items-center gap-2 shrink-0"
            >
              <Trash2 className="w-4 h-4" />
              重置所有数据
            </button>
          </div>
        </div>
      </section>

      {/* 重置确认弹窗 */}
      {showResetModal && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          onClick={() => { if (!resetting) { setShowResetModal(false); } }}
        >
          <div
            role="dialog"
            aria-modal="true"
            className="bg-[hsl(var(--card))] border border-white/10 rounded-xl shadow-xl max-w-md w-full p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-900/50 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5 text-red-400" />
              </div>
              <h3 className="text-base font-semibold text-foreground">确认重置所有数据</h3>
            </div>

            {resetResult ? (
              <div className="space-y-3">
                <p className="text-sm text-green-400 font-medium">重置完成！已删除数据：</p>
                <div className="bg-black/20 rounded-lg p-3 space-y-1">
                  {Object.entries(resetResult).map(([table, count]) => (
                    <div key={table} className="flex justify-between text-xs">
                      <span className="text-muted-foreground font-mono">{table}</span>
                      <span className="text-foreground tabular-nums">{count} 条</span>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">默认 admin 账号已重建（admin / Me2Admin@2026）</p>
                <button
                  onClick={() => setShowResetModal(false)}
                  className="w-full px-4 py-2 rounded-lg text-sm font-medium bg-white/10 text-foreground hover:bg-white/20 transition-colors"
                >
                  关闭
                </button>
              </div>
            ) : (
              <>
                <p className="text-sm text-muted-foreground mb-2">
                  此操作将永久删除以下所有数据：
                </p>
                <ul className="text-sm text-muted-foreground/80 mb-4 space-y-1 list-disc list-inside">
                  <li>所有用户账号</li>
                  <li>所有会话和消息</li>
                  <li>所有记忆条目和文档</li>
                  <li>知识图谱节点和边</li>
                  <li>情感档案和键值数据</li>
                </ul>
                <p className="text-sm text-muted-foreground mb-3">
                  操作完成后将自动重建默认 admin 账号。请在下方输入 <span className="font-mono font-bold text-red-400">RESET</span> 确认：
                </p>
                <input
                  type="text"
                  value={resetConfirmText}
                  onChange={(e) => setResetConfirmText(e.target.value)}
                  placeholder="输入 RESET 确认"
                  className="w-full px-3 py-2 rounded-lg bg-black/20 border border-white/10 text-foreground text-sm font-mono placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-red-500/50 mb-3"
                  disabled={resetting}
                />
                {resetError && (
                  <p className="text-sm text-red-400 mb-3">{resetError}</p>
                )}
                <div className="flex gap-3">
                  <button
                    onClick={() => setShowResetModal(false)}
                    disabled={resetting}
                    className="flex-1 px-4 py-2 rounded-lg text-sm font-medium bg-white/10 text-foreground hover:bg-white/20 transition-colors disabled:opacity-50"
                  >
                    取消
                  </button>
                  <button
                    onClick={handleResetAll}
                    disabled={resetting || resetConfirmText !== 'RESET'}
                    className="flex-1 px-4 py-2 rounded-lg text-sm font-medium bg-red-600 text-white hover:bg-red-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {resetting && <Loader2 className="w-4 h-4 animate-spin" />}
                    {resetting ? '重置中...' : '确认重置'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

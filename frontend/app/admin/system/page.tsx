'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  Activity, Database, Clock, Cpu, Zap, AlertTriangle,
  RefreshCw, Loader2, Server, BarChart3, Brain,
} from 'lucide-react';

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

export default function SystemMonitoringPage() {
  const [health, setHealth] = useState<HealthData | null>(null);
  const [apiStats, setApiStats] = useState<ApiStatsData | null>(null);
  const [llmStats, setLlmStats] = useState<LlmStatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const fetchAll = useCallback(async (isManual = false) => {
    if (isManual) setRefreshing(true);
    try {
      const headers = getAuthHeaders();
      const [healthRes, apiRes, llmRes] = await Promise.allSettled([
        fetch(`${API_BASE}/admin/system/health`, { headers }),
        fetch(`${API_BASE}/admin/system/api-stats?hours=24`, { headers }),
        fetch(`${API_BASE}/admin/system/llm-stats?hours=24`, { headers }),
      ]);

      if (healthRes.status === 'fulfilled' && healthRes.value.ok)
        setHealth(await healthRes.value.json());
      if (apiRes.status === 'fulfilled' && apiRes.value.ok)
        setApiStats(await apiRes.value.json());
      if (llmRes.status === 'fulfilled' && llmRes.value.ok)
        setLlmStats(await llmRes.value.json());

      setLastRefresh(new Date());
    } catch (e) {
      console.error('Failed to load system stats:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">系统监控</h1>
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

      {/* 服务健康 */}
      {health && (
        <section className="space-y-3">
          <h2 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <Server className="w-4 h-4" />
            服务健康
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

      {/* API 性能 */}
      {apiStats && (
        <section className="space-y-3">
          <h2 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <BarChart3 className="w-4 h-4" />
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

      {/* LLM 使用 */}
      {llmStats && (
        <section className="space-y-3">
          <h2 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <Brain className="w-4 h-4" />
            LLM 使用
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

      {!health && !apiStats && !llmStats && (
        <div className="text-center py-20 text-muted-foreground">
          加载系统数据失败
        </div>
      )}
    </div>
  );
}

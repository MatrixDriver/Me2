'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  Users, MessageCircle, Database, MessagesSquare,
  Loader2, RefreshCw, Clock, Cpu, Activity,
  Server, BarChart3, Gauge, Timer, Zap, Brain, Search,
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

interface ChatStats {
  total_chats: number;
  today_chats: number;
  ttft_avg_ms: number;
  ttft_p95_ms: number;
  total_avg_ms: number;
  total_p95_ms: number;
  llm_ttft_avg_ms: number;
  llm_ttft_p95_ms: number;
  throughput_avg: number;
  recall_avg_ms: number;
}

interface ExtractionStats {
  total_extractions: number;
  today_extractions: number;
  avg_duration_s: number;
  p95_duration_s: number;
  total_facts: number;
  total_episodes: number;
  total_triples: number;
  total_messages_processed: number;
}

interface EmbeddingStats {
  total_calls: number;
  today_calls: number;
  total_texts: number;
  avg_duration_ms: number;
  failure_rate: number;
}

interface HealthData {
  uptime_seconds: number;
  neuromemory_version: string;
  db_pool: { size: number; checked_in: number; checked_out: number; overflow: number };
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<any>(null);
  const [chatStats, setChatStats] = useState<ChatStats | null>(null);
  const [extractionStats, setExtractionStats] = useState<ExtractionStats | null>(null);
  const [embeddingStats, setEmbeddingStats] = useState<EmbeddingStats | null>(null);
  const [health, setHealth] = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const fetchAll = useCallback(async (isManual = false) => {
    if (isManual) setRefreshing(true);
    try {
      const headers = getAuthHeaders();
      const [dashRes, healthRes, chatStatsRes, extractionRes, embeddingRes] = await Promise.allSettled([
        fetch(`${API_BASE}/admin/dashboard`, { headers }),
        fetch(`${API_BASE}/admin/system/health`, { headers }),
        fetch(`${API_BASE}/admin/system/chat-stats?hours=24`, { headers }),
        fetch(`${API_BASE}/admin/system/extraction-stats?hours=24`, { headers }),
        fetch(`${API_BASE}/admin/system/embedding-stats?hours=24`, { headers }),
      ]);

      if (dashRes.status === 'fulfilled' && dashRes.value.ok)
        setStats(await dashRes.value.json());
      if (healthRes.status === 'fulfilled' && healthRes.value.ok)
        setHealth(await healthRes.value.json());
      if (chatStatsRes.status === 'fulfilled' && chatStatsRes.value.ok) {
        const data = await chatStatsRes.value.json();
        setChatStats(data.total_chats > 0 ? data : null);
      }
      if (extractionRes.status === 'fulfilled' && extractionRes.value.ok) {
        const data = await extractionRes.value.json();
        setExtractionStats(data.total_extractions > 0 ? data : null);
      }
      if (embeddingRes.status === 'fulfilled' && embeddingRes.value.ok) {
        const data = await embeddingRes.value.json();
        setEmbeddingStats(data.total_calls > 0 ? data : null);
      }

      setLastRefresh(new Date());
    } catch (e) {
      console.error('Failed to load dashboard:', e);
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

      {/* 用户体验 */}
      {chatStats && (
        <section className="space-y-3">
          <h2 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <Gauge className="w-4 h-4" />
            用户体验
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatsCard
              title="首字时间 (TTFT)"
              value={`${chatStats.ttft_avg_ms.toFixed(0)} ms`}
              icon={Timer}
              trend={[{ label: 'P95', value: `${chatStats.ttft_p95_ms.toFixed(0)} ms` }]}
            />
            <StatsCard
              title="响应总时间"
              value={`${chatStats.total_avg_ms.toFixed(0)} ms`}
              icon={Clock}
              trend={[{ label: 'P95', value: `${chatStats.total_p95_ms.toFixed(0)} ms` }]}
            />
            <StatsCard
              title="LLM 首字时间"
              value={`${chatStats.llm_ttft_avg_ms.toFixed(0)} ms`}
              icon={Cpu}
              trend={[{ label: 'P95', value: `${chatStats.llm_ttft_p95_ms.toFixed(0)} ms` }]}
            />
            <StatsCard
              title="生成速度"
              value={`${chatStats.throughput_avg.toFixed(1)} tok/s`}
              icon={Zap}
              trend={[{ label: '今日对话', value: chatStats.today_chats }]}
            />
          </div>
        </section>
      )}

      {/* 记忆提取 */}
      {extractionStats && (
        <section className="space-y-3">
          <h2 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <Brain className="w-4 h-4" />
            记忆提取
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatsCard
              title="提取次数"
              value={extractionStats.total_extractions}
              icon={Activity}
              trend={[{ label: '今日', value: extractionStats.today_extractions }]}
            />
            <StatsCard
              title="提取耗时"
              value={`${extractionStats.avg_duration_s.toFixed(1)} s`}
              icon={Timer}
              trend={[{ label: 'P95', value: `${extractionStats.p95_duration_s.toFixed(1)} s` }]}
            />
            <StatsCard
              title="提取记忆数"
              value={extractionStats.total_facts + extractionStats.total_episodes}
              icon={Database}
              trend={[
                { label: '事实', value: extractionStats.total_facts },
                { label: '情景', value: extractionStats.total_episodes },
              ]}
            />
            <StatsCard
              title="图谱三元组"
              value={extractionStats.total_triples}
              icon={MessagesSquare}
              trend={[{ label: '处理消息', value: extractionStats.total_messages_processed }]}
            />
          </div>
        </section>
      )}

      {/* 记忆召回 */}
      {(chatStats || embeddingStats) && (
        <section className="space-y-3">
          <h2 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <Search className="w-4 h-4" />
            记忆召回
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {chatStats && (
              <StatsCard
                title="召回延迟"
                value={`${chatStats.recall_avg_ms.toFixed(0)} ms`}
                icon={Timer}
                trend={[{ label: '对话数', value: chatStats.total_chats }]}
              />
            )}
            {embeddingStats && (
              <>
                <StatsCard
                  title="Embedding 调用"
                  value={embeddingStats.total_calls}
                  icon={Cpu}
                  trend={[{ label: '今日', value: embeddingStats.today_calls }]}
                />
                <StatsCard
                  title="Embedding 耗时"
                  value={`${embeddingStats.avg_duration_ms.toFixed(0)} ms`}
                  icon={Clock}
                  trend={[{ label: '文本数', value: embeddingStats.total_texts }]}
                />
                <StatsCard
                  title="Embedding 失败率"
                  value={`${(embeddingStats.failure_rate * 100).toFixed(1)}%`}
                  icon={Activity}
                />
              </>
            )}
          </div>
        </section>
      )}

      {!stats && !health && (
        <div className="text-center py-20 text-muted-foreground">
          加载数据失败
        </div>
      )}
    </div>
  );
}

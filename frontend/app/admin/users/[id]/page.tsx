'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Loader2,
  ShieldCheck,
  MessagesSquare,
  MessageCircle,
  Database,
  Brain,
  Lightbulb,
  BookOpen,
  Mail,
  CalendarDays,
  Clock,
  RotateCw,
} from 'lucide-react';
import StatsCard from '@/components/admin/StatsCard';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || '/api/v1';

const MEMORY_TYPE_LABELS: Record<string, { label: string; icon: typeof Brain; color: string }> = {
  fact: { label: '事实', icon: Brain, color: 'bg-blue-500' },
  episodic: { label: '情景', icon: BookOpen, color: 'bg-purple-500' },
  insight: { label: '洞察', icon: Lightbulb, color: 'bg-amber-500' },
};

function getAuthHeaders(): Record<string, string> {
  const token = localStorage.getItem('me2_access_token');
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
}

function formatDate(iso: string | null): string {
  if (!iso) return '-';
  return new Date(iso).toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

function formatDateTime(iso: string | null): string {
  if (!iso) return '-';
  return new Date(iso).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

interface SessionItem {
  id: string;
  last_active_at: string | null;
  message_count: number;
  is_active: boolean;
}

interface UserDetail {
  id: string;
  username: string;
  email: string | null;
  is_admin: boolean;
  created_at: string | null;
  last_login: string | null;
  session_count: number;
  message_count: number;
  memory_count: number;
  memory_by_type: Record<string, number>;
  recent_sessions: SessionItem[];
}

export default function UserDetailPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [data, setData] = useState<UserDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reflectLoading, setReflectLoading] = useState(false);
  const [reflectResult, setReflectResult] = useState<string | null>(null);

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const res = await fetch(`${API_BASE}/admin/users/${params.id}`, {
          headers: getAuthHeaders(),
        });
        if (!res.ok) {
          setError(res.status === 404 ? '用户不存在' : '加载用户信息失败');
          return;
        }
        setData(await res.json());
      } catch (e) {
        console.error('Failed to load user detail:', e);
        setError('加载用户信息失败');
      } finally {
        setLoading(false);
      }
    };
    fetchUser();
  }, [params.id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="space-y-4">
        <button
          onClick={() => router.push('/admin/users')}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          返回用户列表
        </button>
        <div className="text-muted-foreground">{error || '加载用户信息失败'}</div>
      </div>
    );
  }

  const handleReflect = async () => {
    setReflectLoading(true);
    setReflectResult(null);
    try {
      const res = await fetch(`${API_BASE}/admin/users/${params.id}/reflect`, {
        method: 'POST',
        headers: getAuthHeaders(),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: '操作失败' }));
        throw new Error(err.detail || `HTTP ${res.status}`);
      }
      setReflectResult('Reflect 已触发');
      setTimeout(() => setReflectResult(null), 3000);
    } catch (e: any) {
      setReflectResult(`失败: ${e.message}`);
    } finally {
      setReflectLoading(false);
    }
  };

  const memoryByType = data.memory_by_type ?? {};
  const memoryTotal = data.memory_count || 1;

  return (
    <div className="space-y-6">
      <button
        onClick={() => router.push('/admin/users')}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        返回用户列表
      </button>

      {/* 用户信息 */}
      <div className="glass-card rounded-xl p-6">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-foreground truncate">
                {data.username}
              </h1>
              {data.is_admin && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-primary/15 text-primary shrink-0">
                  <ShieldCheck className="w-3 h-3" />
                  管理员
                </span>
              )}
            </div>
            {data.email && (
              <div className="flex items-center gap-1.5 mt-1 text-sm text-muted-foreground">
                <Mail className="w-3.5 h-3.5" />
                {data.email}
              </div>
            )}
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={handleReflect}
              disabled={reflectLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-primary/15 text-primary hover:bg-primary/25 transition-colors disabled:opacity-50"
            >
              {reflectLoading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <RotateCw className="w-3.5 h-3.5" />
              )}
              {reflectLoading ? '触发中...' : '触发 Reflect'}
            </button>
            {reflectResult && (
              <span className={`text-xs ${reflectResult.startsWith('失败') ? 'text-red-400' : 'text-green-400'}`}>
                {reflectResult}
              </span>
            )}
          </div>
          <div className="flex gap-6 text-sm text-muted-foreground shrink-0">
            <div className="flex items-center gap-1.5">
              <CalendarDays className="w-3.5 h-3.5" />
              <span>注册于 {formatDate(data.created_at)}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5" />
              <span>最后活跃 {formatDateTime(data.last_login)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatsCard
          title="会话"
          value={data.session_count ?? 0}
          icon={MessagesSquare}
        />
        <StatsCard
          title="消息"
          value={data.message_count ?? 0}
          icon={MessageCircle}
        />
        <StatsCard
          title="记忆"
          value={data.memory_count ?? 0}
          icon={Database}
          trend={Object.entries(memoryByType).map(([type, count]) => ({
            label: MEMORY_TYPE_LABELS[type]?.label ?? type,
            value: count,
          }))}
        />
      </div>

      {/* 记忆分布 */}
      {Object.keys(memoryByType).length > 0 && (
        <div className="glass-card rounded-xl p-6">
          <h2 className="text-lg font-semibold text-foreground mb-4">记忆分布</h2>
          <div className="space-y-3">
            {Object.entries(memoryByType).map(([type, count]) => {
              const meta = MEMORY_TYPE_LABELS[type] ?? { label: type, icon: Brain, color: 'bg-gray-500' };
              const Icon = meta.icon;
              const pct = memoryTotal > 0 ? Math.round((count / memoryTotal) * 100) : 0;
              return (
                <div key={type} className="flex items-center gap-3">
                  <Icon className="w-4 h-4 text-muted-foreground shrink-0" />
                  <span className="text-sm text-foreground w-16 shrink-0">{meta.label}</span>
                  <div className="flex-1 h-2 bg-white/5 rounded-full overflow-hidden">
                    <div
                      className={`h-full ${meta.color} rounded-full transition-all`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="text-sm text-muted-foreground tabular-nums w-20 text-right">
                    {count} ({pct}%)
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 最近会话（隐藏标题保护隐私） */}
      <div className="glass-card rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-white/5">
          <h2 className="text-lg font-semibold text-foreground">最近会话</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/5">
                <th className="text-left px-4 py-3 text-muted-foreground font-medium">最后活跃</th>
                <th className="text-right px-4 py-3 text-muted-foreground font-medium">消息数</th>
                <th className="text-center px-4 py-3 text-muted-foreground font-medium">状态</th>
              </tr>
            </thead>
            <tbody>
              {(data.recent_sessions ?? []).map((session) => (
                <tr
                  key={session.id}
                  className="border-b border-white/5 last:border-b-0 hover:bg-white/5 transition-colors"
                >
                  <td className="px-4 py-3 text-muted-foreground">
                    {formatDateTime(session.last_active_at)}
                  </td>
                  <td className="px-4 py-3 text-right text-foreground tabular-nums">
                    {session.message_count}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {session.is_active ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-500/15 text-green-400">
                        活跃
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-white/5 text-muted-foreground">
                        不活跃
                      </span>
                    )}
                  </td>
                </tr>
              ))}
              {(!data.recent_sessions || data.recent_sessions.length === 0) && (
                <tr>
                  <td colSpan={3} className="px-4 py-8 text-center text-muted-foreground">
                    暂无会话
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

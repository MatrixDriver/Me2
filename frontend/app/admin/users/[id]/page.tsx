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
} from 'lucide-react';
import StatsCard from '@/components/admin/StatsCard';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || '/api/v1';

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

interface UserDetail {
  user: {
    id: string;
    username: string;
    email: string | null;
    is_admin: boolean;
    created_at: string | null;
    last_login: string | null;
  };
  stats: {
    sessions: { total: number; active: number };
    messages: { total: number; today: number };
    memories: {
      total: number;
      by_type: { fact: number; episodic: number; insight: number };
    };
  };
  recent_sessions: {
    id: string;
    title: string;
    last_active_at: string | null;
    message_count: number;
    is_active: boolean;
  }[];
}

export default function UserDetailPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [data, setData] = useState<UserDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const res = await fetch(`${API_BASE}/admin/users/${params.id}`, {
          headers: getAuthHeaders(),
        });
        if (!res.ok) {
          setError(res.status === 404 ? 'User not found' : 'Failed to load user');
          return;
        }
        setData(await res.json());
      } catch (e) {
        console.error('Failed to load user detail:', e);
        setError('Failed to load user');
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
          Back to users
        </button>
        <div className="text-muted-foreground">{error || 'Failed to load user'}</div>
      </div>
    );
  }

  const { user, stats, recent_sessions } = data;
  const memoryTypes = stats.memories.by_type;
  const memoryTotal = stats.memories.total || 1; // avoid division by zero

  return (
    <div className="space-y-6">
      {/* Back link */}
      <button
        onClick={() => router.push('/admin/users')}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to users
      </button>

      {/* User info header */}
      <div className="glass-card rounded-xl p-6">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-foreground truncate">
                {user.username}
              </h1>
              {user.is_admin && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-primary/15 text-primary shrink-0">
                  <ShieldCheck className="w-3 h-3" />
                  Admin
                </span>
              )}
            </div>
            {user.email && (
              <div className="flex items-center gap-1.5 mt-1 text-sm text-muted-foreground">
                <Mail className="w-3.5 h-3.5" />
                {user.email}
              </div>
            )}
          </div>
          <div className="flex gap-6 text-sm text-muted-foreground shrink-0">
            <div className="flex items-center gap-1.5">
              <CalendarDays className="w-3.5 h-3.5" />
              <span>Registered {formatDate(user.created_at)}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5" />
              <span>Last active {formatDateTime(user.last_login)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatsCard
          title="Sessions"
          value={stats.sessions.total}
          icon={MessagesSquare}
          trend={[{ label: 'Active', value: stats.sessions.active }]}
        />
        <StatsCard
          title="Messages"
          value={stats.messages.total}
          icon={MessageCircle}
          trend={[{ label: 'Today', value: `+${stats.messages.today}` }]}
        />
        <StatsCard
          title="Memories"
          value={stats.memories.total}
          icon={Database}
          trend={[
            { label: 'fact', value: memoryTypes.fact },
            { label: 'episodic', value: memoryTypes.episodic },
            { label: 'insight', value: memoryTypes.insight },
          ]}
        />
      </div>

      {/* Memory breakdown by type */}
      <div className="glass-card rounded-xl p-6">
        <h2 className="text-lg font-semibold text-foreground mb-4">Memory Breakdown</h2>
        <div className="space-y-3">
          {[
            { key: 'fact', label: 'Fact', value: memoryTypes.fact, icon: Brain, color: 'bg-blue-500' },
            { key: 'episodic', label: 'Episodic', value: memoryTypes.episodic, icon: BookOpen, color: 'bg-purple-500' },
            { key: 'insight', label: 'Insight', value: memoryTypes.insight, icon: Lightbulb, color: 'bg-amber-500' },
          ].map((item) => {
            const pct = memoryTotal > 0 ? Math.round((item.value / memoryTotal) * 100) : 0;
            return (
              <div key={item.key} className="flex items-center gap-3">
                <item.icon className="w-4 h-4 text-muted-foreground shrink-0" />
                <span className="text-sm text-foreground w-20 shrink-0">{item.label}</span>
                <div className="flex-1 h-2 bg-white/5 rounded-full overflow-hidden">
                  <div
                    className={`h-full ${item.color} rounded-full transition-all`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="text-sm text-muted-foreground tabular-nums w-16 text-right">
                  {item.value} ({pct}%)
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Recent sessions table */}
      <div className="glass-card rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-white/5">
          <h2 className="text-lg font-semibold text-foreground">Recent Sessions</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/5">
                <th className="text-left px-4 py-3 text-muted-foreground font-medium">Title</th>
                <th className="text-left px-4 py-3 text-muted-foreground font-medium">Last Active</th>
                <th className="text-right px-4 py-3 text-muted-foreground font-medium">Messages</th>
                <th className="text-center px-4 py-3 text-muted-foreground font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {recent_sessions.map((session) => (
                <tr
                  key={session.id}
                  className="border-b border-white/5 last:border-b-0 hover:bg-white/5 transition-colors"
                >
                  <td className="px-4 py-3 text-foreground">
                    {session.title || 'Untitled'}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {formatDateTime(session.last_active_at)}
                  </td>
                  <td className="px-4 py-3 text-right text-foreground tabular-nums">
                    {session.message_count}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {session.is_active ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-500/15 text-green-400">
                        Active
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-white/5 text-muted-foreground">
                        Inactive
                      </span>
                    )}
                  </td>
                </tr>
              ))}
              {recent_sessions.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">
                    No sessions yet
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

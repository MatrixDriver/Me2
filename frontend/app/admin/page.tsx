'use client';

import { useEffect, useState } from 'react';
import { Users, MessageCircle, Database, Network, MessagesSquare, Loader2 } from 'lucide-react';
import StatsCard from '@/components/admin/StatsCard';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || '/api/v1';

function getAuthHeaders(): Record<string, string> {
  const token = localStorage.getItem('me2_access_token');
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      const res = await fetch(`${API_BASE}/admin/dashboard`, { headers: getAuthHeaders() });
      if (res.ok) setStats(await res.json());
    } catch (e) {
      console.error('Failed to load dashboard:', e);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!stats) return <div className="text-muted-foreground">加载失败</div>;

  const { users, sessions, messages, memories } = stats;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-foreground">仪表盘</h1>

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
            { label: '洞察', value: memories?.by_type?.insight || 0 },
          ]}
        />
      </div>

      {memories && (memories.graph_nodes > 0 || memories.graph_edges > 0) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <StatsCard title="图谱节点" value={memories.graph_nodes} icon={Network} />
          <StatsCard title="图谱边" value={memories.graph_edges} icon={Network} />
        </div>
      )}
    </div>
  );
}

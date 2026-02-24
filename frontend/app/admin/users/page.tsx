'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, ShieldCheck, ShieldOff } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || '/api/v1';
const PAGE_SIZE = 20;

interface UserItem {
  id: string;
  username: string;
  email: string | null;
  is_admin: boolean;
  created_at: string | null;
  last_login: string | null;
  session_count: number;
  message_count: number;
}

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

export default function UsersListPage() {
  const router = useRouter();
  const { userId } = useAuth();
  const [users, setUsers] = useState<UserItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const fetchUsers = useCallback(async (pageNum: number) => {
    setLoading(true);
    try {
      const offset = pageNum * PAGE_SIZE;
      const res = await fetch(
        `${API_BASE}/admin/users?limit=${PAGE_SIZE}&offset=${offset}`,
        { headers: getAuthHeaders() }
      );
      if (res.ok) {
        const data = await res.json();
        setUsers(data.items || data.users || []);
        setTotal(data.total || 0);
      }
    } catch (e) {
      console.error('Failed to load users:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers(page);
  }, [page, fetchUsers]);

  const handleToggleAdmin = async (user: UserItem) => {
    if (user.id === userId) return;
    setTogglingId(user.id);
    try {
      const res = await fetch(`${API_BASE}/admin/users/${user.id}`, {
        method: 'PUT',
        headers: {
          ...getAuthHeaders(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ is_admin: !user.is_admin }),
      });
      if (res.ok) {
        setUsers((prev) =>
          prev.map((u) =>
            u.id === user.id ? { ...u, is_admin: !u.is_admin } : u
          )
        );
      }
    } catch (e) {
      console.error('Failed to toggle admin:', e);
    } finally {
      setTogglingId(null);
    }
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);

  if (loading && users.length === 0) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">用户管理</h1>
        <span className="text-sm text-muted-foreground">共 {total} 人</span>
      </div>

      <div className="glass-card rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/5">
                <th className="text-left px-4 py-3 text-muted-foreground font-medium">用户名</th>
                <th className="text-left px-4 py-3 text-muted-foreground font-medium">邮箱</th>
                <th className="text-left px-4 py-3 text-muted-foreground font-medium">注册时间</th>
                <th className="text-left px-4 py-3 text-muted-foreground font-medium">最后活跃</th>
                <th className="text-right px-4 py-3 text-muted-foreground font-medium">会话</th>
                <th className="text-right px-4 py-3 text-muted-foreground font-medium">消息</th>
                <th className="text-center px-4 py-3 text-muted-foreground font-medium">角色</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => {
                const isSelf = user.id === userId;
                return (
                  <tr
                    key={user.id}
                    className="border-b border-white/5 last:border-b-0 hover:bg-white/5 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <button
                        onClick={() => router.push(`/admin/users/${user.id}`)}
                        className="text-primary hover:underline font-medium"
                      >
                        {user.username}
                      </button>
                      {isSelf && (
                        <span className="ml-2 text-xs text-muted-foreground/60">(我)</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{user.email || '-'}</td>
                    <td className="px-4 py-3 text-muted-foreground">{formatDate(user.created_at)}</td>
                    <td className="px-4 py-3 text-muted-foreground">{formatDateTime(user.last_login)}</td>
                    <td className="px-4 py-3 text-right text-foreground tabular-nums">{user.session_count}</td>
                    <td className="px-4 py-3 text-right text-foreground tabular-nums">{user.message_count}</td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => handleToggleAdmin(user)}
                        disabled={isSelf || togglingId === user.id}
                        className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition-colors ${
                          user.is_admin
                            ? 'bg-primary/15 text-primary'
                            : 'bg-white/5 text-muted-foreground'
                        } ${
                          isSelf
                            ? 'opacity-50 cursor-not-allowed'
                            : 'hover:bg-white/10 cursor-pointer'
                        }`}
                        title={
                          isSelf
                            ? '不能修改自己的管理员状态'
                            : user.is_admin
                              ? '移除管理员'
                              : '设为管理员'
                        }
                      >
                        {togglingId === user.id ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : user.is_admin ? (
                          <ShieldCheck className="w-3 h-3" />
                        ) : (
                          <ShieldOff className="w-3 h-3" />
                        )}
                        {user.is_admin ? '管理员' : '用户'}
                      </button>
                    </td>
                  </tr>
                );
              })}
              {users.length === 0 && !loading && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                    暂无用户
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={() => setPage(p => Math.max(0, p - 1))}
            disabled={page === 0}
            className="px-3 py-1.5 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-white/5 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            上一页
          </button>
          <span className="text-sm text-muted-foreground">
            {page + 1} / {totalPages}
          </span>
          <button
            onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1}
            className="px-3 py-1.5 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-white/5 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            下一页
          </button>
        </div>
      )}
    </div>
  );
}

'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  Loader2, RefreshCw, Trash2, AlertTriangle, Users, MessageCircle, Database,
} from 'lucide-react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || '/api/v1';

function getAuthHeaders(): Record<string, string> {
  const token = localStorage.getItem('me2_access_token');
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
}

interface UserItem {
  id: string;
  username: string;
  email: string;
  is_admin: boolean;
  session_count: number;
  message_count: number;
}

export default function DatabasePage() {
  const [users, setUsers] = useState<UserItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // 确认弹窗
  const [confirmAction, setConfirmAction] = useState<{
    type: 'clear' | 'delete' | 'reset';
    userId?: string;
    username?: string;
  } | null>(null);
  const [confirmText, setConfirmText] = useState('');
  const [actionError, setActionError] = useState('');
  const [actionResult, setActionResult] = useState<Record<string, number> | null>(null);

  const fetchUsers = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/admin/users?limit=100`, {
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        setUsers(data.items || []);
      }
    } catch (e) {
      console.error('Failed to fetch users:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const handleClearUserData = async (userId: string) => {
    setActionLoading(userId);
    setActionError('');
    try {
      const res = await fetch(`${API_BASE}/admin/users/${userId}/data`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: '请求失败' }));
        throw new Error(err.detail || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setActionResult(data.deleted);
      fetchUsers();
    } catch (e: any) {
      setActionError(e.message || '操作失败');
    } finally {
      setActionLoading(null);
    }
  };

  const handleDeleteUser = async (userId: string) => {
    setActionLoading(userId);
    setActionError('');
    try {
      const res = await fetch(`${API_BASE}/admin/users/${userId}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: '请求失败' }));
        throw new Error(err.detail || `HTTP ${res.status}`);
      }
      setConfirmAction(null);
      setConfirmText('');
      fetchUsers();
    } catch (e: any) {
      setActionError(e.message || '操作失败');
    } finally {
      setActionLoading(null);
    }
  };

  const handleResetAll = async () => {
    setActionLoading('reset');
    setActionError('');
    setActionResult(null);
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
      setActionResult(data.deleted);
      setConfirmText('');
      fetchUsers();
    } catch (e: any) {
      setActionError(e.message || '重置失败');
    } finally {
      setActionLoading(null);
    }
  };

  const openConfirm = (type: 'clear' | 'delete' | 'reset', userId?: string, username?: string) => {
    setConfirmAction({ type, userId, username });
    setConfirmText('');
    setActionError('');
    setActionResult(null);
  };

  const closeConfirm = () => {
    if (actionLoading) return;
    setConfirmAction(null);
    setConfirmText('');
    setActionError('');
    setActionResult(null);
  };

  const executeConfirm = () => {
    if (!confirmAction) return;
    if (confirmAction.type === 'clear' && confirmAction.userId) {
      handleClearUserData(confirmAction.userId);
    } else if (confirmAction.type === 'delete' && confirmAction.userId) {
      handleDeleteUser(confirmAction.userId);
    } else if (confirmAction.type === 'reset') {
      handleResetAll();
    }
  };

  const getConfirmWord = () => {
    if (!confirmAction) return '';
    if (confirmAction.type === 'reset') return 'RESET';
    if (confirmAction.type === 'delete') return 'DELETE';
    return 'CLEAR';
  };

  const getConfirmTitle = () => {
    if (!confirmAction) return '';
    if (confirmAction.type === 'reset') return '确认重置所有数据';
    if (confirmAction.type === 'delete') return `确认删除用户 ${confirmAction.username}`;
    return `确认清空 ${confirmAction.username} 的数据`;
  };

  const getConfirmDesc = () => {
    if (!confirmAction) return '';
    if (confirmAction.type === 'reset')
      return '此操作将永久删除所有用户、会话、消息、记忆、图谱等数据，并重建默认 admin 账号。';
    if (confirmAction.type === 'delete')
      return `此操作将永久删除用户 ${confirmAction.username} 及其所有数据（会话、消息、记忆等）。`;
    return `此操作将清空用户 ${confirmAction.username} 的所有会话、消息、记忆等数据，但保留用户账号。`;
  };

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
        <h1 className="text-2xl font-bold text-foreground">数据管理</h1>
        <button
          onClick={() => { setLoading(true); fetchUsers(); }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          刷新
        </button>
      </div>

      {/* 用户数据管理 */}
      <section className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
          <Users className="w-4 h-4" />
          用户数据管理
        </h2>
        <div className="glass-card rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/5">
                  <th className="text-left px-4 py-3 text-muted-foreground font-medium">用户名</th>
                  <th className="text-right px-4 py-3 text-muted-foreground font-medium">会话</th>
                  <th className="text-right px-4 py-3 text-muted-foreground font-medium">消息</th>
                  <th className="text-right px-4 py-3 text-muted-foreground font-medium">操作</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id} className="border-b border-white/5 last:border-b-0 hover:bg-white/5 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="text-foreground font-medium">{user.username}</span>
                        {user.is_admin && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/20 text-primary font-medium">
                            Admin
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right text-foreground tabular-nums">
                      {user.session_count}
                    </td>
                    <td className="px-4 py-3 text-right text-foreground tabular-nums">
                      {user.message_count}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => openConfirm('clear', user.id, user.username)}
                          disabled={!!actionLoading}
                          className="px-2.5 py-1 rounded-md text-xs font-medium text-amber-400 hover:bg-amber-500/10 transition-colors disabled:opacity-50"
                        >
                          清空数据
                        </button>
                        <button
                          onClick={() => openConfirm('delete', user.id, user.username)}
                          disabled={!!actionLoading}
                          className="px-2.5 py-1 rounded-md text-xs font-medium text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50"
                        >
                          删除
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {users.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">
                      暂无用户
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* 全局危险操作 */}
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
              onClick={() => openConfirm('reset')}
              disabled={!!actionLoading}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-red-600 text-white hover:bg-red-700 transition-colors flex items-center gap-2 shrink-0 disabled:opacity-50"
            >
              <Trash2 className="w-4 h-4" />
              重置所有数据
            </button>
          </div>
        </div>
      </section>

      {/* 确认弹窗 */}
      {confirmAction && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          onClick={closeConfirm}
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
              <h3 className="text-base font-semibold text-foreground">{getConfirmTitle()}</h3>
            </div>

            {actionResult ? (
              <div className="space-y-3">
                <p className="text-sm text-green-400 font-medium">操作完成！已删除数据：</p>
                <div className="bg-black/20 rounded-lg p-3 space-y-1">
                  {Object.entries(actionResult).map(([table, count]) => (
                    <div key={table} className="flex justify-between text-xs">
                      <span className="text-muted-foreground font-mono">{table}</span>
                      <span className="text-foreground tabular-nums">{count} 条</span>
                    </div>
                  ))}
                </div>
                {confirmAction.type === 'reset' && (
                  <p className="text-xs text-muted-foreground">默认 admin 账号已重建（密码为环境变量 ADMIN_DEFAULT_PASSWORD）</p>
                )}
                <button
                  onClick={closeConfirm}
                  className="w-full px-4 py-2 rounded-lg text-sm font-medium bg-white/10 text-foreground hover:bg-white/20 transition-colors"
                >
                  关闭
                </button>
              </div>
            ) : (
              <>
                <p className="text-sm text-muted-foreground mb-4">{getConfirmDesc()}</p>
                <p className="text-sm text-muted-foreground mb-3">
                  请输入 <span className="font-mono font-bold text-red-400">{getConfirmWord()}</span> 确认：
                </p>
                <input
                  type="text"
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  placeholder={`输入 ${getConfirmWord()} 确认`}
                  className="w-full px-3 py-2 rounded-lg bg-black/20 border border-white/10 text-foreground text-sm font-mono placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-red-500/50 mb-3"
                  disabled={!!actionLoading}
                />
                {actionError && (
                  <p className="text-sm text-red-400 mb-3">{actionError}</p>
                )}
                <div className="flex gap-3">
                  <button
                    onClick={closeConfirm}
                    disabled={!!actionLoading}
                    className="flex-1 px-4 py-2 rounded-lg text-sm font-medium bg-white/10 text-foreground hover:bg-white/20 transition-colors disabled:opacity-50"
                  >
                    取消
                  </button>
                  <button
                    onClick={executeConfirm}
                    disabled={!!actionLoading || confirmText !== getConfirmWord()}
                    className="flex-1 px-4 py-2 rounded-lg text-sm font-medium bg-red-600 text-white hover:bg-red-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {actionLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                    {actionLoading ? '执行中...' : '确认'}
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

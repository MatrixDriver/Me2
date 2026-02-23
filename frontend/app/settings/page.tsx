'use client';

import { useState, useRef, useEffect } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import ProtectedRoute from '@/components/ProtectedRoute';
import VersionBadge from '@/components/VersionBadge';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || '/api/v1';

function getAuthHeaders(): Record<string, string> {
  const token = localStorage.getItem('me2_access_token');
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
}

export default function SettingsPage() {
  const [showModal, setShowModal] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const successTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (successTimerRef.current) clearTimeout(successTimerRef.current);
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && showModal && !resetting) {
        setShowModal(false);
        setErrorMsg('');
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [showModal, resetting]);

  const handleReset = async () => {
    setResetting(true);
    setErrorMsg('');
    try {
      const response = await fetch(`${API_BASE}/memories/reset-all`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });
      if (response.ok) {
        setShowModal(false);
        setSuccessMsg('所有 AI 记忆数据已清除');
        if (successTimerRef.current) clearTimeout(successTimerRef.current);
        successTimerRef.current = setTimeout(() => setSuccessMsg(''), 4000);
      } else {
        const data = await response.json().catch(() => ({}));
        setErrorMsg(data.detail || '清除失败，请重试');
      }
    } catch {
      setErrorMsg('网络错误，请重试');
    } finally {
      setResetting(false);
    }
  };

  return (
    <ProtectedRoute>
      <div className="max-w-2xl mx-auto p-6">
        <h1 className="text-2xl font-bold mb-8 dark:text-white">设置</h1>

        {/* 成功提示 */}
        {successMsg && (
          <div className="mb-6 px-4 py-3 bg-green-50 border border-green-200 text-green-800 rounded-lg text-sm dark:bg-green-900/30 dark:border-green-800 dark:text-green-300">
            {successMsg}
          </div>
        )}

        {/* 危险区 */}
        <div className="border border-red-200 dark:border-red-800 rounded-xl p-6">
          <h2 className="text-base font-semibold text-red-600 dark:text-red-400 mb-4 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" />
            危险区
          </h2>

          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium dark:text-white">重置所有 AI 记忆数据</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                永久删除所有记忆、知识图谱、情绪记录、个人档案和偏好数据，不可恢复。
              </p>
            </div>
            <button
              onClick={() => setShowModal(true)}
              className="shrink-0 px-4 py-2 rounded-lg text-sm font-medium bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-900/30 dark:text-red-400 dark:hover:bg-red-900/50 transition-colors"
            >
              重置所有数据
            </button>
          </div>
        </div>

        {/* 确认 Modal */}
        {/* 版本信息 */}
        <div className="mt-8 pt-6 border-t border-gray-200 dark:border-gray-700">
          <VersionBadge />
        </div>

        {showModal && (
          <div
            className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
            onClick={() => { if (!resetting) { setShowModal(false); setErrorMsg(''); } }}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="reset-dialog-title"
              className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-sm w-full p-6"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/50 flex items-center justify-center shrink-0">
                  <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400" />
                </div>
                <h3 id="reset-dialog-title" className="text-base font-semibold dark:text-white">确认重置</h3>
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                此操作将永久删除你的所有 AI 记忆数据：
              </p>
              <ul className="text-sm text-gray-500 dark:text-gray-400 mb-6 space-y-1 list-disc list-inside">
                <li>所有记忆条目</li>
                <li>知识图谱节点和边</li>
                <li>情绪记录</li>
                <li>个人档案和偏好</li>
              </ul>
              {errorMsg && (
                <p className="text-sm text-red-600 dark:text-red-400 mb-4">{errorMsg}</p>
              )}
              <div className="flex gap-3">
                <button
                  onClick={() => { setShowModal(false); setErrorMsg(''); }}
                  disabled={resetting}
                  className="flex-1 px-4 py-2 rounded-lg text-sm font-medium bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors disabled:opacity-50"
                >
                  取消
                </button>
                <button
                  onClick={handleReset}
                  disabled={resetting}
                  className="flex-1 px-4 py-2 rounded-lg text-sm font-medium bg-red-600 text-white hover:bg-red-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {resetting && <Loader2 className="w-4 h-4 animate-spin" />}
                  {resetting ? '重置中...' : '确认删除'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </ProtectedRoute>
  );
}

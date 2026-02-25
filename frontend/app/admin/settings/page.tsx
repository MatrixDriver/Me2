'use client';

import { useEffect, useState, useCallback } from 'react';
import { Loader2, RefreshCw, Save, Info } from 'lucide-react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || '/api/v1';

function getAuthHeaders(): Record<string, string> {
  const token = localStorage.getItem('me2_access_token');
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
}

interface NMConfig {
  reflection_interval: number;
  auto_extract: boolean;
  graph_enabled: boolean;
  extraction: {
    message_interval: number;
    idle_timeout: number;
  };
}

export default function SettingsPage() {
  const [config, setConfig] = useState<NMConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // editable form state
  const [reflectionInterval, setReflectionInterval] = useState(0);
  const [autoExtract, setAutoExtract] = useState(true);
  const [graphEnabled, setGraphEnabled] = useState(true);

  const fetchConfig = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/admin/system/nm-config`, {
        headers: getAuthHeaders(),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: NMConfig = await res.json();
      setConfig(data);
      setReflectionInterval(data.reflection_interval);
      setAutoExtract(data.auto_extract);
      setGraphEnabled(data.graph_enabled);
    } catch (e: any) {
      setError(e.message || '加载配置失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(`${API_BASE}/admin/system/nm-config`, {
        method: 'PUT',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reflection_interval: reflectionInterval,
          auto_extract: autoExtract,
          graph_enabled: graphEnabled,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: '保存失败' }));
        throw new Error(err.detail || `HTTP ${res.status}`);
      }
      setSuccess('配置已更新');
      setTimeout(() => setSuccess(null), 3000);
      fetchConfig();
    } catch (e: any) {
      setError(e.message || '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const hasChanges =
    config &&
    (reflectionInterval !== config.reflection_interval ||
      autoExtract !== config.auto_extract ||
      graphEnabled !== config.graph_enabled);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error && !config) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold text-foreground">设置</h1>
        <div className="text-red-400 text-sm">{error}</div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">设置</h1>
        <button
          onClick={() => { setLoading(true); fetchConfig(); }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          刷新
        </button>
      </div>

      {/* 提示 */}
      <div className="flex items-start gap-2 px-4 py-3 rounded-lg bg-blue-500/10 border border-blue-500/20 text-sm text-blue-300">
        <Info className="w-4 h-4 mt-0.5 shrink-0" />
        <span>修改仅影响当前运行时，重启服务后将恢复 .env 默认值。</span>
      </div>

      {/* 可编辑配置 */}
      <div className="glass-card rounded-xl p-6 space-y-6">
        <h2 className="text-lg font-semibold text-foreground">NeuroMemory 运行时配置</h2>

        {/* reflection_interval */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground">
            Reflection Interval
          </label>
          <p className="text-xs text-muted-foreground">
            每提取多少次后触发一次 Reflect（0 = 禁用自动 Reflect）
          </p>
          <input
            type="number"
            min={0}
            value={reflectionInterval}
            onChange={(e) => setReflectionInterval(Number(e.target.value))}
            className="w-full max-w-[200px] px-3 py-2 rounded-lg bg-black/20 border border-white/10 text-foreground text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
        </div>

        {/* auto_extract */}
        <div className="flex items-center justify-between">
          <div>
            <label className="text-sm font-medium text-foreground">
              Auto Extract
            </label>
            <p className="text-xs text-muted-foreground">
              是否自动提取记忆
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={autoExtract}
            onClick={() => setAutoExtract(!autoExtract)}
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
              autoExtract ? 'bg-primary' : 'bg-white/20'
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition-transform ${
                autoExtract ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        {/* graph_enabled */}
        <div className="flex items-center justify-between">
          <div>
            <label className="text-sm font-medium text-foreground">
              Graph Enabled
            </label>
            <p className="text-xs text-muted-foreground">
              是否启用知识图谱
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={graphEnabled}
            onClick={() => setGraphEnabled(!graphEnabled)}
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
              graphEnabled ? 'bg-primary' : 'bg-white/20'
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition-transform ${
                graphEnabled ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        {/* Save */}
        <div className="flex items-center gap-3 pt-2">
          <button
            onClick={handleSave}
            disabled={saving || !hasChanges}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {saving ? '保存中...' : '保存'}
          </button>
          {success && <span className="text-sm text-green-400">{success}</span>}
          {error && <span className="text-sm text-red-400">{error}</span>}
        </div>
      </div>

      {/* 只读信息 */}
      {config && (
        <div className="glass-card rounded-xl p-6 space-y-4">
          <h2 className="text-lg font-semibold text-foreground">Extraction 参数（只读）</h2>
          <p className="text-xs text-muted-foreground">
            以下参数在初始化时设定，运行时不可修改。如需更改，请修改 .env 后重启服务。
          </p>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <span className="text-xs text-muted-foreground">Message Interval</span>
              <p className="text-sm font-mono text-foreground">{config.extraction.message_interval}</p>
            </div>
            <div className="space-y-1">
              <span className="text-xs text-muted-foreground">Idle Timeout</span>
              <p className="text-sm font-mono text-foreground">{config.extraction.idle_timeout}s</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

'use client';

import { useState } from 'react';
import {
  Brain,
  UserCircle,
  Network,
  Sparkles,
  Search as SearchIcon,
  MessageCircle,
  Loader2,
} from 'lucide-react';
import ProtectedRoute from '@/components/ProtectedRoute';
import MemoryStore from '@/components/memories/MemoryStore';
import ProfileSection from '@/components/memories/ProfileSection';
import KnowledgeGraph from '@/components/memories/KnowledgeGraph';
type TabKey = 'cognitive' | 'reflect' | 'profile' | 'graph';

const TABS: { key: TabKey; label: string; icon: typeof Brain }[] = [
  { key: 'cognitive', label: '认知记忆', icon: Brain },
  { key: 'reflect', label: '反思记忆', icon: Sparkles },
  { key: 'profile', label: '用户档案', icon: UserCircle },
  { key: 'graph', label: '知识图谱', icon: Network },
];

const API_BASE = process.env.NEXT_PUBLIC_API_URL || '/api/v1';

function getAuthHeaders(): Record<string, string> {
  const token = localStorage.getItem('me2_access_token');
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
}

export default function MemoriesPage() {
  const [activeTab, setActiveTab] = useState<TabKey>('cognitive');
  const [activatedTabs, setActivatedTabs] = useState<Set<TabKey>>(
    new Set<TabKey>(['cognitive'])
  );

  // Search & correction
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [correctionInput, setCorrectionInput] = useState('');
  const [correcting, setCorrecting] = useState(false);

  const handleTabChange = (key: TabKey) => {
    setActiveTab(key);
    setActivatedTabs((prev) => new Set([...prev, key]));
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    try {
      const response = await fetch(`${API_BASE}/memories/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ query: searchQuery, limit: 20, threshold: 0.0 }),
      });
      if (response.ok) {
        const data = await response.json();
        setSearchResults(data.memories || []);
      }
    } catch (error) {
      console.error('搜索失败:', error);
    } finally {
      setSearching(false);
    }
  };

  const handleCorrection = async () => {
    if (!correctionInput.trim()) return;
    setCorrecting(true);
    try {
      const response = await fetch(`${API_BASE}/memories/correct`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ correction: correctionInput }),
      });
      if (response.ok) {
        const data = await response.json();
        alert(data.message || '纠正成功');
        setCorrectionInput('');
      }
    } catch (error) {
      console.error('纠正失败:', error);
      alert('纠正失败，请稍后重试');
    } finally {
      setCorrecting(false);
    }
  };

  return (
    <ProtectedRoute>
      <div className="p-6 pb-20 md:pb-6 h-full overflow-y-auto">
        <h1 className="text-3xl font-bold mb-2 text-foreground">记忆管理</h1>
        <p className="text-muted-foreground mb-6">
          查看、管理和探索你的记忆
        </p>

        {/* Tab 栏 */}
        <div className="flex gap-1 mb-4 border-b border-white/10 overflow-x-auto">
          {TABS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => handleTabChange(key)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap shrink-0 ${
                activeTab === key
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground hover:border-white/20'
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </div>

        {/* Tab 内容 */}
        <div className="glass-card rounded-xl w-full min-h-[400px]">
          {activeTab === 'cognitive' && activatedTabs.has('cognitive') && (
            <MemoryStore allowedTypes={['fact', 'episodic']} />
          )}
          {activeTab === 'reflect' && activatedTabs.has('reflect') && (
            <MemoryStore allowedTypes={['insight']} />
          )}
          {activeTab === 'profile' && activatedTabs.has('profile') && (
            <ProfileSection />
          )}
          {activeTab === 'graph' && activatedTabs.has('graph') && (
            <KnowledgeGraph />
          )}
        </div>

        {/* 语义搜索 & 对话式纠正 */}
        <div className="glass-card rounded-xl w-full mt-6 p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* 语义搜索 */}
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-2">
                语义搜索
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                  placeholder="搜索记忆..."
                  className="flex-1 px-3 py-1.5 text-sm border border-white/10 rounded-lg bg-white/5 text-foreground placeholder:text-muted-foreground/50 focus:ring-1 focus:ring-primary/40 focus:border-transparent"
                />
                <button
                  onClick={handleSearch}
                  disabled={searching || !searchQuery.trim()}
                  className="px-3 py-1.5 text-sm bg-primary text-white rounded-lg hover:bg-primary/80 disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {searching ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <SearchIcon className="w-4 h-4" />
                  )}
                  搜索
                </button>
              </div>
            </div>

            {/* 对话式纠正 */}
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-2">
                对话式纠正
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={correctionInput}
                  onChange={(e) => setCorrectionInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleCorrection()}
                  placeholder='例如："我女儿不叫灿灿，叫小灿"'
                  className="flex-1 px-3 py-1.5 text-sm border border-white/10 rounded-lg bg-white/5 text-foreground placeholder:text-muted-foreground/50 focus:ring-1 focus:ring-primary/40 focus:border-transparent"
                />
                <button
                  onClick={handleCorrection}
                  disabled={correcting || !correctionInput.trim()}
                  className="px-3 py-1.5 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-500 disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {correcting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <MessageCircle className="w-4 h-4" />
                  )}
                  纠正
                </button>
              </div>
            </div>
          </div>

          {/* 搜索结果 */}
          {searchResults.length > 0 && (
            <div className="mt-4 pt-4 border-t border-white/5">
              <div className="text-sm font-medium text-muted-foreground mb-3">
                搜索结果 ({searchResults.length} 条)
              </div>
              <div className="space-y-2">
                {searchResults.map((m: any) => (
                  <a
                    key={m.id}
                    href={`/memories/${m.id}`}
                    className="block p-3 bg-white/5 rounded-lg hover:bg-white/10"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="px-2 py-0.5 rounded text-xs font-medium bg-primary/15 text-primary">
                        {m.memory_type}
                      </span>
                      {m.score && (
                        <span className="text-xs text-gray-500">
                          {(m.score * 100).toFixed(0)}%
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-foreground/80 line-clamp-2">
                      {m.content}
                    </p>
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </ProtectedRoute>
  );
}

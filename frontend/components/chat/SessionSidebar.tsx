'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Plus,
  Search,
  Pin,
  PinOff,
  Pencil,
  Trash2,
  Download,
  MoreHorizontal,
  MessageCircle,
  X,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { apiClient, SessionInfo } from '@/lib/api-client';

interface SessionSidebarProps {
  currentSessionId?: string;
  onSelectSession: (sessionId: string) => void;
  onNewChat: () => void;
  refreshTrigger?: number;
}

function getTimeGroup(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);
  const weekAgo = new Date(today.getTime() - 7 * 86400000);

  if (date >= today) return '今天';
  if (date >= yesterday) return '昨天';
  if (date >= weekAgo) return '本周';
  return '更早';
}

export default function SessionSidebar({
  currentSessionId,
  onSelectSession,
  onNewChat,
  refreshTrigger,
}: SessionSidebarProps) {
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [menuSessionId, setMenuSessionId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const menuRef = useRef<HTMLDivElement>(null!);

  const searchTimerRef = useRef<NodeJS.Timeout>();

  const loadSessions = useCallback(async () => {
    try {
      const data = await apiClient.listSessions();
      setSessions(data);
    } catch (err) {
      console.error('加载会话列表失败:', err);
    }
  }, []);

  useEffect(() => {
    loadSessions();
  }, [loadSessions, refreshTrigger]);

  // 搜索
  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);

    if (!searchQuery.trim()) {
      loadSessions();
      return;
    }

    searchTimerRef.current = setTimeout(async () => {
      setIsSearching(true);
      try {
        const data = await apiClient.searchSessions(searchQuery);
        setSessions(data);
      } catch (err) {
        console.error('搜索失败:', err);
      } finally {
        setIsSearching(false);
      }
    }, 300);

    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, [searchQuery, loadSessions]);

  // 点击外部关闭菜单
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuSessionId(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handlePin = async (session: SessionInfo) => {
    try {
      await apiClient.updateSession(session.id, { pinned: !session.pinned });
      await loadSessions();
    } catch (err) {
      console.error('置顶失败:', err);
    }
    setMenuSessionId(null);
  };

  const handleRename = async (sessionId: string) => {
    if (!renameValue.trim()) {
      setRenamingId(null);
      return;
    }
    try {
      await apiClient.updateSession(sessionId, { title: renameValue.trim() });
      await loadSessions();
    } catch (err) {
      console.error('重命名失败:', err);
    }
    setRenamingId(null);
  };

  const handleDelete = async (sessionId: string) => {
    try {
      await apiClient.deleteSession(sessionId);
      await loadSessions();
      if (currentSessionId === sessionId) {
        onNewChat();
      }
    } catch (err) {
      console.error('删除失败:', err);
    }
    setMenuSessionId(null);
  };

  const handleExport = async (sessionId: string) => {
    try {
      const data = await apiClient.exportSession(sessionId);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `session-${sessionId.slice(0, 8)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('导出失败:', err);
    }
    setMenuSessionId(null);
  };

  const getSessionTitle = (session: SessionInfo) => {
    return session.title || '新对话';
  };

  // 分组
  const pinnedSessions = sessions.filter((s) => s.pinned);
  const unpinnedSessions = sessions.filter((s) => !s.pinned);

  const grouped: Record<string, SessionInfo[]> = {};
  for (const s of unpinnedSessions) {
    const group = getTimeGroup(s.last_active_at);
    if (!grouped[group]) grouped[group] = [];
    grouped[group].push(s);
  }

  const groupOrder = ['今天', '昨天', '本周', '更早'];

  if (collapsed) {
    return (
      <div className="hidden md:flex w-12 flex-col items-center py-4 border-r border-border/30 bg-[hsl(var(--sidebar))]/50">
        <button
          onClick={() => setCollapsed(false)}
          className="p-2 rounded-lg hover:bg-secondary/50 text-muted-foreground hover:text-foreground transition-colors"
          title="展开会话列表"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
        <button
          onClick={onNewChat}
          className="mt-2 p-2 rounded-lg hover:bg-secondary/50 text-muted-foreground hover:text-foreground transition-colors"
          title="新对话"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="w-[280px] flex flex-col border-r border-border/30 bg-[hsl(var(--sidebar))] md:bg-[hsl(var(--sidebar))]/50 h-full">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-3 border-b border-border/30">
        <button
          onClick={onNewChat}
          className="flex-1 flex items-center gap-2 px-3 py-2 rounded-xl bg-gradient-to-r from-primary/20 to-primary/10 text-primary hover:from-primary/30 hover:to-primary/20 transition-all text-sm font-medium"
        >
          <Plus className="w-4 h-4" />
          新对话
        </button>
        <button
          onClick={() => setCollapsed(true)}
          className="hidden md:block p-2 rounded-lg hover:bg-secondary/50 text-muted-foreground hover:text-foreground transition-colors"
          title="折叠"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
      </div>

      {/* Search */}
      <div className="px-3 py-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/50" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜索会话..."
            className="w-full pl-9 pr-8 py-1.5 rounded-lg bg-secondary/30 border border-border/30 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/40"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground/50 hover:text-foreground"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Session List */}
      <div className="flex-1 overflow-y-auto px-2 pb-2">
        {isSearching && (
          <div className="text-center text-muted-foreground/50 text-xs py-4">搜索中...</div>
        )}

        {/* Pinned */}
        {pinnedSessions.length > 0 && (
          <div className="mb-2">
            <div className="flex items-center gap-1.5 px-2 py-1.5 text-xs text-muted-foreground/60 font-medium">
              <Pin className="w-3 h-3" />
              置顶
            </div>
            {pinnedSessions.map((session) => (
              <SessionItem
                key={session.id}
                session={session}
                isActive={session.id === currentSessionId}
                menuOpen={menuSessionId === session.id}
                isRenaming={renamingId === session.id}
                renameValue={renameValue}
                onSelect={() => onSelectSession(session.id)}
                onMenuToggle={() => setMenuSessionId(menuSessionId === session.id ? null : session.id)}
                onPin={() => handlePin(session)}
                onStartRename={() => {
                  setRenamingId(session.id);
                  setRenameValue(getSessionTitle(session));
                  setMenuSessionId(null);
                }}
                onRename={() => handleRename(session.id)}
                onRenameChange={setRenameValue}
                onDelete={() => handleDelete(session.id)}
                onExport={() => handleExport(session.id)}
                menuRef={menuRef}
                getTitle={getSessionTitle}
              />
            ))}
          </div>
        )}

        {/* Time Groups */}
        {groupOrder.map((group) => {
          const items = grouped[group];
          if (!items || items.length === 0) return null;
          return (
            <div key={group} className="mb-2">
              <div className="px-2 py-1.5 text-xs text-muted-foreground/60 font-medium">
                {group}
              </div>
              {items.map((session) => (
                <SessionItem
                  key={session.id}
                  session={session}
                  isActive={session.id === currentSessionId}
                  menuOpen={menuSessionId === session.id}
                  isRenaming={renamingId === session.id}
                  renameValue={renameValue}
                  onSelect={() => onSelectSession(session.id)}
                  onMenuToggle={() => setMenuSessionId(menuSessionId === session.id ? null : session.id)}
                  onPin={() => handlePin(session)}
                  onStartRename={() => {
                    setRenamingId(session.id);
                    setRenameValue(getSessionTitle(session));
                    setMenuSessionId(null);
                  }}
                  onRename={() => handleRename(session.id)}
                  onRenameChange={setRenameValue}
                  onDelete={() => handleDelete(session.id)}
                  onExport={() => handleExport(session.id)}
                  menuRef={menuRef}
                  getTitle={getSessionTitle}
                />
              ))}
            </div>
          );
        })}

        {sessions.length === 0 && !isSearching && (
          <div className="text-center text-muted-foreground/50 text-xs py-8">
            <MessageCircle className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p>暂无会话</p>
          </div>
        )}
      </div>
    </div>
  );
}

interface SessionItemProps {
  session: SessionInfo;
  isActive: boolean;
  menuOpen: boolean;
  isRenaming: boolean;
  renameValue: string;
  onSelect: () => void;
  onMenuToggle: () => void;
  onPin: () => void;
  onStartRename: () => void;
  onRename: () => void;
  onRenameChange: (val: string) => void;
  onDelete: () => void;
  onExport: () => void;
  menuRef: React.RefObject<HTMLDivElement>;
  getTitle: (session: SessionInfo) => string;
}

function SessionItem({
  session,
  isActive,
  menuOpen,
  isRenaming,
  renameValue,
  onSelect,
  onMenuToggle,
  onPin,
  onStartRename,
  onRename,
  onRenameChange,
  onDelete,
  onExport,
  menuRef,
  getTitle,
}: SessionItemProps) {
  return (
    <div className="relative group">
      <button
        onClick={onSelect}
        className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left text-sm transition-all ${
          isActive
            ? 'bg-primary/15 text-primary'
            : 'text-foreground/80 hover:bg-secondary/40'
        }`}
      >
        <MessageCircle className="w-3.5 h-3.5 flex-shrink-0 opacity-50" />
        <div className="flex-1 min-w-0">
          {isRenaming ? (
            <input
              autoFocus
              value={renameValue}
              onChange={(e) => onRenameChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onRename();
                if (e.key === 'Escape') onRenameChange('');
              }}
              onBlur={onRename}
              onClick={(e) => e.stopPropagation()}
              className="w-full bg-secondary/50 border border-border/50 rounded px-1.5 py-0.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary/40"
            />
          ) : (
            <span className="truncate block">{getTitle(session)}</span>
          )}
        </div>

        {/* More button */}
        {!isRenaming && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onMenuToggle();
            }}
            className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-secondary/50 transition-all"
          >
            <MoreHorizontal className="w-3.5 h-3.5" />
          </button>
        )}
      </button>

      {/* Context Menu */}
      {menuOpen && (
        <div
          ref={menuRef}
          className="absolute right-0 top-full mt-1 z-50 w-40 bg-card border border-border rounded-lg shadow-xl py-1"
        >
          <button
            onClick={onStartRename}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-foreground/80 hover:bg-secondary/40 transition-colors"
          >
            <Pencil className="w-3.5 h-3.5" />
            重命名
          </button>
          <button
            onClick={onPin}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-foreground/80 hover:bg-secondary/40 transition-colors"
          >
            {session.pinned ? <PinOff className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5" />}
            {session.pinned ? '取消置顶' : '置顶'}
          </button>
          <button
            onClick={onExport}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-foreground/80 hover:bg-secondary/40 transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            导出
          </button>
          <div className="border-t border-border/30 my-1" />
          <button
            onClick={onDelete}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-red-400 hover:bg-red-500/10 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
            删除
          </button>
        </div>
      )}
    </div>
  );
}

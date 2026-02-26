'use client';

import { MessageCircle, Database, Settings, Shield, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import SidebarItem from './SidebarItem';
import UserMenu from './UserMenu';
import VersionBadge from '@/components/VersionBadge';
import { useAuth } from '@/contexts/AuthContext';

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

export default function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const { isAdmin } = useAuth();

  return (
    <aside
      className={`hidden md:flex md:flex-col glass border-r border-white/5 h-screen sticky top-0 transition-all duration-200 ${
        collapsed ? 'md:w-16' : 'md:w-60'
      }`}
    >
      {/* Logo & Toggle */}
      <div className="px-4 py-5 border-b border-border flex items-center justify-between">
        {!collapsed && (
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-foreground">Me2</h1>
            <p className="text-xs text-muted-foreground mt-0.5">AI 陪伴</p>
          </div>
        )}
        <button
          onClick={onToggle}
          className="p-1.5 rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors flex-shrink-0"
          aria-label={collapsed ? '展开侧边栏' : '收起侧边栏'}
        >
          {collapsed ? <PanelLeftOpen className="w-5 h-5" /> : <PanelLeftClose className="w-5 h-5" />}
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        <SidebarItem href="/" icon={MessageCircle} label="聊天" collapsed={collapsed} />
        <SidebarItem href="/memories" icon={Database} label="记忆" collapsed={collapsed} />
        <SidebarItem href="/settings" icon={Settings} label="设置" collapsed={collapsed} />
        {isAdmin && <SidebarItem href="/admin" icon={Shield} label="管理" collapsed={collapsed} />}
      </nav>

      {/* User */}
      <div className="px-3 py-3 border-t border-border space-y-2">
        <UserMenu collapsed={collapsed} />
        {!collapsed && (
          <div className="px-1">
            <VersionBadge />
          </div>
        )}
      </div>
    </aside>
  );
}

'use client';

import { useAuth } from '@/contexts/AuthContext';
import { LogOut, User } from 'lucide-react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';

interface UserMenuProps {
  collapsed?: boolean;
}

export default function UserMenu({ collapsed }: UserMenuProps) {
  const { userId, username, logout } = useAuth();

  if (!userId) return null;

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors ${
            collapsed ? 'justify-center' : ''
          }`}
          title={collapsed ? (username || userId) : undefined}
        >
          <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
            <User className="w-4 h-4 text-primary" />
          </div>
          {!collapsed && (
            <span className="truncate text-left flex-1">{username || userId.slice(0, 12) + '...'}</span>
          )}
        </button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className="min-w-[200px] bg-card border border-border rounded-lg p-1 shadow-lg z-50"
          side="top"
          align="start"
          sideOffset={8}
        >
          <DropdownMenu.Item
            onClick={logout}
            className="flex items-center gap-2 px-3 py-2 text-sm text-destructive rounded-md cursor-pointer hover:bg-secondary outline-none"
          >
            <LogOut className="w-4 h-4" />
            <span>登出</span>
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

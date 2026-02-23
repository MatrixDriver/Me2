'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import {
  MessageCircle,
  Database,
  MoreHorizontal,
  LogOut,
  X,
  Settings,
} from 'lucide-react';

export default function MobileNav() {
  const pathname = usePathname();
  const { logout } = useAuth();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const isActive = (href: string) => pathname === href;

  const tabClass = (href: string) =>
    `flex flex-col items-center gap-1 py-2 px-3 text-xs font-medium transition-colors ${
      isActive(href) ? 'text-primary' : 'text-muted-foreground'
    }`;

  const drawerItems = [
    { href: '/settings', icon: Settings, label: '设置' },
  ];

  return (
    <>
      {/* Bottom tab bar */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-[hsl(var(--sidebar))] border-t border-border z-40 flex items-center justify-around safe-area-pb">
        <Link href="/" className={tabClass('/')}>
          <MessageCircle className="w-5 h-5" />
          <span>聊天</span>
        </Link>
        <Link href="/memories" className={tabClass('/memories')}>
          <Database className="w-5 h-5" />
          <span>记忆</span>
        </Link>
        <button
          onClick={() => setDrawerOpen(true)}
          className={`flex flex-col items-center gap-1 py-2 px-3 text-xs font-medium transition-colors ${
            drawerOpen ? 'text-primary' : 'text-muted-foreground'
          }`}
        >
          <MoreHorizontal className="w-5 h-5" />
          <span>更多</span>
        </button>
      </nav>

      {/* Drawer overlay */}
      {drawerOpen && (
        <div
          className="md:hidden fixed inset-0 bg-black/50 z-50"
          onClick={() => setDrawerOpen(false)}
        />
      )}

      {/* Bottom drawer */}
      <div
        className={`md:hidden fixed bottom-0 left-0 right-0 z-50 bg-card border-t border-border rounded-t-2xl transition-transform duration-300 ${
          drawerOpen ? 'translate-y-0' : 'translate-y-full'
        }`}
      >
        {/* Handle */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <span className="text-sm font-semibold text-foreground">更多功能</span>
          <button
            onClick={() => setDrawerOpen(false)}
            className="p-1 rounded-lg hover:bg-secondary transition-colors"
          >
            <X className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>

        {/* Drawer items */}
        <div className="p-3 space-y-1">
          {drawerItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setDrawerOpen(false)}
              className={`flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium transition-colors ${
                isActive(item.href)
                  ? 'bg-primary/10 text-primary'
                  : 'text-foreground hover:bg-secondary'
              }`}
            >
              <item.icon className="w-5 h-5" />
              <span>{item.label}</span>
            </Link>
          ))}

          {/* Logout */}
          <button
            onClick={() => {
              setDrawerOpen(false);
              logout();
            }}
            className="flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium text-destructive hover:bg-secondary transition-colors w-full"
          >
            <LogOut className="w-5 h-5" />
            <span>登出</span>
          </button>
        </div>

        {/* Safe area padding */}
        <div className="h-6" />
      </div>
    </>
  );
}

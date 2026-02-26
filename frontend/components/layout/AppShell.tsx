'use client';

import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import Sidebar from './Sidebar';
import MobileNav from './MobileNav';
import InstallPrompt from '@/components/InstallPrompt';

const AUTH_PAGES = ['/login', '/register'];
const STORAGE_KEY = 'me2-sidebar-collapsed';

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { isAuthenticated, loading } = useAuth();
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'true') setCollapsed(true);
  }, []);

  const handleToggle = () => {
    setCollapsed((prev) => {
      localStorage.setItem(STORAGE_KEY, String(!prev));
      return !prev;
    });
  };

  // Auth pages: no sidebar
  if (AUTH_PAGES.includes(pathname)) {
    return <>{children}</>;
  }

  // Admin pages: independent layout, no sidebar
  if (pathname.startsWith('/admin')) {
    return <>{children}</>;
  }

  // Loading state: show with sidebar layout to prevent flash
  // ProtectedRoute will handle the actual redirect if not authenticated
  if (loading) {
    return (
      <div className="flex h-[100dvh] overflow-hidden">
        <Sidebar collapsed={collapsed} onToggle={handleToggle} />
        <main className="flex-1 overflow-hidden flex flex-col pb-14 md:pb-0">
          {children}
        </main>
        <MobileNav />
      </div>
    );
  }

  // Not authenticated: render without sidebar (will redirect via ProtectedRoute)
  if (!isAuthenticated) {
    return <>{children}</>;
  }

  // Authenticated: show full layout
  return (
    <div className="flex h-[100dvh] overflow-hidden">
      <Sidebar collapsed={collapsed} onToggle={handleToggle} />
      <main className="flex-1 overflow-hidden flex flex-col pb-14 md:pb-0">
        {children}
      </main>
      <MobileNav />
      <InstallPrompt />
    </div>
  );
}

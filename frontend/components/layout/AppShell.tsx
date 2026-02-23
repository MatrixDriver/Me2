'use client';

import { usePathname } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import Sidebar from './Sidebar';
import MobileNav from './MobileNav';
import InstallPrompt from '@/components/InstallPrompt';

const AUTH_PAGES = ['/login', '/register'];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { isAuthenticated, loading } = useAuth();

  // Auth pages: no sidebar
  if (AUTH_PAGES.includes(pathname)) {
    return <>{children}</>;
  }

  // Loading state: show with sidebar layout to prevent flash
  // ProtectedRoute will handle the actual redirect if not authenticated
  if (loading) {
    return (
      <div className="flex h-[100dvh] overflow-hidden">
        <Sidebar />
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
      <Sidebar />
      <main className="flex-1 overflow-hidden flex flex-col pb-14 md:pb-0">
        {children}
      </main>
      <MobileNav />
      <InstallPrompt />
    </div>
  );
}

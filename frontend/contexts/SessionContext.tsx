'use client';

import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useAuth } from './AuthContext';
import { apiClient } from '@/lib/api-client';

function getStorageKey(uid: string | null) {
  return uid ? `me2_current_session_${uid}` : 'me2_current_session';
}

interface SessionContextValue {
  currentSessionId: string | undefined;
  refreshTrigger: number;
  mobileSidebarOpen: boolean;
  selectSession: (sessionId: string) => void;
  startNewChat: () => void;
  onSessionChange: (sessionId: string, isNew: boolean) => void;
  openMobileSidebar: () => void;
  closeMobileSidebar: () => void;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const { userId } = useAuth();
  const [currentSessionId, setCurrentSessionId] = useState<string | undefined>();
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  useEffect(() => {
    const key = getStorageKey(userId);
    const saved = localStorage.getItem(key);
    if (saved) {
      setCurrentSessionId(saved);
    } else {
      setCurrentSessionId(undefined);
    }
  }, [userId]);

  const selectSession = useCallback((sessionId: string) => {
    setCurrentSessionId(sessionId);
    localStorage.setItem(getStorageKey(userId), sessionId);
    setMobileSidebarOpen(false);
  }, [userId]);

  const startNewChat = useCallback(() => {
    setCurrentSessionId(undefined);
    localStorage.removeItem(getStorageKey(userId));
    setMobileSidebarOpen(false);
  }, [userId]);

  const onSessionChange = useCallback(async (sessionId: string, isNew: boolean) => {
    setCurrentSessionId(sessionId);
    localStorage.setItem(getStorageKey(userId), sessionId);
    if (isNew) {
      try {
        await apiClient.generateTitle(sessionId);
      } catch (err) {
        console.error('自动生成标题失败:', err);
      }
    }
    setRefreshTrigger((prev) => prev + 1);
  }, [userId]);

  const openMobileSidebar = useCallback(() => setMobileSidebarOpen(true), []);
  const closeMobileSidebar = useCallback(() => setMobileSidebarOpen(false), []);

  return (
    <SessionContext.Provider
      value={{
        currentSessionId,
        refreshTrigger,
        mobileSidebarOpen,
        selectSession,
        startNewChat,
        onSessionChange,
        openMobileSidebar,
        closeMobileSidebar,
      }}
    >
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used within SessionProvider');
  return ctx;
}

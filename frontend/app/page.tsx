'use client';

import ChatInterface from '@/components/ChatInterface';
import ProactiveMessageBanner from '@/components/ProactiveMessage';
import ProtectedRoute from '@/components/ProtectedRoute';
import { useAuth } from '@/contexts/AuthContext';

export default function Home() {
  const { userId } = useAuth();

  return (
    <ProtectedRoute>
      <div className="h-full flex flex-col">
        <ProactiveMessageBanner userId={userId || ''} />
        <div className="flex-1 overflow-hidden">
          <ChatInterface userId={userId || ''} />
        </div>
      </div>
    </ProtectedRoute>
  );
}

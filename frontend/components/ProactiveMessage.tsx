'use client';

import { useEffect, useState } from 'react';
import { Bell, X } from 'lucide-react';

interface ProactiveMessage {
  contact_id: string;
  message: string;
  trigger_type: string;
  trigger_reason: string;
  created_at: string;
}

interface ProactiveMessageProps {
  userId: string;
  onMessageRead?: (contactId: string) => void;
}

export default function ProactiveMessageBanner({ userId, onMessageRead }: ProactiveMessageProps) {
  const [messages, setMessages] = useState<ProactiveMessage[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (userId) {
      fetchMessages();
    }
  }, [userId]);

  const fetchMessages = async () => {
    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || '/api/v1'}/proactive/messages/${userId}`
      );

      if (response.ok) {
        const data = await response.json();
        if (data && data.length > 0) {
          setMessages(data);
          setDismissed(false);
        }
      }
      // 404 等非 ok 状态静默忽略（端点可能未部署）
    } catch {
      // 网络错误静默忽略
    }
  };

  const handleDismiss = async () => {
    if (messages.length > 0) {
      const currentMessage = messages[currentIndex];

      try {
        // 标记为已发送
        await fetch(
          `${process.env.NEXT_PUBLIC_API_URL || '/api/v1'}/proactive/messages/${currentMessage.contact_id}/mark-sent`,
          { method: 'POST' }
        );

        if (onMessageRead) {
          onMessageRead(currentMessage.contact_id);
        }
      } catch (error) {
        console.error('标记失败:', error);
      }

      // 显示下一条消息或隐藏
      if (currentIndex < messages.length - 1) {
        setCurrentIndex(currentIndex + 1);
      } else {
        setDismissed(true);
      }
    }
  };

  if (dismissed || messages.length === 0) {
    return null;
  }

  const currentMessage = messages[currentIndex];

  const getTriggerBadge = (type: string) => {
    const badges: Record<string, { label: string; color: string }> = {
      time: { label: '定时问候', color: 'bg-blue-100 text-blue-700' },
      event: { label: '事件提醒', color: 'bg-purple-100 text-purple-700' },
      context: { label: '主动关心', color: 'bg-green-100 text-green-700' },
    };

    const badge = badges[type] || { label: '消息', color: 'bg-gray-100 text-gray-700' };

    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${badge.color}`}>
        {badge.label}
      </span>
    );
  };

  return (
    <div className="fixed top-20 left-1/2 transform -translate-x-1/2 z-50 w-full max-w-2xl px-4">
      <div className="bg-gradient-to-r from-blue-500 to-purple-500 text-white rounded-lg shadow-lg p-4 animate-slide-down">
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 mt-1">
            <Bell className="w-5 h-5" />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              {getTriggerBadge(currentMessage.trigger_type)}
              {messages.length > 1 && (
                <span className="text-xs opacity-75">
                  {currentIndex + 1}/{messages.length}
                </span>
              )}
            </div>

            <p className="text-sm font-medium mb-1">Me2 想对你说：</p>
            <p className="text-white">{currentMessage.message}</p>

            {currentMessage.trigger_reason && (
              <p className="text-xs opacity-75 mt-2">
                原因: {currentMessage.trigger_reason}
              </p>
            )}
          </div>

          <button
            onClick={handleDismiss}
            className="flex-shrink-0 p-1 hover:bg-white/20 rounded transition-colors"
            aria-label="关闭"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
}

'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Loader2, Sparkles, Bug, Brain, ChevronDown, ChevronUp, Menu, Plus } from 'lucide-react';
import { apiClient, ChatMessage, StreamChunk, RecalledMemory } from '@/lib/api-client';
import { getMemoryTypeName } from '@/lib/utils';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import DebugPanel from './DebugPanel';

interface ChatInterfaceProps {
  userId: string;
  sessionId?: string;
  onSessionChange?: (id: string, isNew: boolean) => void;
  onOpenSidebar?: () => void;
  onNewChat?: () => void;
}

export default function ChatInterface({
  userId,
  sessionId: externalSessionId,
  onSessionChange,
  onOpenSidebar,
  onNewChat,
}: ChatInterfaceProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [internalSessionId, setInternalSessionId] = useState<string | undefined>(externalSessionId);
  const [debugMode, setDebugMode] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const isStreamingRef = useRef(false);
  const instantScrollRef = useRef(false);
  const skipNextLoadRef = useRef(false);

  const sessionId = externalSessionId ?? internalSessionId;

  useEffect(() => {
    const instant = instantScrollRef.current;
    instantScrollRef.current = false;
    messagesEndRef.current?.scrollIntoView({ behavior: instant ? 'instant' : 'smooth' });
  }, [messages]);

  // Load history when externalSessionId changes
  const loadHistory = useCallback(async (sid: string) => {
    setLoadingHistory(true);
    try {
      const msgs = await apiClient.getSessionMessages(sid);
      const chatMessages: ChatMessage[] = msgs.map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
        timestamp: m.created_at,
        memories_recalled: m.memories_recalled,
        recalled_summaries: m.recalled_summaries,
        system_prompt: m.system_prompt,
      }));
      instantScrollRef.current = true;
      setMessages(chatMessages);
      setInternalSessionId(sid);
    } catch (err) {
      console.error('加载历史消息失败:', err);
      // 会话不存在（404）时，清除无效 session 并重置为新聊天
      setMessages([]);
      setInternalSessionId(undefined);
      if (onNewChat) onNewChat();
    } finally {
      setLoadingHistory(false);
    }
  }, [onNewChat]);

  useEffect(() => {
    if (externalSessionId) {
      // Skip loading history while streaming to avoid overwriting in-progress messages
      if (isStreamingRef.current) return;
      // Skip if this session change was triggered by our own streaming (messages already in state)
      if (skipNextLoadRef.current) {
        skipNextLoadRef.current = false;
        return;
      }
      loadHistory(externalSessionId);
    } else {
      setMessages([]);
      setInternalSessionId(undefined);
    }
  }, [externalSessionId, loadHistory]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: ChatMessage = {
      role: 'user',
      content: input,
      timestamp: new Date().toISOString(),
    };

    const messageToSend = input;
    setInput('');
    setIsLoading(true);

    setMessages((prev) => [
      ...prev,
      userMessage,
      {
        role: 'assistant' as const,
        content: '',
        timestamp: new Date().toISOString(),
      },
    ]);

    try {
      let fullResponse = '';
      let debugInfo: any = null;
      let memoriesRecalled = 0;
      let recalledSummaries: RecalledMemory[] = [];

      isStreamingRef.current = true;
      for await (const chunk of apiClient.chatStream(messageToSend, sessionId, debugMode)) {
        if (chunk.type === 'token') {
          fullResponse += chunk.content || '';
          setMessages((prev) => {
            const newMessages = [...prev];
            const lastIndex = newMessages.length - 1;
            newMessages[lastIndex] = {
              ...newMessages[lastIndex],
              content: fullResponse,
            };
            return newMessages;
          });
        } else if (chunk.type === 'done') {
          if (chunk.session_id) {
            setInternalSessionId(chunk.session_id);
            skipNextLoadRef.current = true;
            onSessionChange?.(chunk.session_id, !!chunk.is_new_session);
          }
          memoriesRecalled = chunk.memories_recalled || 0;
          recalledSummaries = chunk.recalled_summaries || [];
          if (chunk.debug_info) {
            debugInfo = chunk.debug_info;
          }
        } else if (chunk.type === 'error') {
          throw new Error(chunk.error || '未知错误');
        }
      }

      setMessages((prev) => {
        const newMessages = [...prev];
        const lastIndex = newMessages.length - 1;
        newMessages[lastIndex] = {
          ...newMessages[lastIndex],
          debug_info: debugInfo || undefined,
          memories_recalled: memoriesRecalled,
          recalled_summaries: recalledSummaries.length > 0 ? recalledSummaries : undefined,
        };
        return newMessages;
      });
    } catch (error) {
      console.error('发送消息失败:', error);
      setMessages((prev) => {
        const newMessages = [...prev];
        const lastIndex = newMessages.length - 1;
        newMessages[lastIndex] = {
          ...newMessages[lastIndex],
          content: '抱歉，我遇到了一些问题，请稍后再试。',
        };
        return newMessages;
      });
    } finally {
      isStreamingRef.current = false;
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="sticky top-0 z-10 flex items-center justify-between px-3 md:px-6 py-2.5 md:py-3.5 border-b border-white/5 glass">
        <div className="flex items-center gap-2 md:gap-3">
          {/* Mobile: sidebar toggle */}
          {onOpenSidebar && (
            <button
              onClick={onOpenSidebar}
              className="md:hidden p-1.5 rounded-lg hover:bg-secondary/50 text-muted-foreground hover:text-foreground transition-colors"
            >
              <Menu className="w-5 h-5" />
            </button>
          )}
          <h1 className="text-base font-semibold text-foreground/90">对话</h1>
          {sessionId && (
            <span className="hidden sm:inline text-xs text-muted-foreground/70 font-mono bg-secondary/30 px-2 py-0.5 rounded">
              {sessionId.slice(0, 8)}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5 md:gap-2">
          {/* Mobile: new chat */}
          {onNewChat && (
            <button
              onClick={onNewChat}
              className="md:hidden p-1.5 rounded-lg hover:bg-secondary/50 text-muted-foreground hover:text-foreground transition-colors"
            >
              <Plus className="w-5 h-5" />
            </button>
          )}
          <button
            onClick={() => setDebugMode(!debugMode)}
            className={`hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs transition-all ${
              debugMode
                ? 'glass-strong text-primary'
                : 'text-muted-foreground/50 hover:text-muted-foreground hover:bg-white/5'
            }`}
          >
            <Bug className="w-3.5 h-3.5" />
            调试
          </button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Chat Area */}
        <div className={`flex flex-col transition-all duration-300 ${debugMode ? 'md:w-2/3' : 'w-full'}`}>
          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-3 md:px-6 py-4 md:py-6 space-y-4 md:space-y-6">
            {loadingHistory && (
              <div className="flex justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground/50" />
              </div>
            )}

            {!loadingHistory && messages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-center px-4">
                <div className="w-16 h-16 md:w-20 md:h-20 rounded-full glass-strong flex items-center justify-center mb-4 md:mb-6">
                  <Sparkles className="w-8 h-8 md:w-10 md:h-10 text-primary/60" />
                </div>
                <p className="text-lg md:text-xl font-medium text-foreground/80 mb-2">开始和 Me2 聊天吧！</p>
                <p className="text-sm text-muted-foreground/60">我会记住你说的每一句话</p>
              </div>
            )}

            {messages.map((message, index) => {
              if (message.role === 'assistant' && !message.content && isLoading && index === messages.length - 1) {
                return null;
              }
              return (
                <div
                  key={index}
                  className={`flex gap-2.5 md:gap-4 ${
                    message.role === 'user' ? 'justify-end' : 'justify-start'
                  } animate-in fade-in slide-in-from-bottom-2 duration-500`}
                >
                  {message.role === 'assistant' && (
                    <div className="flex-shrink-0">
                      <div className="w-7 h-7 md:w-9 md:h-9 rounded-xl glass-strong flex items-center justify-center shadow-lg">
                        <Sparkles className="w-4 h-4 md:w-5 md:h-5 text-primary" />
                      </div>
                    </div>
                  )}
                  <div
                    className={`flex flex-col ${
                      message.role === 'user' ? 'items-end' : 'items-start'
                    } max-w-[85%] md:max-w-[70%]`}
                  >
                    <div
                      className={`rounded-2xl px-3 py-2 md:px-4 md:py-2.5 ${
                        message.role === 'user'
                          ? 'bg-gradient-to-br from-primary to-violet-500 text-white shadow-lg shadow-primary/25'
                          : 'glass-card shadow-lg'
                      }`}
                    >
                      {message.role === 'user' ? (
                        <p className="whitespace-pre-wrap leading-relaxed text-[14px] md:text-[15px] font-normal">{message.content}</p>
                      ) : (
                        <div className="prose prose-sm prose-invert max-w-none prose-p:my-1 md:prose-p:my-1.5 prose-p:leading-relaxed prose-p:text-[14px] md:prose-p:text-[15px] prose-headings:text-foreground prose-strong:text-foreground prose-code:text-cyan-300 prose-code:bg-white/5 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>
                            {message.content}
                          </ReactMarkdown>
                        </div>
                      )}
                    </div>
                    {/* Memory recall indicator - expandable */}
                    {message.role === 'assistant' && !!message.memories_recalled && message.memories_recalled > 0 && (
                      <MemoryRecallTag
                        count={message.memories_recalled}
                        summaries={message.recalled_summaries}
                      />
                    )}
                    {message.timestamp && (
                      <p className="text-[11px] text-muted-foreground/50 mt-1 px-2 font-mono">
                        {new Date(message.timestamp).toLocaleTimeString('zh-CN', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}

            {isLoading && messages.length > 0 && messages[messages.length - 1].role === 'assistant' && !messages[messages.length - 1].content && (
              <div className="flex justify-start gap-2.5 md:gap-4 animate-in fade-in duration-300">
                <div className="flex-shrink-0">
                  <div className="w-7 h-7 md:w-9 md:h-9 rounded-xl glass-strong flex items-center justify-center shadow-lg">
                    <Sparkles className="w-4 h-4 md:w-5 md:h-5 text-primary" />
                  </div>
                </div>
                <div className="glass-card rounded-3xl px-5 py-3 md:px-6 md:py-4 shadow-lg">
                  <Loader2 className="w-5 h-5 animate-spin text-primary/60" />
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="px-3 py-2.5 md:px-6 md:py-4">
            <div className="flex items-end gap-0 max-w-4xl mx-auto glass-card rounded-2xl md:rounded-3xl px-3 py-2 md:px-4 md:py-3 focus-within:ring-2 focus-within:ring-primary/40 focus-within:shadow-lg focus-within:shadow-primary/10 transition-all">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="输入消息..."
                className="flex-1 resize-none bg-transparent text-foreground focus:outline-none placeholder:text-muted-foreground/50 text-[14px] md:text-[15px] min-h-[28px] md:min-h-[32px] max-h-[120px] py-1.5 md:py-2 px-2 md:px-3"
                rows={1}
              />
              <button
                onClick={handleSend}
                disabled={!input.trim() || isLoading}
                className="shrink-0 bg-primary/90 text-white rounded-xl p-2 md:p-2.5 hover:bg-primary hover:shadow-lg hover:shadow-primary/30 disabled:bg-white/5 disabled:text-muted-foreground/30 disabled:cursor-not-allowed disabled:shadow-none transition-all duration-200 flex items-center justify-center mb-0.5"
              >
                <Send className="w-4 h-4 md:w-5 md:h-5" />
              </button>
            </div>
          </div>
        </div>

        {/* Right: Debug Panel - desktop only */}
        {debugMode && (
          <div className="hidden md:flex w-1/3 border-l border-white/5 glass flex-col overflow-hidden animate-in slide-in-from-right duration-300">
            <div className="px-3 py-2 border-b border-white/5 flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <Bug className="w-3.5 h-3.5" />
                <span className="text-xs font-medium">调试</span>
              </div>
              <button
                onClick={() => setDebugMode(false)}
                className="text-muted-foreground/50 hover:text-muted-foreground text-xs px-1.5 py-0.5 rounded hover:bg-white/5 transition-colors"
              >
                关闭
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2">
              {messages
                .filter((msg) => msg.role === 'assistant' && (msg.debug_info || msg.system_prompt))
                .map((msg, idx) => (
                  <div key={idx} className="glass-card rounded-lg p-2">
                    <div className="text-[11px] text-muted-foreground/70 mb-1.5 flex items-center gap-1.5">
                      <span className="font-mono">#{messages.indexOf(msg) + 1}</span>
                      <span className="opacity-40">·</span>
                      <span>
                        {new Date(msg.timestamp!).toLocaleTimeString('zh-CN', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                      {!msg.debug_info && (
                        <span className="text-[10px] bg-white/5 px-1 py-0.5 rounded text-muted-foreground/50">历史</span>
                      )}
                    </div>
                    {msg.debug_info ? (
                      <DebugPanel debugInfo={msg.debug_info} />
                    ) : (
                      <HistoryDebugView
                        systemPrompt={msg.system_prompt}
                        memoriesRecalled={msg.memories_recalled}
                      />
                    )}
                  </div>
                ))}
              {messages.filter((msg) => msg.role === 'assistant' && (msg.debug_info || msg.system_prompt)).length === 0 && (
                <div className="text-center text-muted-foreground/30 mt-8">
                  <Bug className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  <p className="text-xs">对话后显示调试信息</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function HistoryDebugView({
  systemPrompt,
  memoriesRecalled,
}: {
  systemPrompt?: string;
  memoriesRecalled?: number;
}) {
  const [showPrompt, setShowPrompt] = useState(false);

  return (
    <div className="mt-3 border-t border-border/50 pt-3 space-y-3 text-xs">
      {memoriesRecalled !== undefined && (
        <div className="flex items-center gap-2 text-purple-400/80">
          <Brain className="w-3.5 h-3.5" />
          <span>召回 {memoriesRecalled} 条记忆</span>
        </div>
      )}
      {systemPrompt && (
        <div className="bg-secondary/50 border border-border/50 rounded-xl p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="font-semibold text-orange-400/90">System Prompt</span>
            <button
              onClick={() => setShowPrompt(!showPrompt)}
              className="text-orange-400/80 hover:text-orange-300 transition-colors px-2 py-1 rounded-lg hover:bg-orange-500/10 text-[11px]"
            >
              {showPrompt ? '隐藏' : '查看'}
            </button>
          </div>
          {showPrompt && (
            <pre className="whitespace-pre-wrap text-gray-300 font-mono text-[11px] leading-relaxed max-h-96 overflow-y-auto mt-2">
              {systemPrompt}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

function MemoryRecallTag({
  count,
  summaries,
}: {
  count: number;
  summaries?: RecalledMemory[];
}) {
  const [expanded, setExpanded] = useState(false);
  const hasDetails = summaries && summaries.length > 0;

  return (
    <div className="mt-1.5 px-2">
      <button
        onClick={() => hasDetails && setExpanded(!expanded)}
        className={`flex items-center gap-1 text-xs text-purple-400/70 transition-colors ${
          hasDetails ? 'hover:text-purple-400 cursor-pointer' : 'cursor-default'
        }`}
      >
        <Brain className="w-3 h-3" />
        <span>回忆了 {count} 条记忆</span>
        {hasDetails && (
          expanded
            ? <ChevronUp className="w-3 h-3 ml-0.5" />
            : <ChevronDown className="w-3 h-3 ml-0.5" />
        )}
      </button>
      {expanded && summaries && (
        <div className="mt-1.5 space-y-1 animate-in fade-in slide-in-from-top-1 duration-200">
          {summaries.map((mem, i) => (
            <div
              key={i}
              className="flex items-start gap-2 px-2.5 py-1.5 rounded-lg bg-purple-500/5 border border-purple-500/10 text-xs"
            >
              <span className="text-purple-400/50 font-mono shrink-0">
                {(mem.score * 100).toFixed(0)}%
              </span>
              {mem.source === 'conversation' ? (
                <span className="shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-500/20 text-gray-400/80">
                  对话
                </span>
              ) : mem.memory_type ? (
                <span className="shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium bg-purple-500/15 text-purple-300/80">
                  {getMemoryTypeName(mem.memory_type)}
                </span>
              ) : null}
              <span className="text-purple-300/70 leading-relaxed">
                {mem.content}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

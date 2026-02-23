'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp, Code, Clock, Database, Zap, MessageSquare, Activity } from 'lucide-react';

interface DebugInfo {
  model?: string;
  temperature?: number;
  max_tokens?: number;
  messages?: Array<{ role: string; content: string }>;
  message_count?: number;
  system_prompt?: string;
  history_count?: number;
  timings?: {
    fetch_history?: number;
    save_user_message?: number;
    recall_memories?: number;
    fetch_insights?: number;
    build_prompt?: number;
    llm_generate?: number;
    save_to_db?: number;
    sync_neuromemory?: number;
    total?: number;
    recall_detail?: {
      embedding?: number;
      parallel_search?: number;
      merge?: number;
      vector_count?: number;
      conversation_count?: number;
      graph_count?: number;
    };
  };
  background_tasks?: string[];
}

interface DebugPanelProps {
  debugInfo: DebugInfo;
}

export default function DebugPanel({ debugInfo }: DebugPanelProps) {
  const [showPrompt, setShowPrompt] = useState(false);
  const [showModel, setShowModel] = useState(false);

  const timings = debugInfo.timings || {};
  const totalTime = (timings.total || 0) * 1000;

  const getPercentage = (time?: number) => {
    if (!time || !timings.total) return 0;
    return (time / timings.total) * 100;
  };

  const performanceSteps = [
    { key: 'fetch_history', label: '获取历史', color: 'bg-blue-500' },
    { key: 'recall_memories', label: '记忆召回', color: 'bg-purple-500' },
    { key: 'fetch_insights', label: '获取洞察', color: 'bg-yellow-500' },
    { key: 'build_prompt', label: '构建Prompt', color: 'bg-green-500' },
    { key: 'llm_generate', label: 'LLM生成', color: 'bg-orange-500' },
    { key: 'save_to_db', label: '保存数据', color: 'bg-cyan-500' },
    { key: 'sync_neuromemory', label: '同步记忆', color: 'bg-pink-500' },
  ];

  const slowestKey = performanceSteps.reduce((maxKey, step) => {
    const t = Number(timings[step.key as keyof typeof timings]) || 0;
    const mt = Number(timings[maxKey as keyof typeof timings]) || 0;
    return t > mt ? step.key : maxKey;
  }, performanceSteps[0].key);

  return (
    <div className="mt-2 border-t border-white/5 pt-2 space-y-1.5 text-[11px]">
      {/* 耗时分解 - 默认展开 */}
      <div className="space-y-1">
        {performanceSteps.map((step) => {
          const timeVal = timings[step.key as keyof typeof timings];
          if (!timeVal || typeof timeVal !== 'number') return null;

          const ms = timeVal * 1000;
          const percentage = getPercentage(timeVal);
          const isSlowest = step.key === slowestKey;
          const rd = step.key === 'recall_memories' ? timings.recall_detail : undefined;

          return (
            <div key={step.key}>
              <div className="flex items-center gap-2">
                <span className={`w-[5.5em] text-right shrink-0 ${isSlowest ? 'text-red-400/80' : 'text-muted-foreground/50'}`}>
                  {step.label}
                </span>
                <div className="flex-1 bg-white/5 rounded-full h-1 overflow-hidden">
                  <div
                    className={`h-full ${step.color} ${isSlowest ? 'opacity-80' : 'opacity-50'} transition-all duration-500`}
                    style={{ width: `${Math.max(percentage, 2)}%` }}
                  />
                </div>
                <span className={`font-mono text-[10px] w-12 text-right shrink-0 ${isSlowest ? 'text-red-400/80' : 'text-muted-foreground/40'}`}>
                  {ms.toFixed(0)}ms
                </span>
              </div>
              {/* 记忆召回子阶段 */}
              {rd && (
                <div className="ml-[6.5em] mt-0.5 flex items-center gap-2 text-[10px] text-muted-foreground/40">
                  {rd.embedding ? <span>向量化 {(rd.embedding * 1000).toFixed(0)}ms</span> : null}
                  {rd.parallel_search ? <span>· 搜索 {(rd.parallel_search * 1000).toFixed(0)}ms</span> : null}
                  {rd.vector_count !== undefined ? <span>· {rd.vector_count}条向量</span> : null}
                  {(rd.graph_count ?? 0) > 0 ? <span>· {rd.graph_count}条图谱</span> : null}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* 总计 + 历史条数 */}
      <div className="flex items-center gap-3 text-muted-foreground/60">
        <span className="flex items-center gap-1">
          <Clock className="w-3 h-3" />
          总计 {totalTime.toFixed(0)}ms
        </span>
        {debugInfo.history_count !== undefined && (
          <span className="flex items-center gap-1">
            <MessageSquare className="w-3 h-3" />
            {debugInfo.history_count}条历史
          </span>
        )}
      </div>

      {/* Prompt 折叠 */}
      <div className="pt-1 border-t border-white/5">
        <button
          onClick={() => setShowPrompt(!showPrompt)}
          className="flex items-center gap-1 text-[10px] text-muted-foreground/50 hover:text-muted-foreground transition-colors"
        >
          <Code className="w-3 h-3" />
          Prompt
          {debugInfo.message_count && <span>({debugInfo.message_count}条)</span>}
          {showPrompt ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </button>

        {showPrompt && debugInfo.messages && (
          <div className="mt-1 space-y-1 max-h-80 overflow-y-auto">
            {debugInfo.messages.map((msg, idx) => (
              <div key={idx} className="bg-white/5 rounded p-1.5">
                <span className={`text-[9px] font-medium px-1 py-0.5 rounded ${
                  msg.role === 'system' ? 'bg-purple-500/15 text-purple-400/70' :
                  msg.role === 'user' ? 'bg-blue-500/15 text-blue-400/70' :
                  'bg-green-500/15 text-green-400/70'
                }`}>
                  {msg.role}
                </span>
                <pre className="mt-1 whitespace-pre-wrap text-muted-foreground/60 font-mono text-[10px] leading-relaxed">
                  {msg.content}
                </pre>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 模型参数折叠 */}
      {debugInfo.model && (
        <div className="border-t border-white/5 pt-1">
          <button
            onClick={() => setShowModel(!showModel)}
            className="flex items-center gap-1 text-[10px] text-muted-foreground/50 hover:text-muted-foreground transition-colors"
          >
            <Zap className="w-3 h-3" />
            模型参数
            {showModel ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>

          {showModel && (
            <div className="mt-1 grid grid-cols-3 gap-1.5 text-muted-foreground/60">
              <div>
                <div className="text-[9px] text-muted-foreground/40">Model</div>
                <div className="font-mono text-[10px]">{debugInfo.model}</div>
              </div>
              <div>
                <div className="text-[9px] text-muted-foreground/40">Temp</div>
                <div className="font-mono text-[10px]">{debugInfo.temperature}</div>
              </div>
              <div>
                <div className="text-[9px] text-muted-foreground/40">Tokens</div>
                <div className="font-mono text-[10px]">{debugInfo.max_tokens}</div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

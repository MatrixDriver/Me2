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
  };
  background_tasks?: string[];
}

interface DebugPanelProps {
  debugInfo: DebugInfo;
}

export default function DebugPanel({ debugInfo }: DebugPanelProps) {
  const [expanded, setExpanded] = useState(false);
  const [showPrompt, setShowPrompt] = useState(false);

  const timings = debugInfo.timings || {};
  const totalTime = (timings.total || 0) * 1000;

  // 计算各步骤百分比
  const getPercentage = (time?: number) => {
    if (!time || !timings.total) return 0;
    return (time / timings.total) * 100;
  };

  // 性能步骤配置
  const performanceSteps = [
    { key: 'fetch_history', label: '获取历史', icon: Database, color: 'blue' },
    { key: 'recall_memories', label: '记忆召回', icon: Database, color: 'purple' },
    { key: 'fetch_insights', label: '获取洞察', icon: Zap, color: 'yellow' },
    { key: 'build_prompt', label: '构建Prompt', icon: Code, color: 'green' },
    { key: 'llm_generate', label: 'LLM生成', icon: MessageSquare, color: 'orange' },
    { key: 'save_to_db', label: '保存数据', icon: Database, color: 'cyan' },
    { key: 'sync_neuromemory', label: '同步记忆', icon: Activity, color: 'pink' },
  ];

  // 找出最慢的步骤
  const slowestStep = performanceSteps.reduce((max, step) => {
    const time = timings[step.key as keyof typeof timings] || 0;
    const maxTime = timings[max.key as keyof typeof timings] || 0;
    return time > maxTime ? step : max;
  }, performanceSteps[0]);

  const getColorClass = (color: string) => {
    const colors: Record<string, string> = {
      blue: 'bg-blue-500',
      purple: 'bg-purple-500',
      yellow: 'bg-yellow-500',
      green: 'bg-green-500',
      orange: 'bg-orange-500',
      cyan: 'bg-cyan-500',
      pink: 'bg-pink-500',
    };
    return colors[color] || 'bg-gray-500';
  };

  return (
    <div className="mt-2 border-t border-white/5 pt-2 space-y-2">
      {/* 性能摘要 */}
      <div className="flex items-center justify-between text-[11px]">
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1 text-muted-foreground">
            <Clock className="w-3 h-3" />
            {totalTime.toFixed(0)}ms
          </span>
          {debugInfo.history_count !== undefined && (
            <span className="flex items-center gap-1 text-muted-foreground">
              <MessageSquare className="w-3 h-3" />
              {debugInfo.history_count}条
            </span>
          )}
        </div>
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-0.5 text-muted-foreground/60 hover:text-muted-foreground transition-colors"
        >
          {expanded ? '收起' : '详情'}
          {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </button>
      </div>

      {/* 展开的性能详情 */}
      {expanded && (
        <div className="space-y-2 text-[11px] animate-in slide-in-from-top-2 duration-200">
          {/* 性能分解 */}
          <div className="glass-card rounded-lg p-2">
            <div className="text-[10px] font-medium mb-1.5 text-muted-foreground/70 flex items-center gap-1">
              <Activity className="w-3 h-3" />
              耗时分解
            </div>
            <div className="space-y-1">
              {performanceSteps.map((step) => {
                const time = timings[step.key as keyof typeof timings];
                if (!time) return null;

                const ms = time * 1000;
                const percentage = getPercentage(time);
                const isSlowest = step.key === slowestStep.key;

                return (
                  <div key={step.key}>
                    <div className="flex items-center justify-between">
                      <span className={`flex items-center gap-1 ${isSlowest ? 'text-red-400/80' : 'text-muted-foreground/60'}`}>
                        {step.label}
                        {isSlowest && <span className="text-[9px] text-red-400/60">慢</span>}
                      </span>
                      <span className={`font-mono text-[10px] ${isSlowest ? 'text-red-400/80' : 'text-muted-foreground/50'}`}>
                        {ms.toFixed(0)}ms
                      </span>
                    </div>
                    <div className="w-full bg-white/5 rounded-full h-1 overflow-hidden">
                      <div
                        className={`h-full ${getColorClass(step.color)} opacity-60 transition-all duration-500`}
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-1.5 pt-1.5 border-t border-white/5">
              <div className="flex items-center justify-between text-muted-foreground/70">
                <span>总计</span>
                <span className="font-mono text-[10px]">{totalTime.toFixed(0)}ms</span>
              </div>
            </div>
          </div>

          {/* 完整Prompt */}
          <div className="glass-card rounded-lg p-2">
            <div className="flex items-center justify-between">
              <div className="text-[10px] font-medium text-muted-foreground/70 flex items-center gap-1">
                <Code className="w-3 h-3" />
                Prompt
                {debugInfo.message_count && (
                  <span className="text-muted-foreground/40">({debugInfo.message_count}条)</span>
                )}
              </div>
              <button
                onClick={() => setShowPrompt(!showPrompt)}
                className="text-muted-foreground/50 hover:text-muted-foreground transition-colors text-[10px]"
              >
                {showPrompt ? '隐藏' : '查看'}
              </button>
            </div>

            {showPrompt && debugInfo.messages && (
              <div className="mt-1.5 space-y-1 max-h-80 overflow-y-auto">
                {debugInfo.messages.map((msg, idx) => (
                  <div key={idx} className="bg-white/5 rounded p-1.5">
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className={`text-[9px] font-medium px-1 py-0.5 rounded ${
                        msg.role === 'system' ? 'bg-purple-500/15 text-purple-400/70' :
                        msg.role === 'user' ? 'bg-blue-500/15 text-blue-400/70' :
                        'bg-green-500/15 text-green-400/70'
                      }`}>
                        {msg.role}
                      </span>
                    </div>
                    <pre className="whitespace-pre-wrap text-muted-foreground/60 font-mono text-[10px] leading-relaxed">
                      {msg.content}
                    </pre>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 模型参数 */}
          {debugInfo.model && (
            <div className="glass-card rounded-lg p-2">
              <div className="text-[10px] font-medium mb-1 text-muted-foreground/70 flex items-center gap-1">
                <Zap className="w-3 h-3" />
                模型
              </div>
              <div className="grid grid-cols-3 gap-1.5 text-muted-foreground/60">
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
            </div>
          )}
        </div>
      )}
    </div>
  );
}

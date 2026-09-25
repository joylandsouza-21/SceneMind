'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Terminal, ChevronDown, ChevronUp, Copy, Check, Sparkles, RefreshCw } from 'lucide-react';

interface ProcessingLogsConsoleProps {
  logs?: string[];
  currentStep?: string;
  progress?: number;
  status?: string;
  isCompact?: boolean;
  defaultExpanded?: boolean;
  title?: string;
}

export default function ProcessingLogsConsole({
  logs = [],
  currentStep,
  progress = 0,
  status = 'processing',
  isCompact = false,
  defaultExpanded = true,
  title = 'Live Processing Logs',
}: ProcessingLogsConsoleProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const [copied, setCopied] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll to bottom as new logs arrive if expanded
  useEffect(() => {
    if (isExpanded && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs, isExpanded]);

  const handleCopyLogs = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (logs.length === 0) return;
    navigator.clipboard.writeText(logs.join('\n'));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const getLogLineStyle = (line: string) => {
    if (line.includes('❌') || line.includes('Failed') || line.includes('failed')) {
      return 'text-rose-400 bg-rose-500/10 px-1 rounded';
    }
    if (line.includes('✅') || line.includes('🎉') || line.includes('complete') || line.includes('Indexed')) {
      return 'text-emerald-400';
    }
    if (line.includes('⚠️') || line.includes('Transcoding') || line.includes('Non-web codec')) {
      return 'text-amber-300';
    }
    if (line.includes('🤖') || line.includes('[Gemini AI]')) {
      return 'text-cyan-300';
    }
    if (line.includes('📌') || line.includes('[4/6]') || line.includes('[5/6]')) {
      return 'text-indigo-300';
    }
    return 'text-slate-300';
  };

  return (
    <div className="rounded-2xl bg-slate-950/90 border border-slate-800/90 overflow-hidden font-mono shadow-xl transition-all">
      {/* Header bar / Toggle */}
      <div
        onClick={() => setIsExpanded(!isExpanded)}
        className="px-3.5 py-2.5 bg-slate-900/90 border-b border-slate-800/80 flex items-center justify-between gap-2 cursor-pointer hover:bg-slate-800/60 transition-colors select-none"
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <div className="w-5 h-5 rounded-lg bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center text-indigo-400 shrink-0">
            <Terminal className="w-3 h-3" />
          </div>
          <span className="text-xs font-semibold text-slate-200 truncate">
            {title} ({logs.length} {logs.length === 1 ? 'event' : 'events'})
          </span>

          {currentStep && (
            <span className="text-[11px] text-slate-400 truncate max-w-xs hidden sm:inline-block font-sans">
              • {currentStep}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {status === 'processing' && (
            <span className="inline-flex items-center gap-1 text-[10px] text-amber-400 bg-amber-500/10 border border-amber-500/25 px-2 py-0.5 rounded-full font-sans animate-pulse">
              <RefreshCw className="w-2.5 h-2.5 animate-spin" />
              <span>{progress}%</span>
            </span>
          )}

          <button
            type="button"
            onClick={handleCopyLogs}
            disabled={logs.length === 0}
            className="p-1 rounded text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors disabled:opacity-30"
            title="Copy logs to clipboard"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
          </button>

          <button
            type="button"
            className="text-slate-400 hover:text-slate-200 p-0.5"
            aria-label={isExpanded ? 'Collapse logs' : 'Expand logs'}
          >
            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Terminal Body */}
      {isExpanded && (
        <div
          ref={scrollRef}
          className={`p-3 space-y-1.5 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-700 text-[11px] leading-relaxed select-text ${
            isCompact ? 'max-h-40' : 'max-h-60'
          }`}
        >
          {logs.length === 0 ? (
            <div className="text-slate-500 italic py-2 text-center">
              Awaiting pipeline task execution...
            </div>
          ) : (
            logs.map((logLine, idx) => (
              <div key={idx} className={`font-mono break-words ${getLogLineStyle(logLine)}`}>
                {logLine}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

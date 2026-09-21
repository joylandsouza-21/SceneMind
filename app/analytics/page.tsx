'use client';

import React, { useEffect, useState, useMemo, useRef } from 'react';
import {
  DollarSign,
  Cpu,
  Zap,
  Clock,
  Film,
  TrendingUp,
  BarChart3,
  Layers,
  ArrowUpRight,
  ArrowDownRight,
  Activity,
  ChevronDown,
  ChevronUp,
  Search,
  RefreshCw,
} from 'lucide-react';

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */
interface Summary {
  totalCost: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalTokens: number;
  totalProcessingTimeMs: number;
  totalOperations: number;
  averageCostPerOperation: number;
}

interface PerVideoEntry {
  videoId: string;
  videoName: string;
  totalCost: number;
  operationCount: number;
  inputTokens: number;
  outputTokens: number;
  processingTimeMs: number;
  byType: Record<string, { count: number; cost: number }>;
}

interface PerRequestTypeEntry {
  type: string;
  count: number;
  cost: number;
  inputTokens: number;
  outputTokens: number;
}

interface PerModelEntry {
  model: string;
  count: number;
  cost: number;
  inputTokens: number;
  outputTokens: number;
}

interface TimelineEntry {
  hour: string;
  cost: number;
  operations: number;
}

interface RecentOp {
  id: string;
  videoId?: string;
  videoName: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  estimatedCost: number;
  processingTimeMs: number;
  requestType: string;
  createdAt: string;
}

interface AnalyticsData {
  summary: Summary;
  perVideo: PerVideoEntry[];
  perRequestType: PerRequestTypeEntry[];
  perModel: PerModelEntry[];
  timeline: TimelineEntry[];
  recentOperations: RecentOp[];
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */
function formatCost(amount: number): string {
  if (amount === 0) return '$0.0000';
  if (amount < 0.001) return `$${amount.toFixed(6)}`;
  if (amount < 1) return `$${amount.toFixed(4)}`;
  return `$${amount.toFixed(2)}`;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

function formatMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60_000).toFixed(1)}m`;
}

function friendlyType(type: string): string {
  const map: Record<string, string> = {
    SCENE_ANALYSIS: 'Scene Analysis',
    EMBEDDING: 'Embedding',
    TIMESTAMP_VERIFICATION: 'Timestamp Verify',
    RERANKING: 'Re-ranking',
  };
  return map[type] || type;
}

const TYPE_COLORS: Record<string, { bg: string; text: string; bar: string }> = {
  SCENE_ANALYSIS: { bg: 'bg-blue-500/15', text: 'text-blue-400', bar: 'bg-blue-500' },
  EMBEDDING: { bg: 'bg-purple-500/15', text: 'text-purple-400', bar: 'bg-purple-500' },
  TIMESTAMP_VERIFICATION: { bg: 'bg-amber-500/15', text: 'text-amber-400', bar: 'bg-amber-500' },
  RERANKING: { bg: 'bg-emerald-500/15', text: 'text-emerald-400', bar: 'bg-emerald-500' },
};

function typeColor(type: string) {
  return TYPE_COLORS[type] || { bg: 'bg-slate-500/15', text: 'text-slate-400', bar: 'bg-slate-500' };
}

/* ------------------------------------------------------------------ */
/* Mini bar chart (pure CSS)                                           */
/* ------------------------------------------------------------------ */
function MiniBarChart({ data, maxVal }: { data: TimelineEntry[]; maxVal: number }) {
  if (data.length === 0) {
    return (
      <div className="flex items-end justify-center h-28 text-xs text-slate-500">
        No timeline data yet
      </div>
    );
  }
  return (
    <div className="flex items-end gap-[2px] h-28 w-full">
      {data.map((d, i) => {
        const pct = maxVal > 0 ? (d.cost / maxVal) * 100 : 0;
        return (
          <div
            key={i}
            className="flex-1 min-w-[3px] max-w-[18px] group relative"
          >
            <div
              className="w-full bg-gradient-to-t from-blue-600 to-cyan-400 rounded-t opacity-80 group-hover:opacity-100 transition-opacity cursor-default"
              style={{ height: `${Math.max(pct, 2)}%` }}
            />
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-30 whitespace-nowrap">
              <div className="px-2.5 py-1.5 text-[10px] bg-slate-900 border border-slate-700 rounded-lg shadow-lg text-slate-200 space-y-0.5">
                <div className="font-mono font-medium">{formatCost(d.cost)}</div>
                <div className="text-slate-400">{d.operations} ops</div>
                <div className="text-slate-500">{d.hour}</div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Cost Distribution Ring (CSS-based)                                  */
/* ------------------------------------------------------------------ */
function CostDistributionRing({ entries, total }: { entries: PerRequestTypeEntry[]; total: number }) {
  if (entries.length === 0 || total === 0) {
    return (
      <div className="flex items-center justify-center h-40 text-xs text-slate-500">
        No cost data
      </div>
    );
  }

  // Build conic gradient segments
  let accumulated = 0;
  const segments: string[] = [];
  const colors = ['#3b82f6', '#a855f7', '#f59e0b', '#10b981', '#6366f1', '#ef4444'];

  entries.forEach((e, i) => {
    const pct = (e.cost / total) * 100;
    const color = colors[i % colors.length];
    segments.push(`${color} ${accumulated}% ${accumulated + pct}%`);
    accumulated += pct;
  });

  return (
    <div className="flex items-center gap-6">
      <div
        className="w-28 h-28 rounded-full shrink-0"
        style={{
          background: `conic-gradient(${segments.join(', ')})`,
          WebkitMask: 'radial-gradient(farthest-side, transparent 60%, #000 61%)',
          mask: 'radial-gradient(farthest-side, transparent 60%, #000 61%)',
        }}
      />
      <div className="space-y-2 flex-1 min-w-0">
        {entries.map((e, i) => {
          const pct = ((e.cost / total) * 100).toFixed(1);
          return (
            <div key={e.type} className="flex items-center gap-2 text-xs">
              <div
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{ backgroundColor: colors[i % colors.length] }}
              />
              <span className="text-slate-300 truncate flex-1">{friendlyType(e.type)}</span>
              <span className="text-slate-400 font-mono whitespace-nowrap">{pct}%</span>
              <span className="text-slate-200 font-mono font-medium whitespace-nowrap">{formatCost(e.cost)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Page Component                                                      */
/* ------------------------------------------------------------------ */
export default function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedVideo, setExpandedVideo] = useState<string | null>(null);
  const [opsFilter, setOpsFilter] = useState('');
  const [opsTypeFilter, setOpsTypeFilter] = useState<string>('ALL');
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = async (showSpinner = true) => {
    if (showSpinner) setRefreshing(true);
    try {
      const res = await fetch('/api/costs/analytics');
      if (!res.ok) throw new Error('Failed to fetch analytics');
      const json = await res.json();
      setData(json);
      setError(null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchData(false);
    const interval = setInterval(() => fetchData(false), 10000);
    return () => clearInterval(interval);
  }, []);

  const [visibleCount, setVisibleCount] = useState<number>(20);
  const [isLoadingMore, setIsLoadingMore] = useState<boolean>(false);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setVisibleCount(20);
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = 0;
    }
  }, [opsFilter, opsTypeFilter]);

  const filteredOps = useMemo(() => {
    if (!data) return [];
    let ops = data.recentOperations;
    if (opsTypeFilter !== 'ALL') {
      ops = ops.filter((o) => o.requestType === opsTypeFilter);
    }
    if (opsFilter.trim()) {
      const q = opsFilter.toLowerCase();
      ops = ops.filter(
        (o) =>
          o.videoName.toLowerCase().includes(q) ||
          o.model.toLowerCase().includes(q) ||
          o.requestType.toLowerCase().includes(q)
      );
    }
    return ops;
  }, [data, opsFilter, opsTypeFilter]);

  const displayedOps = useMemo(() => {
    return filteredOps.slice(0, visibleCount);
  }, [filteredOps, visibleCount]);

  const hasMore = visibleCount < filteredOps.length;

  const loadMore = () => {
    if (!hasMore || isLoadingMore) return;
    setIsLoadingMore(true);
    setTimeout(() => {
      setVisibleCount((prev) => Math.min(prev + 20, filteredOps.length));
      setIsLoadingMore(false);
    }, 150);
  };

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    if (scrollHeight - scrollTop - clientHeight < 80) {
      loadMore();
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
          <span className="text-sm text-slate-400">Loading analytics...</span>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="p-8 rounded-2xl bg-red-950/30 border border-red-500/30 text-center space-y-3">
          <p className="text-red-400 font-medium">Error loading analytics</p>
          <p className="text-xs text-slate-400">{error}</p>
          <button
            onClick={() => { setLoading(true); fetchData(); }}
            className="px-4 py-2 bg-red-600/20 border border-red-500/40 rounded-lg text-red-300 text-xs hover:bg-red-600/30 transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const { summary, perVideo, perRequestType, perModel, timeline } = data;
  const maxTimelineCost = Math.max(...timeline.map((t) => t.cost), 0.0001);

  return (
    <div className="space-y-8 animate-in fade-in">
      {/* ============================================================ */}
      {/* Header                                                        */}
      {/* ============================================================ */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-gradient-to-tr from-amber-500/20 to-orange-500/20 border border-amber-500/30">
              <BarChart3 className="w-6 h-6 text-amber-400" />
            </div>
            Cost Analytics
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Detailed AI processing cost breakdown across all operations
          </p>
        </div>
        <button
          onClick={() => fetchData(true)}
          disabled={refreshing}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800/80 border border-slate-700 text-slate-300 text-xs font-medium hover:bg-slate-700/80 transition-all disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      {/* ============================================================ */}
      {/* KPI Summary Cards                                             */}
      {/* ============================================================ */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        <KpiCard
          label="Total Spend"
          value={formatCost(summary.totalCost)}
          sublabel="All operations"
          icon={DollarSign}
          color="amber"
        />
        <KpiCard
          label="Total Ops"
          value={summary.totalOperations.toString()}
          sublabel="API calls made"
          icon={Zap}
          color="blue"
        />
        <KpiCard
          label="Avg / Op"
          value={formatCost(summary.averageCostPerOperation)}
          sublabel="Per operation"
          icon={TrendingUp}
          color="emerald"
        />
        <KpiCard
          label="Input Tokens"
          value={formatTokens(summary.totalInputTokens)}
          sublabel="Prompt tokens"
          icon={ArrowUpRight}
          color="cyan"
        />
        <KpiCard
          label="Output Tokens"
          value={formatTokens(summary.totalOutputTokens)}
          sublabel="Completion tokens"
          icon={ArrowDownRight}
          color="purple"
        />
        <KpiCard
          label="Processing"
          value={formatMs(summary.totalProcessingTimeMs)}
          sublabel="Total AI time"
          icon={Clock}
          color="rose"
        />
      </div>

      {/* ============================================================ */}
      {/* Middle Row: Timeline + Distribution Ring                       */}
      {/* ============================================================ */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Timeline Chart */}
        <div className="lg:col-span-3 glass-panel p-6 rounded-2xl border border-slate-800 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white flex items-center gap-2">
              <Activity className="w-4 h-4 text-blue-400" />
              Cost Timeline (Hourly)
            </h2>
            <span className="text-[11px] text-slate-500 font-mono">
              {timeline.length} bucket{timeline.length !== 1 ? 's' : ''}
            </span>
          </div>
          <MiniBarChart data={timeline} maxVal={maxTimelineCost} />
          {timeline.length > 0 && (
            <div className="flex items-center justify-between text-[10px] text-slate-500 font-mono px-1">
              <span>{timeline[0]?.hour}</span>
              <span>{timeline[timeline.length - 1]?.hour}</span>
            </div>
          )}
        </div>

        {/* Distribution Ring */}
        <div className="lg:col-span-2 glass-panel p-6 rounded-2xl border border-slate-800 space-y-4">
          <h2 className="text-sm font-semibold text-white flex items-center gap-2">
            <Layers className="w-4 h-4 text-purple-400" />
            Cost by Operation Type
          </h2>
          <CostDistributionRing entries={perRequestType} total={summary.totalCost} />
        </div>
      </div>

      {/* ============================================================ */}
      {/* Per-Video Breakdown Table                                     */}
      {/* ============================================================ */}
      <div className="glass-panel rounded-2xl border border-slate-800 overflow-hidden">
        <div className="p-5 border-b border-slate-800/60 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-white flex items-center gap-2">
            <Film className="w-4 h-4 text-blue-400" />
            Cost by Video
          </h2>
          <span className="text-[11px] text-slate-500">{perVideo.length} video{perVideo.length !== 1 ? 's' : ''}</span>
        </div>

        {perVideo.length === 0 ? (
          <div className="p-10 text-center text-xs text-slate-500">
            No video cost data recorded yet. Process a video to see cost breakdowns.
          </div>
        ) : (
          <div className="divide-y divide-slate-800/50">
            {perVideo.map((v) => {
              const isExpanded = expandedVideo === v.videoId;
              const costPct = summary.totalCost > 0 ? ((v.totalCost / summary.totalCost) * 100).toFixed(1) : '0';
              return (
                <div key={v.videoId}>
                  <button
                    onClick={() => setExpandedVideo(isExpanded ? null : v.videoId)}
                    className="w-full text-left px-5 py-4 flex items-center gap-4 hover:bg-slate-800/30 transition-colors group"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-slate-200 truncate">{v.videoName}</span>
                        <span className="text-[10px] text-slate-500 font-mono shrink-0">{v.operationCount} ops</span>
                      </div>
                      <div className="mt-1.5 w-full bg-slate-800/80 h-1.5 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-blue-500 to-cyan-400 transition-all"
                          style={{ width: `${Math.min(parseFloat(costPct), 100)}%` }}
                        />
                      </div>
                    </div>
                    <div className="text-right shrink-0 space-y-0.5">
                      <div className="text-sm font-mono font-bold text-white">{formatCost(v.totalCost)}</div>
                      <div className="text-[10px] text-slate-400 font-mono">{costPct}%</div>
                    </div>
                    {isExpanded ? (
                      <ChevronUp className="w-4 h-4 text-slate-500 shrink-0" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-slate-500 shrink-0" />
                    )}
                  </button>

                  {isExpanded && (
                    <div className="px-5 pb-4 pt-1 space-y-3 bg-slate-900/40 animate-in fade-in slide-in-from-top-1">
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/60">
                          <div className="text-[10px] text-slate-500 uppercase tracking-wider">Input Tokens</div>
                          <div className="text-sm font-mono font-semibold text-slate-200 mt-0.5">{formatTokens(v.inputTokens)}</div>
                        </div>
                        <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/60">
                          <div className="text-[10px] text-slate-500 uppercase tracking-wider">Output Tokens</div>
                          <div className="text-sm font-mono font-semibold text-slate-200 mt-0.5">{formatTokens(v.outputTokens)}</div>
                        </div>
                        <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/60">
                          <div className="text-[10px] text-slate-500 uppercase tracking-wider">Processing</div>
                          <div className="text-sm font-mono font-semibold text-slate-200 mt-0.5">{formatMs(v.processingTimeMs)}</div>
                        </div>
                        <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/60">
                          <div className="text-[10px] text-slate-500 uppercase tracking-wider">Avg / Op</div>
                          <div className="text-sm font-mono font-semibold text-slate-200 mt-0.5">
                            {formatCost(v.operationCount > 0 ? v.totalCost / v.operationCount : 0)}
                          </div>
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        {Object.entries(v.byType).map(([type, data]) => {
                          const tc = typeColor(type);
                          return (
                            <div key={type} className="flex items-center gap-3 text-xs">
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-md ${tc.bg} ${tc.text} text-[10px] font-semibold w-32 justify-center`}>
                                {friendlyType(type)}
                              </span>
                              <div className="flex-1 bg-slate-800/60 h-1.5 rounded-full overflow-hidden">
                                <div
                                  className={`h-full rounded-full ${tc.bar} transition-all`}
                                  style={{ width: `${v.totalCost > 0 ? (data.cost / v.totalCost) * 100 : 0}%` }}
                                />
                              </div>
                              <span className="text-slate-400 font-mono w-16 text-right">{data.count}×</span>
                              <span className="text-slate-200 font-mono font-medium w-20 text-right">{formatCost(data.cost)}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ============================================================ */}
      {/* Per-Model Breakdown                                           */}
      {/* ============================================================ */}
      {perModel.length > 0 && (
        <div className="glass-panel rounded-2xl border border-slate-800 p-5 space-y-4">
          <h2 className="text-sm font-semibold text-white flex items-center gap-2">
            <Cpu className="w-4 h-4 text-cyan-400" />
            Cost by Model
          </h2>
          <div className="space-y-3">
            {perModel.map((m) => {
              const pct = summary.totalCost > 0 ? ((m.cost / summary.totalCost) * 100).toFixed(1) : '0';
              return (
                <div key={m.model} className="flex items-center gap-4">
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-slate-300 font-medium truncate">{m.model}</span>
                      <div className="flex items-center gap-3 text-[11px]">
                        <span className="text-slate-500 font-mono">{m.count} ops</span>
                        <span className="text-slate-300 font-mono font-semibold">{formatCost(m.cost)}</span>
                        <span className="text-slate-500 font-mono">{pct}%</span>
                      </div>
                    </div>
                    <div className="w-full bg-slate-800/60 h-2 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-blue-500 transition-all"
                        style={{ width: `${Math.min(parseFloat(pct), 100)}%` }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* Recent Operations Log                                         */}
      {/* ============================================================ */}
      <div className="glass-panel rounded-2xl border border-slate-800 overflow-hidden">
        <div className="p-5 border-b border-slate-800/60 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white flex items-center gap-2">
              <Zap className="w-4 h-4 text-amber-400" />
              Recent Operations
            </h2>
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-slate-400 font-mono">
                Showing {displayedOps.length} of {filteredOps.length}
              </span>
              {hasMore && (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20 font-medium">
                  Scroll to load more
                </span>
              )}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <div className="relative flex-1 min-w-[180px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
              <input
                type="text"
                value={opsFilter}
                onChange={(e) => setOpsFilter(e.target.value)}
                placeholder="Search operations..."
                className="w-full pl-9 pr-3 py-2 bg-slate-900/80 border border-slate-700 rounded-lg text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20"
              />
            </div>
            <select
              value={opsTypeFilter}
              onChange={(e) => setOpsTypeFilter(e.target.value)}
              className="px-3 py-2 bg-slate-900/80 border border-slate-700 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-blue-500/50 cursor-pointer"
            >
              <option value="ALL">All Types</option>
              <option value="SCENE_ANALYSIS">Scene Analysis</option>
              <option value="EMBEDDING">Embedding</option>
              <option value="TIMESTAMP_VERIFICATION">Timestamp Verify</option>
              <option value="RERANKING">Re-ranking</option>
            </select>
          </div>
        </div>

        {filteredOps.length === 0 ? (
          <div className="p-10 text-center text-xs text-slate-500">
            No operations recorded yet, or none match current filters.
          </div>
        ) : (
          <div
            ref={scrollContainerRef}
            onScroll={handleScroll}
            className="max-h-[480px] overflow-y-auto overflow-x-auto scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-slate-900/40 relative"
          >
            <table className="w-full text-xs">
              <thead className="sticky top-0 z-10 bg-[#0b101b]/98 backdrop-blur-md border-b border-slate-800 text-slate-400 uppercase tracking-wider text-[11px] shadow-sm">
                <tr>
                  <th className="text-left px-5 py-3 font-medium">Timestamp</th>
                  <th className="text-left px-5 py-3 font-medium">Video</th>
                  <th className="text-left px-5 py-3 font-medium">Type</th>
                  <th className="text-left px-5 py-3 font-medium">Model</th>
                  <th className="text-right px-5 py-3 font-medium">In Tokens</th>
                  <th className="text-right px-5 py-3 font-medium">Out Tokens</th>
                  <th className="text-right px-5 py-3 font-medium">Duration</th>
                  <th className="text-right px-5 py-3 font-medium">Cost</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/40">
                {displayedOps.map((op) => {
                  const tc = typeColor(op.requestType);
                  const date = new Date(op.createdAt);
                  return (
                    <tr key={op.id} className="hover:bg-slate-800/30 transition-colors">
                      <td className="px-5 py-3 text-slate-400 font-mono whitespace-nowrap">
                        {date.toLocaleDateString()} {date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </td>
                      <td className="px-5 py-3 text-slate-200 max-w-[160px] truncate" title={op.videoName}>{op.videoName}</td>
                      <td className="px-5 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-md ${tc.bg} ${tc.text} text-[10px] font-semibold`}>
                          {friendlyType(op.requestType)}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-slate-400 font-mono">{op.model}</td>
                      <td className="px-5 py-3 text-right text-slate-300 font-mono">{formatTokens(op.inputTokens)}</td>
                      <td className="px-5 py-3 text-right text-slate-300 font-mono">{formatTokens(op.outputTokens)}</td>
                      <td className="px-5 py-3 text-right text-slate-400 font-mono">{formatMs(op.processingTimeMs)}</td>
                      <td className="px-5 py-3 text-right text-white font-mono font-semibold">{formatCost(op.estimatedCost)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* Lazy Loading Status / Sentinel */}
            <div className="p-3.5 border-t border-slate-800/60 bg-slate-950/50 text-center text-xs flex items-center justify-center gap-2">
              {isLoadingMore ? (
                <span className="text-blue-400 flex items-center gap-2 font-medium animate-pulse">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin text-blue-400" />
                  <span>Loading more operations...</span>
                </span>
              ) : hasMore ? (
                <button
                  type="button"
                  onClick={loadMore}
                  className="px-3.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <span>Scroll or click to load more</span>
                  <span className="text-slate-500 font-mono">({filteredOps.length - displayedOps.length} remaining)</span>
                </button>
              ) : filteredOps.length > 20 ? (
                <span className="text-slate-500 text-[11px]">
                  All {filteredOps.length} operations loaded
                </span>
              ) : null}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Small KPI Card                                                      */
/* ------------------------------------------------------------------ */
function KpiCard({
  label,
  value,
  sublabel,
  icon: Icon,
  color,
}: {
  label: string;
  value: string;
  sublabel: string;
  icon: React.ElementType;
  color: string;
}) {
  const colorMap: Record<string, string> = {
    amber: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    blue: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    emerald: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    cyan: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
    purple: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
    rose: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
  };
  const c = colorMap[color] || colorMap.blue;

  return (
    <div className="glass-panel p-4 rounded-2xl border border-slate-800 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">{label}</span>
        <div className={`p-1.5 rounded-lg border ${c}`}>
          <Icon className="w-3.5 h-3.5" />
        </div>
      </div>
      <div className="text-xl font-bold text-white font-mono">{value}</div>
      <p className="text-[10px] text-slate-500">{sublabel}</p>
    </div>
  );
}

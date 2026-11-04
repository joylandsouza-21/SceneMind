'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  Wallet,
  Film,
  Search,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Download,
  Clapperboard,
  Sparkles,
  Clock,
  Info,
  ListChecks,
  Wrench,
  Layers,
  History,
} from 'lucide-react';

/* ------------------------------------------------------------------ */
/* Types (mirror /api/costs/analytics)                                 */
/* ------------------------------------------------------------------ */
interface Step { key: string; label: string; cost: number; count: number }

interface VideoRow {
  videoId: string;
  videoName: string;
  groupName?: string;
  durationSec: number;
  status: string;
  uploadedAt?: string;
  deleted: boolean;
  processingCost: number;
  processingSteps: Step[];
  searchCost: number;
  sharedSearchCost: number;
  timestampCheckCost: number;
  timestampCheckCount: number;
  searchCount: number;
  totalCost: number;
  costPerMinute: number;
  searches: { searchId: string; query: string; createdAt: string; searchCost: number; shareCost: number; sharedWith: number; matchedByTime: boolean }[];
}

interface SearchRow {
  searchId: string;
  query: string;
  name?: string;
  createdAt: string;
  cost: number;
  aiCalls: number;
  steps: Step[];
  videos: { videoId: string; videoName: string }[];
  scope: string;
  saved: boolean;
  matchedByTime: boolean;
}

interface ActivityRow {
  id: string;
  createdAt: string;
  category: 'processing' | 'search';
  activity: string;
  subject: string;
  cost: number;
  model: string;
  inputTokens: number;
  outputTokens: number;
  processingTimeMs: number;
}

interface AnalyticsData {
  range: string;
  summary: {
    totalCost: number;
    processingCost: number;
    searchCost: number;
    videoCount: number;
    searchCount: number;
    avgCostPerVideo: number;
    avgCostPerSearch: number;
    totalAiCalls: number;
    totalTokens: number;
    totalProcessingTimeMs: number;
    searchesWithoutVideoCost: number;
    searchesWithoutVideoCount: number;
    unattributedCost: number;
    legacySearchLogs: number;
  };
  videos: VideoRow[];
  searches: SearchRow[];
  timeline: { label: string; processing: number; search: number }[];
  perModel: { model: string; count: number; cost: number; inputTokens: number; outputTokens: number }[];
  activity: ActivityRow[];
  totalLogCount: number;
}

type Range = 'all' | '30d' | '7d' | 'today';
type Tab = 'videos' | 'searches' | 'activity';

/* ------------------------------------------------------------------ */
/* Formatting helpers                                                  */
/* ------------------------------------------------------------------ */
function money(n: number): string {
  if (!n) return '$0.00';
  if (n >= 1) return `$${n.toFixed(2)}`;
  if (n >= 0.01) return `$${n.toFixed(3)}`;
  return `$${n.toPrecision(2)}`;
}

function duration(sec: number): string {
  if (!sec) return '—';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  if (h) return `${h}h ${m}m`;
  if (m) return `${m}m ${s}s`;
  return `${s}s`;
}

function shortDate(iso?: string): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.round(diff / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr} hr ago`;
  const d = Math.round(hr / 24);
  if (d < 7) return `${d} day${d > 1 ? 's' : ''} ago`;
  return shortDate(iso);
}

function compact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function pct(part: number, whole: number): number {
  return whole > 0 ? Math.min(100, (part / whole) * 100) : 0;
}

function downloadCsv(filename: string, rows: (string | number)[][]) {
  const csv = rows
    .map((r) => r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const RANGE_LABELS: Record<Range, string> = { all: 'All time', '30d': 'Last 30 days', '7d': 'Last 7 days', today: 'Today' };
const PAGE = 15;

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */
export default function AnalyticsPage() {
  const [range, setRange] = useState<Range>('all');
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('videos');

  const fetchData = async (spinner = true) => {
    if (spinner) setRefreshing(true);
    try {
      const res = await fetch(`/api/costs/analytics?range=${range}`);
      if (!res.ok) throw new Error('Could not load spending data');
      setData(await res.json());
      setError(null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchData(!loading);
    const id = setInterval(() => fetchData(false), 30000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-2 border-amber-500/30 border-t-amber-400 rounded-full animate-spin" />
          <span className="text-sm text-slate-400">Loading your spending overview…</span>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="p-8 rounded-2xl bg-red-950/30 border border-red-500/30 text-center space-y-3">
          <p className="text-red-400 font-medium">Couldn&apos;t load spending data</p>
          <p className="text-xs text-slate-400">{error}</p>
          <button
            id="analytics-retry"
            onClick={() => { setLoading(true); fetchData(); }}
            className="px-4 py-2 bg-red-600/20 border border-red-500/40 rounded-lg text-red-300 text-xs hover:bg-red-600/30 transition-colors"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  const { summary } = data;

  const exportCsv = () => {
    if (tab === 'searches') {
      downloadCsv(`search-costs-${range}.csv`, [
        ['Search', 'Date', 'Scope', 'Videos found', 'Cost (USD)'],
        ...data.searches.map((s) => [s.name || s.query, shortDate(s.createdAt), s.scope, s.videos.map((v) => v.videoName).join('; '), s.cost]),
      ]);
    } else {
      downloadCsv(`video-costs-${range}.csv`, [
        ['Video', 'Group', 'Length', 'Processing (USD)', 'Searches', 'Search share (USD)', 'Total (USD)'],
        ...data.videos.map((v) => [v.videoName, v.groupName || '', duration(v.durationSec), v.processingCost, v.searchCount, v.searchCost, v.totalCost]),
      ]);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in">
      {/* ===================== Header ===================== */}
      <header className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white flex items-center gap-3">
            <span className="p-2.5 rounded-xl bg-gradient-to-tr from-amber-500/25 to-orange-500/20 border border-amber-500/30">
              <Wallet className="w-6 h-6 text-amber-400" />
            </span>
            Spending Overview
          </h1>
          <p className="text-sm text-slate-400 mt-1.5">
            How much each video and each search has cost.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex p-1 rounded-xl bg-slate-900/80 border border-slate-800" role="tablist" aria-label="Time range">
            {(Object.keys(RANGE_LABELS) as Range[]).map((r) => (
              <button
                key={r}
                id={`range-${r}`}
                onClick={() => setRange(r)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  range === r ? 'bg-amber-500/20 text-amber-300 shadow-inner' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {RANGE_LABELS[r]}
              </button>
            ))}
          </div>
          <button
            id="analytics-export"
            onClick={exportCsv}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-800/80 border border-slate-700 text-slate-300 text-xs font-medium hover:bg-slate-700/80 transition-all"
          >
            <Download className="w-3.5 h-3.5" /> Export
          </button>
          <button
            id="analytics-refresh"
            onClick={() => fetchData(true)}
            disabled={refreshing}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-800/80 border border-slate-700 text-slate-300 text-xs font-medium hover:bg-slate-700/80 transition-all disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </div>
      </header>

      {/* ===================== Headline numbers ===================== */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="relative overflow-hidden rounded-2xl p-6 border border-amber-500/25 bg-gradient-to-br from-amber-500/15 via-slate-900/80 to-slate-900/90">
          <div className="absolute -right-10 -top-10 w-40 h-40 rounded-full bg-amber-400/10 blur-3xl" />
          <div className="text-xs font-medium text-amber-200/80 uppercase tracking-wider">Total spent · {RANGE_LABELS[range]}</div>
          <div className="text-4xl font-extrabold text-white mt-2 tracking-tight">{money(summary.totalCost)}</div>
          <div className="mt-5 h-2.5 w-full rounded-full bg-slate-800 overflow-hidden flex">
            <div className="h-full bg-gradient-to-r from-sky-500 to-blue-500 transition-all duration-700" style={{ width: `${pct(summary.processingCost, summary.totalCost)}%` }} />
            <div className="h-full bg-gradient-to-r from-amber-400 to-orange-500 transition-all duration-700" style={{ width: `${pct(summary.searchCost, summary.totalCost)}%` }} />
          </div>
          <div className="mt-3 flex items-center justify-between text-xs">
            <span className="flex items-center gap-1.5 text-slate-300"><span className="w-2 h-2 rounded-full bg-sky-400" />Video processing {Math.round(pct(summary.processingCost, summary.totalCost))}%</span>
            <span className="flex items-center gap-1.5 text-slate-300"><span className="w-2 h-2 rounded-full bg-amber-400" />Searches {Math.round(pct(summary.searchCost, summary.totalCost))}%</span>
          </div>
        </div>

        <div className="lg:col-span-2 grid grid-cols-2 gap-4">
          <StatCard
            icon={Clapperboard}
            tone="sky"
            label="Video processing"
            value={money(summary.processingCost)}
            hint={`${summary.videoCount} video${summary.videoCount === 1 ? '' : 's'} · avg ${money(summary.avgCostPerVideo)} each`}
          />
          <StatCard
            icon={Search}
            tone="amber"
            label="Searches"
            value={money(summary.searchCost)}
            hint={`${summary.searchCount} search${summary.searchCount === 1 ? '' : 'es'} · avg ${money(summary.avgCostPerSearch)} each`}
          />
          <StatCard
            icon={Film}
            tone="violet"
            label="Most expensive video"
            value={data.videos[0] ? money(data.videos[0].totalCost) : '—'}
            hint={data.videos[0]?.videoName || 'No videos yet'}
          />
          <StatCard
            icon={Sparkles}
            tone="emerald"
            label="Most expensive search"
            value={data.searches.length ? money(Math.max(...data.searches.map((s) => s.cost))) : '—'}
            hint={
              data.searches.length
                ? [...data.searches].sort((a, b) => b.cost - a.cost)[0].name || [...data.searches].sort((a, b) => b.cost - a.cost)[0].query
                : 'No searches yet'
            }
          />
        </div>
      </section>

      {/* ===================== Trend + where the money goes ===================== */}
      <section className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <div className="lg:col-span-3 glass-panel rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white flex items-center gap-2">
              <History className="w-4 h-4 text-sky-400" /> Spending over time
            </h2>
            <div className="flex items-center gap-3 text-[11px] text-slate-400">
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm bg-sky-500" />Processing</span>
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm bg-amber-400" />Searches</span>
            </div>
          </div>
          <TrendChart data={data.timeline} hourly={range === 'today'} />
        </div>

        <div className="lg:col-span-2 glass-panel rounded-2xl p-6 space-y-4">
          <h2 className="text-sm font-semibold text-white flex items-center gap-2">
            <Layers className="w-4 h-4 text-violet-400" /> What the money is spent on
          </h2>
          <WhereMoneyGoes data={data} />
        </div>
      </section>

      {/* ===================== Tabs ===================== */}
      <section className="glass-panel rounded-2xl overflow-hidden">
        <div className="px-5 pt-4 border-b border-slate-800/70 flex flex-wrap gap-1">
          <TabButton id="tab-videos" active={tab === 'videos'} onClick={() => setTab('videos')} icon={Film} label="By video" count={data.videos.length} />
          <TabButton id="tab-searches" active={tab === 'searches'} onClick={() => setTab('searches')} icon={Search} label="By search" count={data.searches.length} />
          <TabButton id="tab-activity" active={tab === 'activity'} onClick={() => setTab('activity')} icon={ListChecks} label="Activity log" count={data.totalLogCount} />
        </div>

        {tab === 'videos' && <VideosTab videos={data.videos} />}
        {tab === 'searches' && <SearchesTab searches={data.searches} />}
        {tab === 'activity' && <ActivityTab data={data} />}
      </section>

      {/* ===================== How it's calculated ===================== */}
      <section className="rounded-2xl border border-slate-800 bg-slate-900/40 p-5 text-xs text-slate-400 space-y-2">
        <div className="flex items-center gap-2 text-slate-300 font-medium">
          <Info className="w-4 h-4 text-sky-400" /> How these numbers are worked out
        </div>
        <ul className="list-disc pl-5 space-y-1">
          <li><span className="text-slate-300">Video processing</span> is the one-time cost of watching, describing and indexing a video.</li>
          <li><span className="text-slate-300">A search&apos;s cost</span> is split equally between the videos it found clips in. A search limited to one video is charged entirely to that video.</li>
          <li>Searches run before detailed tracking was added were linked to saved searches by their time. These are marked <span className="text-sky-300">&quot;estimated&quot;</span>.</li>
          {summary.searchesWithoutVideoCount > 0 && (
            <li>
              {summary.searchesWithoutVideoCount} search{summary.searchesWithoutVideoCount === 1 ? '' : 'es'} ({money(summary.searchesWithoutVideoCost)}) found no matching video, so {summary.searchesWithoutVideoCount === 1 ? 'it is' : 'they are'} only counted in the search totals.
            </li>
          )}
          <li>All amounts are estimates based on the AI provider&apos;s published prices.</li>
        </ul>
      </section>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Headline stat card                                                  */
/* ------------------------------------------------------------------ */
const TONES: Record<string, string> = {
  sky: 'from-sky-500/15 text-sky-300 border-sky-500/25',
  amber: 'from-amber-500/15 text-amber-300 border-amber-500/25',
  violet: 'from-violet-500/15 text-violet-300 border-violet-500/25',
  emerald: 'from-emerald-500/15 text-emerald-300 border-emerald-500/25',
};

function StatCard({ icon: Icon, tone, label, value, hint }: { icon: React.ElementType; tone: string; label: string; value: string; hint: string }) {
  return (
    <div className="glass-panel glass-panel-hover rounded-2xl p-5 flex flex-col gap-3 min-w-0">
      <div className="flex items-center gap-2.5">
        <span className={`p-2 rounded-xl border bg-gradient-to-br to-transparent ${TONES[tone]}`}>
          <Icon className="w-4 h-4" />
        </span>
        <span className="text-xs font-medium text-slate-400">{label}</span>
      </div>
      <div className="text-2xl font-bold text-white tracking-tight">{value}</div>
      <div className="text-[11px] text-slate-500 truncate" title={hint}>{hint}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Stacked trend chart                                                 */
/* ------------------------------------------------------------------ */
function TrendChart({ data, hourly }: { data: AnalyticsData['timeline']; hourly: boolean }) {
  if (data.length === 0) {
    return <div className="h-40 flex items-center justify-center text-xs text-slate-500">No spending in this period</div>;
  }
  const max = Math.max(...data.map((d) => d.processing + d.search), 0.000001);
  const fmt = (l: string) => (hourly ? l : new Date(l + 'T00:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short' }));
  return (
    <div>
      <div className="flex items-end gap-1 h-40">
        {data.map((d) => {
          const total = d.processing + d.search;
          return (
            <div key={d.label} className="flex-1 min-w-[4px] max-w-[28px] h-full flex flex-col justify-end group relative">
              <div className="w-full rounded-t-md overflow-hidden flex flex-col-reverse transition-all group-hover:brightness-125" style={{ height: `${Math.max(pct(total, max), 2)}%` }}>
                <div className="bg-sky-500/90" style={{ height: `${pct(d.processing, total)}%` }} />
                <div className="bg-amber-400/90" style={{ height: `${pct(d.search, total)}%` }} />
              </div>
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-30 whitespace-nowrap">
                <div className="px-3 py-2 text-[11px] bg-slate-950 border border-slate-700 rounded-lg shadow-xl text-slate-200 space-y-0.5">
                  <div className="font-semibold">{fmt(d.label)} · {money(total)}</div>
                  <div className="text-sky-300">Processing {money(d.processing)}</div>
                  <div className="text-amber-300">Searches {money(d.search)}</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex justify-between text-[10px] text-slate-500 mt-2 px-0.5">
        <span>{fmt(data[0].label)}</span>
        {data.length > 1 && <span>{fmt(data[data.length - 1].label)}</span>}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Where the money goes (friendly step breakdown)                      */
/* ------------------------------------------------------------------ */
function WhereMoneyGoes({ data }: { data: AnalyticsData }) {
  const rows = useMemo(() => {
    const map = new Map<string, { label: string; cost: number; kind: 'processing' | 'search' }>();
    const add = (s: Step, kind: 'processing' | 'search') => {
      const r = map.get(s.key) || { label: s.label, cost: 0, kind };
      r.cost += s.cost;
      map.set(s.key, r);
    };
    data.videos.forEach((v) => v.processingSteps.forEach((s) => add(s, 'processing')));
    data.searches.forEach((s) => s.steps.forEach((st) => add(st, 'search')));
    const tsCost = data.videos.reduce((sum, v) => sum + v.timestampCheckCost, 0);
    if (tsCost > 0) map.set('TIMESTAMP_VERIFICATION', { label: 'Checking clip timings', cost: tsCost, kind: 'search' });
    return Array.from(map.values()).sort((a, b) => b.cost - a.cost);
  }, [data]);

  const total = rows.reduce((s, r) => s + r.cost, 0);
  if (rows.length === 0) return <div className="h-40 flex items-center justify-center text-xs text-slate-500">Nothing to show yet</div>;

  return (
    <div className="space-y-3">
      {rows.map((r) => (
        <div key={r.label} className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-300 flex items-center gap-2">
              <span className={`w-1.5 h-1.5 rounded-full ${r.kind === 'processing' ? 'bg-sky-400' : 'bg-amber-400'}`} />
              {r.label}
            </span>
            <span className="text-slate-200 font-medium">{money(r.cost)}</span>
          </div>
          <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-700 ${r.kind === 'processing' ? 'bg-gradient-to-r from-sky-500 to-blue-500' : 'bg-gradient-to-r from-amber-400 to-orange-500'}`}
              style={{ width: `${pct(r.cost, total)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Tabs                                                                */
/* ------------------------------------------------------------------ */
function TabButton({ id, active, onClick, icon: Icon, label, count }: { id: string; active: boolean; onClick: () => void; icon: React.ElementType; label: string; count: number }) {
  return (
    <button
      id={id}
      onClick={onClick}
      className={`relative flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors ${active ? 'text-white' : 'text-slate-400 hover:text-slate-200'}`}
    >
      <Icon className="w-4 h-4" />
      {label}
      <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${active ? 'bg-amber-500/20 text-amber-300' : 'bg-slate-800 text-slate-500'}`}>{compact(count)}</span>
      {active && <span className="absolute left-2 right-2 -bottom-px h-0.5 rounded-full bg-gradient-to-r from-amber-400 to-orange-500" />}
    </button>
  );
}

function Toolbar({ value, onChange, placeholder, children, id }: { value: string; onChange: (v: string) => void; placeholder: string; children?: React.ReactNode; id: string }) {
  return (
    <div className="p-4 flex flex-wrap gap-2 border-b border-slate-800/60">
      <div className="relative flex-1 min-w-[200px]">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
        <input
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full pl-9 pr-3 py-2 bg-slate-900/80 border border-slate-700 rounded-lg text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/20"
        />
      </div>
      {children}
    </div>
  );
}

function ShowMore({ shown, total, onMore }: { shown: number; total: number; onMore: () => void }) {
  if (total <= shown) return null;
  return (
    <div className="p-3 text-center border-t border-slate-800/60">
      <button onClick={onMore} className="px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 transition-colors">
        Show more <span className="text-slate-500">({total - shown} more)</span>
      </button>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="p-12 text-center text-xs text-slate-500">{text}</div>;
}

/* ---------------------------- By video ---------------------------- */
function VideosTab({ videos }: { videos: VideoRow[] }) {
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<'cost' | 'searches' | 'newest' | 'name'>('cost');
  const [open, setOpen] = useState<string | null>(null);
  const [shown, setShown] = useState(PAGE);

  const rows = useMemo(() => {
    let r = videos;
    if (q.trim()) {
      const s = q.toLowerCase();
      r = r.filter((v) => v.videoName.toLowerCase().includes(s) || (v.groupName || '').toLowerCase().includes(s));
    }
    const sorted = [...r];
    if (sort === 'searches') sorted.sort((a, b) => b.searchCount - a.searchCount);
    else if (sort === 'newest') sorted.sort((a, b) => new Date(b.uploadedAt || 0).getTime() - new Date(a.uploadedAt || 0).getTime());
    else if (sort === 'name') sorted.sort((a, b) => a.videoName.localeCompare(b.videoName));
    else sorted.sort((a, b) => b.totalCost - a.totalCost);
    return sorted;
  }, [videos, q, sort]);

  const maxTotal = Math.max(...videos.map((v) => v.totalCost), 0.000001);

  return (
    <div>
      <Toolbar id="videos-filter" value={q} onChange={(v) => { setQ(v); setShown(PAGE); }} placeholder="Find a video or group…">
        <select
          id="videos-sort"
          value={sort}
          onChange={(e) => setSort(e.target.value as any)}
          className="px-3 py-2 bg-slate-900/80 border border-slate-700 rounded-lg text-xs text-slate-200 focus:outline-none cursor-pointer"
        >
          <option value="cost">Highest cost first</option>
          <option value="searches">Most searched</option>
          <option value="newest">Newest uploads</option>
          <option value="name">Name (A–Z)</option>
        </select>
      </Toolbar>

      {rows.length === 0 ? (
        <Empty text="No videos match. Costs show up here once a video has been processed or searched." />
      ) : (
        <>
          <div className="hidden md:grid grid-cols-[minmax(0,1fr)_120px_140px_120px_24px] gap-4 px-5 py-2.5 text-[11px] uppercase tracking-wider text-slate-500 border-b border-slate-800/60">
            <span>Video</span>
            <span className="text-right">Processing</span>
            <span className="text-right">Searches</span>
            <span className="text-right">Total</span>
            <span />
          </div>
          <div className="divide-y divide-slate-800/50">
            {rows.slice(0, shown).map((v) => {
              const isOpen = open === v.videoId;
              return (
                <div key={v.videoId}>
                  <button
                    id={`video-row-${v.videoId}`}
                    onClick={() => setOpen(isOpen ? null : v.videoId)}
                    className="w-full text-left px-5 py-4 grid grid-cols-[minmax(0,1fr)_auto] md:grid-cols-[minmax(0,1fr)_120px_140px_120px_24px] gap-x-4 gap-y-1 items-center hover:bg-slate-800/30 transition-colors"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <Film className={`w-4 h-4 shrink-0 ${v.deleted ? 'text-slate-600' : 'text-sky-400'}`} />
                        <span className={`text-sm font-medium truncate ${v.deleted ? 'text-slate-500 italic' : 'text-slate-100'}`}>{v.videoName}</span>
                        {v.groupName && <span className="hidden sm:inline text-[10px] px-2 py-0.5 rounded-full bg-violet-500/10 text-violet-300 border border-violet-500/20 shrink-0">{v.groupName}</span>}
                      </div>
                      <div className="text-[11px] text-slate-500 mt-1 pl-6">
                        {duration(v.durationSec)} long · added {shortDate(v.uploadedAt)}
                      </div>
                      <div className="mt-2 ml-6 h-1.5 rounded-full bg-slate-800 overflow-hidden flex max-w-md" style={{ width: `${Math.max(pct(v.totalCost, maxTotal), 4)}%` }}>
                        <div className="h-full bg-sky-500" style={{ width: `${pct(v.processingCost, v.totalCost)}%` }} />
                        <div className="h-full bg-amber-400" style={{ width: `${pct(v.searchCost, v.totalCost)}%` }} />
                      </div>
                    </div>
                    <div className="hidden md:block text-right text-sm text-slate-300">{money(v.processingCost)}</div>
                    <div className="hidden md:block text-right">
                      <div className="text-sm text-slate-300">{money(v.searchCost)}</div>
                      <div className="text-[11px] text-slate-500">{v.searchCount} search{v.searchCount === 1 ? '' : 'es'}</div>
                    </div>
                    <div className="text-right text-base font-bold text-white">{money(v.totalCost)}</div>
                    <span className="hidden md:block">{isOpen ? <ChevronUp className="w-4 h-4 text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}</span>
                  </button>

                  {isOpen && (
                    <div className="px-5 pb-5 pt-1 grid grid-cols-1 lg:grid-cols-2 gap-4 bg-slate-950/30 animate-in fade-in slide-in-from-top-1">
                      {/* Processing */}
                      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <h3 className="text-xs font-semibold text-sky-300 flex items-center gap-2"><Clapperboard className="w-3.5 h-3.5" /> Processing this video</h3>
                          <span className="text-sm font-bold text-white">{money(v.processingCost)}</span>
                        </div>
                        {v.processingSteps.length === 0 ? (
                          <p className="text-[11px] text-slate-500">No processing cost recorded in this period.</p>
                        ) : (
                          <>
                            {v.processingSteps.map((s) => (
                              <div key={s.key} className="flex items-center justify-between text-xs">
                                <span className="text-slate-400">{s.label}</span>
                                <span className="text-slate-200">{money(s.cost)}</span>
                              </div>
                            ))}
                            {v.costPerMinute > 0 && (
                              <div className="pt-2 border-t border-slate-800 text-[11px] text-slate-500 flex items-center gap-1.5">
                                <Clock className="w-3 h-3" /> About {money(v.costPerMinute)} per minute of video
                              </div>
                            )}
                          </>
                        )}
                      </div>

                      {/* Searches */}
                      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <h3 className="text-xs font-semibold text-amber-300 flex items-center gap-2"><Search className="w-3.5 h-3.5" /> Searches that found this video</h3>
                          <span className="text-sm font-bold text-white">{money(v.searchCost)}</span>
                        </div>
                        {v.searches.length === 0 && v.timestampCheckCount === 0 ? (
                          <p className="text-[11px] text-slate-500">No searches have returned clips from this video yet.</p>
                        ) : (
                          <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                            {v.searches.map((s) => (
                              <div key={s.searchId} className="flex items-start justify-between gap-3 text-xs">
                                <div className="min-w-0">
                                  <div className="text-slate-300 line-clamp-1" title={s.query}>{s.query}</div>
                                  <div className="text-[10px] text-slate-500 mt-0.5">
                                    {relTime(s.createdAt)}
                                    {s.sharedWith > 1 && <> · shared by {s.sharedWith} videos (search total {money(s.searchCost)})</>}
                                    {s.matchedByTime && <span className="ml-1.5 text-sky-400">estimated</span>}
                                  </div>
                                </div>
                                <span className="text-slate-200 shrink-0">{money(s.shareCost)}</span>
                              </div>
                            ))}
                            {v.timestampCheckCount > 0 && (
                              <div className="flex items-center justify-between text-xs pt-2 border-t border-slate-800">
                                <span className="text-slate-400">Clip timing checks ({v.timestampCheckCount})</span>
                                <span className="text-slate-200">{money(v.timestampCheckCost)}</span>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <ShowMore shown={shown} total={rows.length} onMore={() => setShown((s) => s + PAGE)} />
        </>
      )}
    </div>
  );
}

/* ---------------------------- By search ---------------------------- */
function SearchesTab({ searches }: { searches: SearchRow[] }) {
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<'newest' | 'cost'>('newest');
  const [open, setOpen] = useState<string | null>(null);
  const [shown, setShown] = useState(PAGE);

  const rows = useMemo(() => {
    let r = searches;
    if (q.trim()) {
      const s = q.toLowerCase();
      r = r.filter((x) => x.query.toLowerCase().includes(s) || (x.name || '').toLowerCase().includes(s) || x.videos.some((v) => v.videoName.toLowerCase().includes(s)));
    }
    return sort === 'cost' ? [...r].sort((a, b) => b.cost - a.cost) : r;
  }, [searches, q, sort]);

  return (
    <div>
      <Toolbar id="searches-filter" value={q} onChange={(v) => { setQ(v); setShown(PAGE); }} placeholder="Find a search by text or video…">
        <select
          id="searches-sort"
          value={sort}
          onChange={(e) => setSort(e.target.value as any)}
          className="px-3 py-2 bg-slate-900/80 border border-slate-700 rounded-lg text-xs text-slate-200 focus:outline-none cursor-pointer"
        >
          <option value="newest">Newest first</option>
          <option value="cost">Highest cost first</option>
        </select>
      </Toolbar>

      {rows.length === 0 ? (
        <Empty text="No searches in this period." />
      ) : (
        <>
          <div className="divide-y divide-slate-800/50">
            {rows.slice(0, shown).map((s) => {
              const isOpen = open === s.searchId;
              return (
                <div key={s.searchId}>
                  <button
                    id={`search-row-${s.searchId}`}
                    onClick={() => setOpen(isOpen ? null : s.searchId)}
                    className="w-full text-left px-5 py-4 flex items-start gap-4 hover:bg-slate-800/30 transition-colors"
                  >
                    <span className="mt-0.5 p-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20 shrink-0">
                      <Search className="w-3.5 h-3.5 text-amber-300" />
                    </span>
                    <div className="flex-1 min-w-0">
                      {s.name && <div className="text-xs font-semibold text-amber-200 mb-0.5">{s.name}</div>}
                      <div className={`text-sm line-clamp-2 ${s.saved ? 'text-slate-100' : 'text-slate-400 italic'}`}>{s.query}</div>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 text-[11px] text-slate-500">
                        <span>{relTime(s.createdAt)}</span>
                        <span>{s.scope}</span>
                        <span>{s.videos.length ? `Found clips in ${s.videos.length} video${s.videos.length === 1 ? '' : 's'}` : 'No matching videos'}</span>
                        {s.matchedByTime && <span className="px-1.5 py-0.5 rounded bg-sky-500/10 text-sky-300 border border-sky-500/20">estimated</span>}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-base font-bold text-white">{money(s.cost)}</div>
                    </div>
                    {isOpen ? <ChevronUp className="w-4 h-4 text-slate-500 mt-1" /> : <ChevronDown className="w-4 h-4 text-slate-500 mt-1" />}
                  </button>

                  {isOpen && (
                    <div className="px-5 pb-5 pt-1 grid grid-cols-1 lg:grid-cols-2 gap-4 bg-slate-950/30 animate-in fade-in slide-in-from-top-1">
                      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 space-y-2.5">
                        <h3 className="text-xs font-semibold text-amber-300">Where this search&apos;s cost went</h3>
                        {s.steps.map((st) => (
                          <div key={st.key} className="space-y-1">
                            <div className="flex justify-between text-xs">
                              <span className="text-slate-400">{st.label}</span>
                              <span className="text-slate-200">{money(st.cost)}</span>
                            </div>
                            <div className="h-1 rounded-full bg-slate-800 overflow-hidden">
                              <div className="h-full bg-gradient-to-r from-amber-400 to-orange-500" style={{ width: `${pct(st.cost, s.cost)}%` }} />
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 space-y-2.5">
                        <h3 className="text-xs font-semibold text-sky-300">Cost charged to each video</h3>
                        {s.videos.length === 0 ? (
                          <p className="text-[11px] text-slate-500">This search didn&apos;t return clips from any video.</p>
                        ) : (
                          <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                            {s.videos.map((v) => (
                              <div key={v.videoId} className="flex items-center justify-between text-xs gap-3">
                                <span className="text-slate-300 truncate flex items-center gap-2"><Film className="w-3 h-3 text-sky-400 shrink-0" />{v.videoName}</span>
                                <span className="text-slate-200 shrink-0">{money(s.cost / s.videos.length)}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <ShowMore shown={shown} total={rows.length} onMore={() => setShown((x) => x + PAGE)} />
        </>
      )}
    </div>
  );
}

/* ---------------------------- Activity ---------------------------- */
function ActivityTab({ data }: { data: AnalyticsData }) {
  const [q, setQ] = useState('');
  const [kind, setKind] = useState<'all' | 'processing' | 'search'>('all');
  const [technical, setTechnical] = useState(false);
  const [shown, setShown] = useState(25);

  const rows = useMemo(() => {
    let r = data.activity;
    if (kind !== 'all') r = r.filter((a) => a.category === kind);
    if (q.trim()) {
      const s = q.toLowerCase();
      r = r.filter((a) => a.subject.toLowerCase().includes(s) || a.activity.toLowerCase().includes(s) || (technical && a.model.toLowerCase().includes(s)));
    }
    return r;
  }, [data.activity, kind, q, technical]);

  return (
    <div>
      <Toolbar id="activity-filter" value={q} onChange={(v) => { setQ(v); setShown(25); }} placeholder="Find activity by video, search or step…">
        <select
          id="activity-kind"
          value={kind}
          onChange={(e) => setKind(e.target.value as any)}
          className="px-3 py-2 bg-slate-900/80 border border-slate-700 rounded-lg text-xs text-slate-200 focus:outline-none cursor-pointer"
        >
          <option value="all">Everything</option>
          <option value="processing">Video processing</option>
          <option value="search">Searches</option>
        </select>
        <button
          id="activity-technical-toggle"
          onClick={() => setTechnical((t) => !t)}
          className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs border transition-colors ${technical ? 'bg-slate-700 border-slate-600 text-white' : 'bg-slate-900/80 border-slate-700 text-slate-400 hover:text-slate-200'}`}
        >
          <Wrench className="w-3.5 h-3.5" /> {technical ? 'Hide' : 'Show'} technical details
        </button>
      </Toolbar>

      {technical && data.perModel.length > 0 && (
        <div className="px-5 py-4 border-b border-slate-800/60 bg-slate-950/30 space-y-2">
          <div className="text-[11px] uppercase tracking-wider text-slate-500">By AI model</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-2">
            {data.perModel.map((m) => (
              <div key={m.model} className="flex items-center justify-between text-xs font-mono">
                <span className="text-slate-300 truncate">{m.model}</span>
                <span className="text-slate-500 ml-3 shrink-0">{m.count} calls · {compact(m.inputTokens + m.outputTokens)} tokens · <span className="text-slate-200">{money(m.cost)}</span></span>
              </div>
            ))}
          </div>
          <div className="text-[11px] text-slate-500 font-mono pt-1">
            {data.summary.totalAiCalls} AI calls · {compact(data.summary.totalTokens)} tokens · {(data.summary.totalProcessingTimeMs / 60000).toFixed(1)} min of AI time
          </div>
        </div>
      )}

      {rows.length === 0 ? (
        <Empty text="No activity matches." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-[11px] uppercase tracking-wider text-slate-500 border-b border-slate-800/60">
              <tr>
                <th className="text-left px-5 py-2.5 font-medium">When</th>
                <th className="text-left px-5 py-2.5 font-medium">What happened</th>
                <th className="text-left px-5 py-2.5 font-medium">For</th>
                {technical && <th className="text-left px-5 py-2.5 font-medium">Model</th>}
                {technical && <th className="text-right px-5 py-2.5 font-medium">Tokens in / out</th>}
                {technical && <th className="text-right px-5 py-2.5 font-medium">Time</th>}
                <th className="text-right px-5 py-2.5 font-medium">Cost</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/40">
              {rows.slice(0, shown).map((a) => (
                <tr key={a.id} className="hover:bg-slate-800/30 transition-colors">
                  <td className="px-5 py-3 text-slate-400 whitespace-nowrap" title={new Date(a.createdAt).toLocaleString()}>{relTime(a.createdAt)}</td>
                  <td className="px-5 py-3 whitespace-nowrap">
                    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-medium ${a.category === 'processing' ? 'bg-sky-500/10 text-sky-300' : 'bg-amber-500/10 text-amber-300'}`}>
                      {a.category === 'processing' ? <Clapperboard className="w-3 h-3" /> : <Search className="w-3 h-3" />}
                      {a.activity}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-slate-300 max-w-[320px] truncate" title={a.subject}>{a.subject}</td>
                  {technical && <td className="px-5 py-3 text-slate-500 font-mono whitespace-nowrap">{a.model}</td>}
                  {technical && <td className="px-5 py-3 text-right text-slate-500 font-mono whitespace-nowrap">{compact(a.inputTokens)} / {compact(a.outputTokens)}</td>}
                  {technical && <td className="px-5 py-3 text-right text-slate-500 font-mono whitespace-nowrap">{a.processingTimeMs < 1000 ? `${a.processingTimeMs}ms` : `${(a.processingTimeMs / 1000).toFixed(1)}s`}</td>}
                  <td className="px-5 py-3 text-right text-white font-semibold whitespace-nowrap">{money(a.cost)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <ShowMore shown={shown} total={rows.length} onMore={() => setShown((s) => s + 25)} />
          {data.totalLogCount > data.activity.length && rows.length <= shown && (
            <p className="p-3 text-center text-[11px] text-slate-500 border-t border-slate-800/60">
              Showing the latest {data.activity.length} of {data.totalLogCount} entries. All entries are included in the totals above.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

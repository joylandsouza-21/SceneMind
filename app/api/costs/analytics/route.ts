import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { AiCost, Video, VideoSearch } from '@/lib/db/types';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/* ------------------------------------------------------------------ */
/* Friendly labels                                                     */
/* ------------------------------------------------------------------ */
const STEP_LABELS: Record<string, string> = {
  // Video processing
  SCENE_ANALYSIS: 'Watching & describing scenes',
  EMBEDDING: 'Making scenes searchable',
  // Searching
  QUERY_EXPANSION: 'Understanding the search',
  PROMPT_SEGMENTATION: 'Splitting script into parts',
  QUERY_EMBEDDING: 'Matching against scenes',
  RESULT_VERIFICATION: 'Double-checking results',
  LEGACY_SEARCH_AI: 'Understanding & checking results',
  TIMESTAMP_VERIFICATION: 'Checking clip timings',
};

type Category = 'processing' | 'search';

/** Older logs had no search tagging, so we infer the category from what we have. */
function categorize(c: AiCost): Category {
  if (c.searchId) return 'search';
  if (c.requestType === 'SCENE_ANALYSIS') return 'processing';
  if (c.requestType === 'EMBEDDING') return c.videoId ? 'processing' : 'search';
  // RERANKING only happens during searches; TIMESTAMP_VERIFICATION is triggered from search results
  return 'search';
}

function stepKey(c: AiCost): string {
  if (c.operation) return c.operation;
  if (c.requestType === 'SCENE_ANALYSIS') return 'SCENE_ANALYSIS';
  if (c.requestType === 'TIMESTAMP_VERIFICATION') return 'TIMESTAMP_VERIFICATION';
  if (c.requestType === 'EMBEDDING') return c.videoId ? 'EMBEDDING' : 'QUERY_EMBEDDING';
  return 'LEGACY_SEARCH_AI';
}

const ts = (iso: string) => new Date(iso).getTime();
const round = (n: number) => parseFloat(n.toFixed(6));

function rangeCutoff(range: string): number {
  const now = Date.now();
  if (range === 'today') {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }
  if (range === '7d') return now - 7 * 86_400_000;
  if (range === '30d') return now - 30 * 86_400_000;
  return 0;
}

/* ------------------------------------------------------------------ */
/* Aggregation types                                                   */
/* ------------------------------------------------------------------ */
interface StepAgg { key: string; label: string; cost: number; count: number }

interface SearchAgg {
  searchId: string;
  query: string;
  name?: string;
  createdAt: string;
  cost: number;
  aiCalls: number;
  steps: Map<string, StepAgg>;
  videoIds: string[];
  scope: string;
  saved: boolean;
  /** true when older logs were linked to this search by time (best-effort) */
  matchedByTime: boolean;
}

interface VideoAgg {
  videoId: string;
  videoName: string;
  groupName?: string;
  durationSec: number;
  status: string;
  uploadedAt?: string;
  deleted: boolean;
  processingCost: number;
  processingSteps: Map<string, StepAgg>;
  timestampCheckCost: number;
  timestampCheckCount: number;
  sharedSearchCost: number;
  searches: { searchId: string; query: string; createdAt: string; searchCost: number; shareCost: number; sharedWith: number; matchedByTime: boolean }[];
}

function addStep(map: Map<string, StepAgg>, key: string, cost: number) {
  const s = map.get(key) || { key, label: STEP_LABELS[key] || key, cost: 0, count: 0 };
  s.cost += cost;
  s.count += 1;
  map.set(key, s);
}

function stepsToArray(map: Map<string, StepAgg>) {
  return Array.from(map.values())
    .map((s) => ({ ...s, cost: round(s.cost) }))
    .sort((a, b) => b.cost - a.cost);
}

/* ------------------------------------------------------------------ */
/* Handler                                                             */
/* ------------------------------------------------------------------ */
export async function GET(req: NextRequest) {
  try {
    const range = req.nextUrl.searchParams.get('range') || 'all';
    const cutoff = rangeCutoff(range);

    const allCosts = db.getCosts().filter((c) => ts(c.createdAt) >= cutoff);
    const allVideos = db.getVideos();
    const allSearches = db.getSearches();

    const videoMap = new Map<string, Video>(allVideos.map((v) => [v.id, v]));
    const searchMap = new Map<string, VideoSearch>(allSearches.map((s) => [s.id, s]));
    const searchesByTime = [...allSearches]
      .map((s) => ({ s, t: ts(s.createdAt) }))
      .sort((a, b) => a.t - b.t);

    const videoName = (id?: string) => {
      if (!id) return undefined;
      const v = videoMap.get(id);
      return v ? v.originalName || v.filename : 'Deleted video';
    };

    /* ---------- 1. Link every search-related cost to a search ---------- */
    // Older logs have no searchId. A saved search is written right after its AI calls finish,
    // so we link each orphan log to the first saved search created within 3 minutes after it.
    const MATCH_WINDOW_MS = 180_000;
    const SKEW_MS = 2_000;
    const findSearchByTime = (c: AiCost): VideoSearch | undefined => {
      const t = ts(c.createdAt);
      let lo = 0;
      let hi = searchesByTime.length;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (searchesByTime[mid].t < t - SKEW_MS) lo = mid + 1;
        else hi = mid;
      }
      for (let i = lo; i < searchesByTime.length && searchesByTime[i].t - t <= MATCH_WINDOW_MS; i++) {
        const cand = searchesByTime[i].s;
        // Per-video searches recorded the video on the re-ranking log; respect that when present
        if (c.videoId && cand.videoId && cand.videoId !== c.videoId) continue;
        return cand;
      }
      return undefined;
    };

    const searchAggs = new Map<string, SearchAgg>();
    const orphanSearchCosts: AiCost[] = [];
    const timestampCosts: AiCost[] = [];
    const processingCosts: AiCost[] = [];

    const ensureSearchAgg = (id: string, init: () => Omit<SearchAgg, 'cost' | 'aiCalls' | 'steps'>) => {
      let agg = searchAggs.get(id);
      if (!agg) {
        agg = { ...init(), cost: 0, aiCalls: 0, steps: new Map() };
        searchAggs.set(id, agg);
      }
      return agg;
    };

    const searchInfo = (s: VideoSearch | undefined, fallback: { id: string; query?: string; scopeVideoId?: string; createdAt: string }) => {
      const resultVideoIds = Array.from(
        new Set(((s?.results as any[]) || []).map((r) => r?.videoId).filter((id: any) => typeof id === 'string'))
      ) as string[];
      const scopeVideoId = s?.videoId || fallback.scopeVideoId;
      const videoIds = resultVideoIds.length > 0 ? resultVideoIds : scopeVideoId ? [scopeVideoId] : [];
      const scope = scopeVideoId
        ? `Only in "${videoName(scopeVideoId)}"`
        : s?.groupName
          ? `Group: ${s.groupName}`
          : 'All videos';
      return {
        searchId: fallback.id,
        query: s?.query || fallback.query || 'Search (text not recorded)',
        name: s?.name,
        createdAt: s?.createdAt || fallback.createdAt,
        videoIds,
        scope,
        saved: !!s,
      };
    };

    for (const c of allCosts) {
      const cat = categorize(c);
      if (cat === 'processing') {
        processingCosts.push(c);
        continue;
      }
      if (c.requestType === 'TIMESTAMP_VERIFICATION' && !c.searchId) {
        timestampCosts.push(c);
        continue;
      }

      let agg: SearchAgg | undefined;
      if (c.searchId) {
        const s = searchMap.get(c.searchId);
        agg = ensureSearchAgg(c.searchId, () => ({
          ...searchInfo(s, { id: c.searchId!, query: c.searchQuery, scopeVideoId: c.scopeVideoId, createdAt: c.createdAt }),
          matchedByTime: false,
        }));
      } else {
        const s = findSearchByTime(c);
        if (s) {
          agg = ensureSearchAgg(s.id, () => ({
            ...searchInfo(s, { id: s.id, createdAt: s.createdAt }),
            matchedByTime: true,
          }));
        }
      }

      if (!agg) {
        orphanSearchCosts.push(c);
        continue;
      }
      agg.cost += c.estimatedCost;
      agg.aiCalls += 1;
      addStep(agg.steps, stepKey(c), c.estimatedCost);
    }

    // Older logs from searches that weren't saved to history: group bursts of activity
    // (calls less than 30s apart) into one "unsaved search" each.
    orphanSearchCosts.sort((a, b) => ts(a.createdAt) - ts(b.createdAt));
    let burst: SearchAgg | undefined;
    let lastT = -Infinity;
    let burstIdx = 0;
    for (const c of orphanSearchCosts) {
      const t = ts(c.createdAt);
      if (!burst || t - lastT > 30_000) {
        burstIdx += 1;
        burst = ensureSearchAgg(`_unsaved_${burstIdx}`, () => ({
          searchId: `_unsaved_${burstIdx}`,
          query: 'Search not saved to history',
          createdAt: c.createdAt,
          videoIds: c.videoId ? [c.videoId] : [],
          scope: c.videoId ? `Only in "${videoName(c.videoId)}"` : 'Unknown',
          saved: false,
          matchedByTime: true,
        }));
      }
      lastT = t;
      burst.cost += c.estimatedCost;
      burst.aiCalls += 1;
      addStep(burst.steps, stepKey(c), c.estimatedCost);
    }

    /* ---------- 2. Per-video totals ---------- */
    const videoAggs = new Map<string, VideoAgg>();
    const ensureVideo = (id: string): VideoAgg => {
      let v = videoAggs.get(id);
      if (!v) {
        const video = videoMap.get(id);
        v = {
          videoId: id,
          videoName: video ? video.originalName || video.filename : 'Deleted video',
          groupName: video?.groupName,
          durationSec: video?.duration || 0,
          status: video?.status || 'deleted',
          uploadedAt: video?.createdAt,
          deleted: !video,
          processingCost: 0,
          processingSteps: new Map(),
          timestampCheckCost: 0,
          timestampCheckCount: 0,
          sharedSearchCost: 0,
          searches: [],
        };
        videoAggs.set(id, v);
      }
      return v;
    };

    let unattributedProcessing = 0;
    for (const c of processingCosts) {
      if (!c.videoId) {
        unattributedProcessing += c.estimatedCost;
        continue;
      }
      const v = ensureVideo(c.videoId);
      v.processingCost += c.estimatedCost;
      addStep(v.processingSteps, stepKey(c), c.estimatedCost);
    }

    let timestampUnlinked = 0;
    for (const c of timestampCosts) {
      if (!c.videoId) {
        timestampUnlinked += c.estimatedCost;
        continue;
      }
      const v = ensureVideo(c.videoId);
      v.timestampCheckCost += c.estimatedCost;
      v.timestampCheckCount += 1;
    }

    // Search cost is shared equally between the videos the search returned clips from
    let searchesWithoutVideoCost = 0;
    let searchesWithoutVideoCount = 0;
    for (const s of searchAggs.values()) {
      const vids = s.videoIds.filter((id) => videoMap.has(id) || videoAggs.has(id));
      if (vids.length === 0) {
        searchesWithoutVideoCost += s.cost;
        searchesWithoutVideoCount += 1;
        continue;
      }
      const share = s.cost / vids.length;
      for (const id of vids) {
        const v = ensureVideo(id);
        v.sharedSearchCost += share;
        v.searches.push({
          searchId: s.searchId,
          query: s.query,
          createdAt: s.createdAt,
          searchCost: round(s.cost),
          shareCost: round(share),
          sharedWith: vids.length,
          matchedByTime: s.matchedByTime,
        });
      }
    }

    const videos = Array.from(videoAggs.values())
      .map((v) => {
        const searchCost = v.sharedSearchCost + v.timestampCheckCost;
        const totalCost = v.processingCost + searchCost;
        const minutes = v.durationSec / 60;
        return {
          videoId: v.videoId,
          videoName: v.videoName,
          groupName: v.groupName,
          durationSec: v.durationSec,
          status: v.status,
          uploadedAt: v.uploadedAt,
          deleted: v.deleted,
          processingCost: round(v.processingCost),
          processingSteps: stepsToArray(v.processingSteps),
          searchCost: round(searchCost),
          sharedSearchCost: round(v.sharedSearchCost),
          timestampCheckCost: round(v.timestampCheckCost),
          timestampCheckCount: v.timestampCheckCount,
          searchCount: v.searches.length,
          totalCost: round(totalCost),
          costPerMinute: minutes > 0 ? round(v.processingCost / minutes) : 0,
          searches: v.searches.sort((a, b) => ts(b.createdAt) - ts(a.createdAt)),
        };
      })
      .sort((a, b) => b.totalCost - a.totalCost);

    const searches = Array.from(searchAggs.values())
      .map((s) => ({
        searchId: s.searchId,
        query: s.query,
        name: s.name,
        createdAt: s.createdAt,
        cost: round(s.cost),
        aiCalls: s.aiCalls,
        steps: stepsToArray(s.steps),
        videos: s.videoIds.map((id) => ({ videoId: id, videoName: videoName(id) || 'Unknown' })),
        scope: s.scope,
        saved: s.saved,
        matchedByTime: s.matchedByTime,
      }))
      .sort((a, b) => ts(b.createdAt) - ts(a.createdAt));

    /* ---------- 3. Summary ---------- */
    let processingCost = 0;
    let searchCost = 0;
    let totalTokens = 0;
    let totalProcessingTimeMs = 0;
    for (const c of allCosts) {
      if (categorize(c) === 'processing') processingCost += c.estimatedCost;
      else searchCost += c.estimatedCost;
      totalTokens += (c.inputTokens || 0) + (c.outputTokens || 0);
      totalProcessingTimeMs += c.processingTimeMs || 0;
    }
    const processedVideos = videos.filter((v) => v.processingCost > 0).length;
    const realSearches = searches.length;
    const legacyLogs = allCosts.filter((c) => categorize(c) === 'search' && !c.searchId).length;

    const summary = {
      totalCost: round(processingCost + searchCost),
      processingCost: round(processingCost),
      searchCost: round(searchCost),
      videoCount: processedVideos,
      searchCount: realSearches,
      avgCostPerVideo: processedVideos > 0 ? round(processingCost / processedVideos) : 0,
      avgCostPerSearch: realSearches > 0 ? round(searchCost / realSearches) : 0,
      totalAiCalls: allCosts.length,
      totalTokens,
      totalProcessingTimeMs,
      searchesWithoutVideoCost: round(searchesWithoutVideoCost),
      searchesWithoutVideoCount,
      unattributedCost: round(unattributedProcessing + timestampUnlinked),
      legacySearchLogs: legacyLogs,
    };

    /* ---------- 4. Spend over time (daily, hourly for "today") ---------- */
    const hourly = range === 'today';
    const buckets = new Map<string, { label: string; processing: number; search: number }>();
    for (const c of allCosts) {
      const d = new Date(c.createdAt);
      const key = hourly
        ? `${String(d.getHours()).padStart(2, '0')}:00`
        : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const b = buckets.get(key) || { label: key, processing: 0, search: 0 };
      if (categorize(c) === 'processing') b.processing += c.estimatedCost;
      else b.search += c.estimatedCost;
      buckets.set(key, b);
    }
    const timeline = Array.from(buckets.values())
      .map((b) => ({ ...b, processing: round(b.processing), search: round(b.search) }))
      .sort((a, b) => a.label.localeCompare(b.label));

    /* ---------- 5. Technical details ---------- */
    const byModel = new Map<string, { model: string; count: number; cost: number; inputTokens: number; outputTokens: number }>();
    for (const c of allCosts) {
      const m = byModel.get(c.model) || { model: c.model, count: 0, cost: 0, inputTokens: 0, outputTokens: 0 };
      m.count += 1;
      m.cost += c.estimatedCost;
      m.inputTokens += c.inputTokens || 0;
      m.outputTokens += c.outputTokens || 0;
      byModel.set(c.model, m);
    }
    const perModel = Array.from(byModel.values())
      .map((m) => ({ ...m, cost: round(m.cost) }))
      .sort((a, b) => b.cost - a.cost);

    // Friendly activity log (latest 500)
    const activity = [...allCosts]
      .sort((a, b) => ts(b.createdAt) - ts(a.createdAt))
      .slice(0, 500)
      .map((c) => {
        const category = categorize(c);
        const key = stepKey(c);
        const subject =
          category === 'processing'
            ? videoName(c.videoId) || 'Unknown video'
            : c.searchQuery || (c.searchId && searchMap.get(c.searchId)?.query) ||
              (c.requestType === 'TIMESTAMP_VERIFICATION' ? videoName(c.videoId) || 'Search result' : 'Search');
        return {
          id: c.id,
          createdAt: c.createdAt,
          category,
          activity: STEP_LABELS[key] || key,
          subject,
          cost: c.estimatedCost,
          model: c.model,
          inputTokens: c.inputTokens,
          outputTokens: c.outputTokens,
          processingTimeMs: c.processingTimeMs,
        };
      });

    return NextResponse.json({
      range,
      summary,
      videos,
      searches,
      timeline,
      perModel,
      activity,
      totalLogCount: allCosts.length,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

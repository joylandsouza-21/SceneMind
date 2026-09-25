'use client';

import React, { useState, useEffect, useMemo, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  Search,
  Sparkles,
  Scissors,
  Film,
  Play,
  CheckCircle2,
  Clock,
  ArrowRight,
  ShieldCheck,
  AlertCircle,
  Folder,
  Layers,
  X,
  Tag,
  RefreshCw,
  History,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { formatTime } from '@/components/VideoPlayer';
import ClipModal from '@/components/ClipModal';
import GroupSelectDropdown from '@/components/GroupSelectDropdown';
import VideoSelectDropdown from '@/components/VideoSelectDropdown';
import SearchHistoryModal, { SearchHistoryItem } from '@/components/SearchHistoryModal';
import ScenePreviewModal from '@/components/ScenePreviewModal';

const MAX_PROMPT_TOKENS = 8192;
const MAX_PROMPT_CHARS = 32768;

interface SegmentMatch {
  segmentId: string;
  segmentIndex: number;
  segmentLabel: string;
  segmentText: string;
  similarity: number;
}

interface PromptSegmentItem {
  id: string;
  index: number;
  label: string;
  text: string;
  wordCount: number;
  charCount: number;
  matchedClipCount: number;
  matchedClipIds: string[];
}

const SEGMENT_COLORS = [
  {
    bg: 'bg-blue-500/15',
    activeBg: 'bg-blue-500/25',
    border: 'border-blue-500/30',
    activeBorder: 'border-blue-400',
    text: 'text-blue-300',
    badge: 'bg-blue-500 text-white',
    ring: 'ring-blue-500',
  },
  {
    bg: 'bg-emerald-500/15',
    activeBg: 'bg-emerald-500/25',
    border: 'border-emerald-500/30',
    activeBorder: 'border-emerald-400',
    text: 'text-emerald-300',
    badge: 'bg-emerald-500 text-white',
    ring: 'ring-emerald-500',
  },
  {
    bg: 'bg-amber-500/15',
    activeBg: 'bg-amber-500/25',
    border: 'border-amber-500/30',
    activeBorder: 'border-amber-400',
    text: 'text-amber-300',
    badge: 'bg-amber-500 text-white',
    ring: 'ring-amber-500',
  },
  {
    bg: 'bg-purple-500/15',
    activeBg: 'bg-purple-500/25',
    border: 'border-purple-500/30',
    activeBorder: 'border-purple-400',
    text: 'text-purple-300',
    badge: 'bg-purple-500 text-white',
    ring: 'ring-purple-500',
  },
  {
    bg: 'bg-cyan-500/15',
    activeBg: 'bg-cyan-500/25',
    border: 'border-cyan-500/30',
    activeBorder: 'border-cyan-400',
    text: 'text-cyan-300',
    badge: 'bg-cyan-500 text-white',
    ring: 'ring-cyan-500',
  },
  {
    bg: 'bg-rose-500/15',
    activeBg: 'bg-rose-500/25',
    border: 'border-rose-500/30',
    activeBorder: 'border-rose-400',
    text: 'text-rose-300',
    badge: 'bg-rose-500 text-white',
    ring: 'ring-rose-500',
  },
];

function getSegmentColor(index: number) {
  return SEGMENT_COLORS[(index - 1) % SEGMENT_COLORS.length] || SEGMENT_COLORS[0];
}

function MatchedSegmentsAccordion({
  segmentMatches,
  selectedSegmentId,
  onSelectSegment,
}: {
  segmentMatches: SegmentMatch[];
  selectedSegmentId: string | 'all';
  onSelectSegment: (id: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  if (!segmentMatches || segmentMatches.length === 0) return null;

  const topMatch = segmentMatches[0];
  const topColor = getSegmentColor(topMatch.segmentIndex);

  return (
    <div className="rounded-xl bg-slate-950/70 border border-slate-800/80 overflow-hidden transition-all">
      {/* 1-Line Collapsed Summary Bar (Default closed) */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-3 py-2 flex items-center justify-between gap-2 text-left hover:bg-slate-900/60 transition-colors"
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <Tag className="w-3 h-3 text-indigo-400 shrink-0" />
          <span className="text-[11px] font-medium text-slate-300 truncate">
            Matched Prompt Segments ({segmentMatches.length}):
          </span>
          <span
            className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold shrink-0 ${topColor.bg} ${topColor.text}`}
          >
            <span>{topMatch.segmentLabel}</span>
            <span className="opacity-75 font-mono">({Math.round(topMatch.similarity * 100)}%)</span>
          </span>
        </div>

        <div className="flex items-center gap-1 text-[10px] text-slate-400 shrink-0 font-medium">
          <span>{isOpen ? 'Collapse' : 'Expand'}</span>
          {isOpen ? <ChevronUp className="w-3.5 h-3.5 text-slate-400" /> : <ChevronDown className="w-3.5 h-3.5 text-slate-400" />}
        </div>
      </button>

      {/* Expandable Breakdown Area */}
      {isOpen && (
        <div className="p-3 pt-2 border-t border-slate-800/60 space-y-2 bg-slate-950/40 animate-in fade-in duration-150">
          <div className="flex flex-wrap items-center gap-1.5">
            {segmentMatches.map((sm) => {
              const isSelected = selectedSegmentId === sm.segmentId;
              const colorCls = getSegmentColor(sm.segmentIndex);
              return (
                <button
                  key={sm.segmentId}
                  type="button"
                  onClick={() => onSelectSegment(isSelected ? 'all' : sm.segmentId)}
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold transition-all ${
                    isSelected
                      ? `${colorCls.activeBg} ${colorCls.text} ring-1 ${colorCls.ring} shadow-sm`
                      : `${colorCls.bg} ${colorCls.text} hover:opacity-80`
                  }`}
                  title={`Click to isolate ${sm.segmentLabel}: "${sm.segmentText}"`}
                >
                  <span>{sm.segmentLabel}</span>
                  <span className="opacity-75 font-mono">({Math.round(sm.similarity * 100)}%)</span>
                </button>
              );
            })}
          </div>

          <div className="space-y-1.5 pt-1">
            {segmentMatches.map((sm) => {
              const colorCls = getSegmentColor(sm.segmentIndex);
              return (
                <div
                  key={sm.segmentId}
                  className="text-[11px] text-slate-400 leading-relaxed pl-2 border-l-2 border-slate-800 flex items-start gap-1.5"
                >
                  <span className={`font-semibold shrink-0 ${colorCls.text}`}>
                    {sm.segmentLabel}:
                  </span>
                  <span className="line-clamp-2 text-slate-300">
                    "{sm.segmentText}"
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function GlobalSearchContent() {
  const searchParams = useSearchParams();
  const [query, setQuery] = useState('');
  const [groups, setGroups] = useState<any[]>([]);
  const [videos, setVideos] = useState<any[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string>('all');
  const [selectedVideoId, setSelectedVideoId] = useState<string>('all');
  const [isSearching, setIsSearching] = useState(false);
  const [results, setResults] = useState<any[]>([]);
  const [segments, setSegments] = useState<PromptSegmentItem[]>([]);
  const [selectedSegmentId, setSelectedSegmentId] = useState<string | 'all'>('all');
  const [segmentPage, setSegmentPage] = useState(0);
  const [hasSearched, setHasSearched] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  // Search History state
  const [historyModalOpen, setHistoryModalOpen] = useState(false);
  const [activeHistoryId, setActiveHistoryId] = useState<string | null>(null);
  const [historyCount, setHistoryCount] = useState<number>(0);

  // Clip modal state
  const [clipModalOpen, setClipModalOpen] = useState(false);
  const [activeClipData, setActiveClipData] = useState<any | null>(null);

  // Scene Preview modal state
  const [previewModalOpen, setPreviewModalOpen] = useState(false);
  const [previewSceneIndex, setPreviewSceneIndex] = useState(0);

  const handleOpenPreview = (index: number) => {
    setPreviewSceneIndex(index);
    setPreviewModalOpen(true);
  };

  // Prompt token & character estimation
  const estimatedTokens = Math.ceil(query.length / 4);
  const isOverLimit = estimatedTokens > MAX_PROMPT_TOKENS || query.length > MAX_PROMPT_CHARS;
  const isNearLimit = estimatedTokens > MAX_PROMPT_TOKENS * 0.8 && !isOverLimit;
  const progressPercent = Math.min(100, Math.round((estimatedTokens / MAX_PROMPT_TOKENS) * 100));

  const fetchHistoryCount = () => {
    fetch('/api/search/history')
      .then((res) => res.json())
      .then((data) => setHistoryCount((data.history || []).length))
      .catch(() => {});
  };

  useEffect(() => {
    const urlGroupId = searchParams.get('groupId');
    const urlVideoId = searchParams.get('videoId');
    const urlQuery = searchParams.get('q');

    if (urlGroupId) setSelectedGroupId(urlGroupId);
    if (urlVideoId) setSelectedVideoId(urlVideoId);
    if (urlQuery) setQuery(urlQuery);

    fetch('/api/groups')
      .then((res) => res.json())
      .then((data) => setGroups(data.groups || []))
      .catch((err) => console.error('Failed to load groups:', err));

    fetch('/api/videos')
      .then((res) => res.json())
      .then((data) => {
        const vids = data.videos || [];
        setVideos(vids);
        if (urlVideoId) {
          const match = vids.find((v: any) => v.id === urlVideoId);
          if (match && match.groupId && !urlGroupId) {
            setSelectedGroupId(match.groupId);
          }
        }
      })
      .catch((err) => console.error('Failed to load videos:', err));

    fetchHistoryCount();
  }, [searchParams]);

  const samplePrompts = [
    'Episode scene sequence:\n1. Luffy charges with a red fiery fist.\n2. Kaido roars and swings his giant thunder club.\n3. The sky splits open with lightning.',
    'Find all fight scenes',
    'Find two people arguing',
    'Find red car or driving',
    'Find person walking a dog',
    'Find conversations in a room',
  ];

  const handleSearch = async (
    e?: React.FormEvent,
    customQuery?: string,
    customGroup?: string,
    customVideo?: string,
    forceLive: boolean = true
  ) => {
    if (e) e.preventDefault();
    const q = customQuery !== undefined ? customQuery : query;
    const g = customGroup !== undefined ? customGroup : selectedGroupId;
    const v = customVideo !== undefined ? customVideo : selectedVideoId;
    if (!q || q.trim() === '') return;

    setSearchError(null);

    const tokens = Math.ceil(q.length / 4);
    if (tokens > MAX_PROMPT_TOKENS || q.length > MAX_PROMPT_CHARS) {
      setSearchError(
        `Prompt exceeds maximum script limit of ${MAX_PROMPT_TOKENS} tokens (~${tokens} tokens / ${q.length} chars). Please shorten your search script.`
      );
      return;
    }

    if (customQuery !== undefined) setQuery(customQuery);
    if (customGroup !== undefined) setSelectedGroupId(customGroup);
    if (customVideo !== undefined) setSelectedVideoId(customVideo);
    setIsSearching(true);
    setHasSearched(true);
    setActiveHistoryId(null);

    try {
      const res = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: q,
          autoVerify: true,
          limit: 20,
          groupId: g !== 'all' ? g : undefined,
          videoId: v !== 'all' ? v : undefined,
          forceLive,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        setResults(data.results || []);
        setSegments(data.segments || []);
        setSelectedSegmentId('all');
        setSegmentPage(0);
        if (data.fromCache && data.searchId) {
          setActiveHistoryId(data.searchId);
        }
        fetchHistoryCount();
      } else {
        setSearchError(data.error || 'Search failed. Please verify API configuration or try again.');
        setResults([]);
        setSegments([]);
      }
    } catch (err: any) {
      console.error('Global search error:', err);
      setSearchError(err?.message || 'Network error occurred while executing search.');
      setResults([]);
      setSegments([]);
    } finally {
      setIsSearching(false);
    }
  };

  const handleRestoreSearch = async (searchId: string, historyItem?: SearchHistoryItem) => {
    setIsSearching(true);
    setHasSearched(true);
    setResults([]);
    setSegments([]);
    setSearchError(null);

    // Immediately reflect selected query, group, and video in UI
    if (historyItem) {
      setQuery(historyItem.query);
      if (historyItem.groupId) setSelectedGroupId(historyItem.groupId);
      else setSelectedGroupId('all');
      if (historyItem.videoId) setSelectedVideoId(historyItem.videoId);
      else setSelectedVideoId('all');
    }

    try {
      const res = await fetch(`/api/search/history/${searchId}`);
      if (!res.ok) {
        throw new Error(`Failed to load history record (status: ${res.status})`);
      }
      const data = await res.json();
      const s = data.search;
      if (s) {
        setQuery(s.query);
        setSelectedGroupId(s.groupId || 'all');
        setSelectedVideoId(s.videoId || 'all');
        setActiveHistoryId(s.id);

        if (s.results && Array.isArray(s.results) && s.results.length > 0) {
          // Smooth 200ms loader transition so user clearly sees data populating
          setTimeout(() => {
            setResults(s.results);
            setSegments(s.segments || []);
            setSelectedSegmentId('all');
            setHasSearched(true);
            setIsSearching(false);
          }, 200);
        } else {
          // Older history item without cached results snapshot:
          // Automatically execute live search so results load for the user!
          await handleSearch(undefined, s.query, s.groupId || 'all', s.videoId || 'all');
        }
      } else {
        throw new Error('Search record empty');
      }
    } catch (e: any) {
      console.error('Error restoring search record:', e);
      setSearchError('Failed to load saved search results from history. You can click Search to re-run this query.');
      setIsSearching(false);
    }
  };

  const handleOpenClip = (res: any) => {
    setActiveClipData(res);
    setClipModalOpen(true);
  };

  const activeGroup = groups.find((g) => g.id === selectedGroupId);
  const activeVideo = videos.find((v) => v.id === selectedVideoId);
  const activeSegment = segments.find((s) => s.id === selectedSegmentId);

  // Filtered results based on selected segment (capped to top 5 matches per part)
  const displayedResults = useMemo(() => {
    if (selectedSegmentId === 'all') return results;
    return results.filter((r) => r.matchedSegmentIds?.includes(selectedSegmentId)).slice(0, 5);
  }, [results, selectedSegmentId]);

  return (
    <div className="space-y-8 animate-in fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white flex items-center space-x-3">
            <Search className="w-6 h-6 text-blue-400" />
            <span>Cross-Video Semantic Search</span>
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Search across every indexed video, filter queries inside a TV show, or narrow down to a specific episode.
          </p>
        </div>

        {/* Search History Trigger Button */}
        <button
          type="button"
          onClick={() => setHistoryModalOpen(true)}
          className="flex items-center space-x-2 px-4 py-2.5 rounded-2xl bg-slate-900/90 border border-slate-800 hover:border-slate-700 hover:bg-slate-800 text-slate-200 text-xs font-semibold shadow-sm transition-all shrink-0 self-start sm:self-auto group"
          title="View previous searches and cached results"
        >
          <History className="w-4 h-4 text-blue-400 group-hover:scale-110 transition-transform" />
          <span>Search History</span>
          {historyCount > 0 && (
            <span className="px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-400 text-[10px] font-mono font-bold border border-blue-500/25">
              {historyCount}
            </span>
          )}
        </button>
      </div>

      {/* Restored History Search Banner */}
      {activeHistoryId && (
        <div className="p-3.5 rounded-2xl bg-blue-950/30 border border-blue-500/30 text-xs text-blue-200 flex flex-wrap items-center justify-between gap-2.5 animate-in fade-in">
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-blue-400 shrink-0" />
            <span>
              Viewing <strong>saved search results</strong> from history.
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => handleSearch()}
              className="px-3 py-1 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium text-xs transition-colors"
            >
              Re-run Live Search
            </button>
            <button
              type="button"
              onClick={() => setActiveHistoryId(null)}
              className="text-slate-400 hover:text-white p-1 rounded-md"
              title="Dismiss banner"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Query Bar & Filters */}
      <div className="glass-panel p-6 rounded-3xl border border-slate-800 space-y-4">
        {/* Active Scope Indicators */}
        {(selectedGroupId !== 'all' || selectedVideoId !== 'all') && (
          <div className="flex flex-wrap items-center gap-2 p-2.5 rounded-2xl bg-slate-900/60 border border-slate-800 text-xs animate-in fade-in">
            <span className="text-slate-400 font-medium flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-blue-400" />
              <span>Scope:</span>
            </span>

            {activeGroup && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-indigo-500/15 border border-indigo-500/30 text-indigo-300 font-medium">
                <Folder className="w-3.5 h-3.5 text-indigo-400" />
                <span>Show: <strong>{activeGroup.name}</strong></span>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedGroupId('all');
                  }}
                  className="p-0.5 hover:bg-indigo-500/30 rounded text-indigo-300 hover:text-white transition-colors ml-0.5"
                  title="Remove show filter"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}

            {activeVideo && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-blue-500/15 border border-blue-500/30 text-blue-300 font-medium">
                <Film className="w-3.5 h-3.5 text-blue-400" />
                <span className="truncate max-w-[240px]">Video: <strong>{activeVideo.filename}</strong></span>
                <button
                  type="button"
                  onClick={() => setSelectedVideoId('all')}
                  className="p-0.5 hover:bg-blue-500/30 rounded text-blue-300 hover:text-white transition-colors ml-0.5"
                  title="Remove video filter"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}

            <button
              type="button"
              onClick={() => {
                setSelectedGroupId('all');
                setSelectedVideoId('all');
              }}
              className="text-slate-400 hover:text-slate-200 hover:underline text-[11px] ml-auto"
            >
              Reset to All Videos
            </button>
          </div>
        )}

        <form onSubmit={handleSearch} className="flex flex-col lg:flex-row gap-3.5 lg:items-stretch">
          {/* Scope Selectors: Vertically Stacked (Fixed height & independent of search box size) */}
          <div className="flex flex-col gap-2.5 w-full lg:w-[280px] shrink-0 p-3.5 rounded-2xl bg-slate-900/50 border border-slate-800 shadow-sm">
            {/* Show / Group Selector */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between px-0.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                  <Folder className="w-3 h-3 text-indigo-400" />
                  <span>Show / Group</span>
                </span>
                {selectedGroupId !== 'all' && (
                  <button
                    type="button"
                    onClick={() => setSelectedGroupId('all')}
                    className="text-[10px] font-medium text-indigo-400 hover:text-indigo-300 transition-colors"
                  >
                    All Shows
                  </button>
                )}
              </div>
              <GroupSelectDropdown
                groups={groups}
                selectedGroupId={selectedGroupId}
                onSelectGroup={(id) => {
                  setSelectedGroupId(id);
                  // If selected video is not in this new group, reset video selection
                  if (id !== 'all' && selectedVideoId !== 'all') {
                    const vid = videos.find((v) => v.id === selectedVideoId);
                    if (vid && vid.groupId !== id) {
                      setSelectedVideoId('all');
                    }
                  }
                }}
                allLabel="All Shows & Groups"
                allValue="all"
                icon="film"
                className="w-full"
                menuWidth="w-full min-w-[260px]"
              />
            </div>

            <div className="h-px bg-slate-800/80" />

            {/* Video / Episode Selector */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between px-0.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                  <Film className="w-3 h-3 text-blue-400" />
                  <span>Video in Scope</span>
                </span>
                {selectedVideoId !== 'all' && (
                  <button
                    type="button"
                    onClick={() => setSelectedVideoId('all')}
                    className="text-[10px] font-medium text-blue-400 hover:text-blue-300 transition-colors"
                  >
                    All Videos
                  </button>
                )}
              </div>
              <VideoSelectDropdown
                videos={videos}
                selectedVideoId={selectedVideoId}
                selectedGroupId={selectedGroupId}
                onSelectVideo={(id) => {
                  setSelectedVideoId(id);
                  if (id !== 'all') {
                    const vid = videos.find((v) => v.id === id);
                    if (vid && vid.groupId && vid.groupId !== selectedGroupId) {
                      setSelectedGroupId(vid.groupId);
                    }
                  }
                }}
                allLabel="All Videos in Scope"
                allValue="all"
                className="w-full"
                menuWidth="w-full min-w-[260px]"
              />
            </div>
          </div>

          {/* Search Query Multi-line Input with capped height and internal scrolling */}
          <div className="relative flex-1 w-full min-w-0 flex flex-col">
            <Search className="w-5 h-5 text-slate-400 absolute left-4 top-4 pointer-events-none z-10" />
            <textarea
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                if (searchError) setSearchError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  if (!isSearching && query.trim() && !isOverLimit) {
                    handleSearch();
                  }
                }
              }}
              rows={query.split('\n').length > 3 ? Math.min(query.split('\n').length, 7) : 4}
              placeholder={
                activeVideo
                  ? `Search scenes inside "${activeVideo.filename}" (e.g. actions, characters, dialogue)...`
                  : activeGroup
                  ? `Search inside "${activeGroup.name}" episodes (e.g. multi-line prompt, scene descriptions)...`
                  : 'Search all videos (e.g. paste 7-8 lines of sequence descriptions, or single actions)...'
              }
              className={`w-full h-full pl-12 pr-4 py-3.5 bg-slate-950/80 border rounded-2xl text-white placeholder-slate-500 text-sm focus:outline-none shadow-inner transition-colors min-h-[128px] max-h-[220px] overflow-y-auto scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-slate-950 leading-relaxed resize-none ${
                isOverLimit
                  ? 'border-rose-500/80 focus:border-rose-400 focus:ring-1 focus:ring-rose-500/30'
                  : isNearLimit
                  ? 'border-amber-500/80 focus:border-amber-400'
                  : 'border-slate-700/80 focus:border-blue-500'
              }`}
            />
          </div>

          {/* Search & Reset Buttons — stacked, equal height */}
          <div className="flex flex-row lg:flex-col gap-1.5 w-full lg:w-28 shrink-0">
            <button
              type="submit"
              disabled={isSearching || !query.trim() || isOverLimit}
              className="px-4 h-[52px] lg:flex-1 w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold text-sm rounded-2xl shadow-lg shadow-blue-500/20 transition-all flex flex-row lg:flex-col items-center justify-center gap-1.5"
            >
              {isSearching ? <RefreshCw className="w-5 h-5 animate-spin text-white" /> : <Search className="w-5 h-5" />}
              <span>{isSearching ? 'Searching...' : 'Search'}</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setQuery('');
                setSelectedGroupId('all');
                setSelectedVideoId('all');
                setResults([]);
                setSegments([]);
                setSelectedSegmentId('all');
                setHasSearched(false);
                setSearchError(null);
                setActiveHistoryId(null);
              }}
              disabled={!query && selectedGroupId === 'all' && selectedVideoId === 'all' && results.length === 0}
              className="px-4 h-[52px] lg:flex-1 w-full bg-slate-800/80 hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed text-slate-300 hover:text-white font-medium text-xs rounded-2xl border border-slate-700/60 hover:border-slate-600 transition-all flex flex-row lg:flex-col items-center justify-center gap-1.5"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Reset</span>
            </button>
          </div>
        </form>

        {/* Prompt Limit & Token Status Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs pt-0.5">
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-900/90 border border-slate-800">
              <span className="text-slate-400 font-medium">Prompt size:</span>
              <span
                className={`font-mono font-semibold ${
                  isOverLimit
                    ? 'text-rose-400'
                    : isNearLimit
                    ? 'text-amber-400'
                    : 'text-slate-200'
                }`}
              >
                ~{estimatedTokens.toLocaleString()}
              </span>
              <span className="text-slate-500 font-mono">/ {MAX_PROMPT_TOKENS.toLocaleString()} tokens</span>
              <span className="text-slate-600">•</span>
              <span className="text-slate-400 font-mono">{query.length.toLocaleString()} chars</span>
            </div>

            {/* Progress Mini Meter */}
            <div className="w-20 bg-slate-800/80 h-1.5 rounded-full overflow-hidden hidden sm:block">
              <div
                className={`h-full rounded-full transition-all duration-200 ${
                  isOverLimit
                    ? 'bg-rose-500'
                    : isNearLimit
                    ? 'bg-amber-500'
                    : 'bg-gradient-to-r from-blue-500 to-indigo-500'
                }`}
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[11px] text-slate-500 font-medium hidden md:inline">
              Multi-scene script capacity: {MAX_PROMPT_TOKENS.toLocaleString()} tokens (~{MAX_PROMPT_CHARS.toLocaleString()} chars)
            </span>
            {isOverLimit && (
              <span className="text-[11px] font-semibold text-rose-400 bg-rose-500/10 border border-rose-500/30 px-2 py-0.5 rounded-md animate-pulse">
                Over Script Limit
              </span>
            )}
          </div>
        </div>

        {/* Error Alert Banner */}
        {searchError && (
          <div className="p-4 rounded-2xl bg-rose-950/40 border border-rose-500/40 text-rose-200 flex items-start justify-between gap-3 animate-in fade-in">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <h4 className="text-sm font-semibold text-rose-300">Search Error</h4>
                <p className="text-xs text-rose-200/90 leading-relaxed font-mono">{searchError}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setSearchError(null)}
              className="p-1 rounded-lg text-rose-400 hover:text-rose-200 hover:bg-rose-900/40 transition-colors"
              title="Dismiss error"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}



        {/* Suggested Prompts */}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <span className="text-xs text-slate-500 font-medium">Quick queries:</span>
          {samplePrompts.map((p, i) => (
            <button
              key={i}
              type="button"
              onClick={() => handleSearch(undefined, p)}
              className="px-3 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-white text-xs transition-colors whitespace-pre-line text-left"
            >
              {p.includes('\n') ? '📺 Multi-line scene sequence...' : `"${p}"`}
            </button>
          ))}
        </div>
      </div>

      {/* Interactive Prompt Storyboard & Segment Alignment Panel */}
      {segments.length > 1 && (
        <div className="glass-panel p-6 rounded-3xl border border-slate-800 space-y-4 animate-in fade-in">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <Layers className="w-4 h-4 text-indigo-400" />
                <span>Prompt Storyboard & Segment Alignment</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/30 font-semibold">
                  {segments.length} Parts Detected
                </span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Each portion of your prompt was analyzed against video scenes. Click any segment below to filter matched clips.
              </p>
            </div>

            {selectedSegmentId !== 'all' && (
              <button
                type="button"
                onClick={() => setSelectedSegmentId('all')}
                className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1 font-medium shrink-0 self-start sm:self-auto bg-blue-500/10 px-3 py-1 rounded-lg border border-blue-500/20"
              >
                <span>Show All {results.length} Clips</span>
                <X className="w-3.5 h-3.5" />
              </button>
            )}

            {/* Pagination Controls */}
            {segments.length > 3 && (
              <div className="flex items-center gap-1 shrink-0 ml-auto sm:ml-0">
                <button
                  type="button"
                  onClick={() => setSegmentPage(p => Math.max(0, p - 1))}
                  disabled={segmentPage === 0}
                  className="p-1.5 rounded-full text-slate-400 hover:text-white hover:bg-slate-800 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                  title="Previous parts"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-[10px] font-mono text-slate-500 min-w-[32px] text-center">
                  {segmentPage + 1}/{Math.ceil((segments.length + 1) / 4)}
                </span>
                <button
                  type="button"
                  onClick={() => setSegmentPage(p => Math.min(Math.ceil((segments.length + 1) / 4) - 1, p + 1))}
                  disabled={segmentPage >= Math.ceil((segments.length + 1) / 4) - 1}
                  className="p-1.5 rounded-full text-slate-400 hover:text-white hover:bg-slate-800 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                  title="Next parts"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>

          {/* Storyboard Segment Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {(() => {
              const allCards = [
                { isAll: true, seg: null },
                ...segments.map(seg => ({ isAll: false, seg }))
              ];
              const displayedCards = allCards.slice(segmentPage * 4, (segmentPage + 1) * 4);

              return displayedCards.map((card) => {
                if (card.isAll) {
                  return (
                    <button
                      key="all"
                      type="button"
                      onClick={() => setSelectedSegmentId('all')}
                      className={`p-3.5 rounded-2xl border text-left transition-all flex flex-col justify-between space-y-2.5 ${
                        selectedSegmentId === 'all'
                          ? 'bg-blue-600/15 border-blue-500/50 shadow-lg shadow-blue-500/10 ring-1 ring-blue-500'
                          : 'bg-slate-900/60 border-slate-800 hover:border-slate-700 hover:bg-slate-900'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-white flex items-center gap-1.5">
                          <Sparkles className="w-3.5 h-3.5 text-blue-400" />
                          <span>All Segments</span>
                        </span>
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 font-semibold">
                          {results.length} clips
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 line-clamp-2">
                        View all retrieved scene candidates matching any part of your prompt.
                      </p>
                      <div className="text-[10px] text-blue-400 pt-1 font-medium">
                        {selectedSegmentId === 'all' ? '● Active' : 'Click to view all'}
                      </div>
                    </button>
                  );
                } else {
                  if (!card.seg) return null;
                  const seg = card.seg;
                  const isSelected = selectedSegmentId === seg.id;
                  const color = getSegmentColor(seg.index);
                  return (
                    <button
                      key={seg.id}
                      type="button"
                      onClick={() => setSelectedSegmentId(seg.id)}
                      className={`p-3.5 rounded-2xl border text-left transition-all flex flex-col justify-between space-y-2.5 group ${
                        isSelected
                          ? `${color.activeBg} ${color.activeBorder} shadow-lg ring-1 ${color.ring}`
                          : 'bg-slate-900/60 border-slate-800 hover:border-slate-700 hover:bg-slate-900'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className={`text-xs font-bold flex items-center gap-1.5 ${color.text}`}>
                          <span className={`w-4 h-4 rounded-full ${color.badge} text-[10px] flex items-center justify-center font-bold`}>
                            {seg.index}
                          </span>
                          <span>{seg.label}</span>
                        </span>
                        <span
                          className={`text-[10px] font-mono px-2 py-0.5 rounded-full font-semibold ${
                            seg.matchedClipCount > 0
                              ? `${color.bg} ${color.text} border ${color.border}`
                              : 'bg-slate-800 text-slate-500'
                          }`}
                        >
                          {seg.matchedClipCount} {seg.matchedClipCount === 1 ? 'clip' : 'clips'}
                        </span>
                      </div>

                      <p className={`text-xs leading-relaxed line-clamp-3 ${isSelected ? 'text-white font-medium' : 'text-slate-300'}`}>
                        "{seg.text}"
                      </p>

                      <div className="flex items-center justify-between text-[10px] text-slate-500 pt-1">
                        <span>{seg.wordCount} words</span>
                        <span className={`font-semibold ${isSelected ? color.text : 'text-blue-400 group-hover:underline'}`}>
                          {isSelected ? '● Active Filter' : 'Filter clips →'}
                        </span>
                      </div>
                    </button>
                  );
                }
              });
            })()}
          </div>
        </div>
      )}

      {/* Results List Header & Count */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center space-x-2 flex-wrap">
            <h2 className="text-lg font-bold text-white flex items-center space-x-2">
              <span>
                {selectedGroupId !== 'all' && activeGroup
                  ? `Matches in "${activeGroup.name}"`
                  : 'Search Matches'}
              </span>
            </h2>

            {hasSearched && (
              <span className="text-xs text-blue-400 font-normal">
                ({displayedResults.length} {displayedResults.length === 1 ? 'scene' : 'scenes'}
                {selectedSegmentId !== 'all' && ` matching ${activeSegment?.label}`})
              </span>
            )}

            {selectedSegmentId !== 'all' && activeSegment && (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-500/15 border border-indigo-500/30 text-indigo-300">
                <span>Filter: {activeSegment.label}</span>
                <button
                  onClick={() => setSelectedSegmentId('all')}
                  className="hover:text-white ml-0.5"
                  title="Clear segment filter"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}
          </div>
        </div>

        {isSearching ? (
          <div className="space-y-6 animate-in fade-in duration-200">
            {/* Searching status banner */}
            <div className="glass-panel p-6 rounded-3xl border border-blue-500/30 bg-blue-950/20 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-3.5">
                <div className="w-10 h-10 rounded-2xl bg-blue-500/15 border border-blue-500/30 flex items-center justify-center shrink-0">
                  <RefreshCw className="w-5 h-5 text-blue-400 animate-spin" />
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-white flex items-center gap-2">
                    <span>
                      {activeHistoryId
                        ? 'Loading Saved Search Results...'
                        : 'Searching Video Library with AI...'}
                    </span>
                    <span className="w-2 h-2 rounded-full bg-blue-400 animate-ping" />
                  </h4>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {activeHistoryId
                      ? 'Retrieving verified scenes, matched clips, and storyboard alignment from database.'
                      : 'Generating multimodal vector embeddings and computing similarity across indexed scenes.'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 text-xs font-mono text-blue-400 bg-blue-500/10 border border-blue-500/20 px-3 py-1.5 rounded-xl shrink-0">
                <Sparkles className="w-3.5 h-3.5 animate-pulse text-cyan-400" />
                <span>
                  {activeHistoryId ? 'Loading Saved Matches' : 'Vector Search in Progress'}
                </span>
              </div>
            </div>

            {/* Skeleton Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={i}
                  className="glass-panel p-5 rounded-2xl border border-slate-800 space-y-4 animate-pulse"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-2 flex-1">
                      <div className="h-4 bg-slate-800 rounded-md w-1/3" />
                      <div className="h-5 bg-slate-800 rounded-md w-1/2" />
                    </div>
                    <div className="h-6 bg-slate-800 rounded-full w-20" />
                  </div>
                  <div className="space-y-2">
                    <div className="h-3.5 bg-slate-800/80 rounded w-full" />
                    <div className="h-3.5 bg-slate-800/80 rounded w-5/6" />
                    <div className="h-3.5 bg-slate-800/80 rounded w-4/6" />
                  </div>
                  <div className="pt-3 border-t border-slate-800/60 flex items-center justify-between">
                    <div className="h-8 bg-slate-800 rounded-lg w-28" />
                    <div className="h-8 bg-slate-800 rounded-lg w-28" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : !hasSearched ? (
          <div className="p-12 rounded-3xl bg-slate-900/40 border border-slate-800 text-center space-y-3">
            <Search className="w-10 h-10 text-slate-600 mx-auto" />
            <h4 className="text-slate-300 font-semibold">Search across all videos or a specific TV show</h4>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              Query millions of frames with zero manual tagging. Enter multi-sentence prompts to automatically map clips to story segments.
            </p>
          </div>
        ) : displayedResults.length === 0 ? (
          <div className="p-10 rounded-3xl bg-slate-900/40 border border-slate-800 text-center space-y-3">
            <AlertCircle className="w-10 h-10 text-amber-500 mx-auto" />
            <h4 className="text-slate-300 font-semibold">
              {selectedSegmentId !== 'all'
                ? `No clips matched specifically for ${activeSegment?.label}`
                : selectedGroupId !== 'all'
                ? `No scenes matched within "${activeGroup?.name || 'this group'}"`
                : 'No scenes matched across any video'}
            </h4>
            <p className="text-xs text-slate-500">
              {selectedSegmentId !== 'all' ? (
                <button
                  onClick={() => setSelectedSegmentId('all')}
                  className="text-blue-400 hover:underline font-medium"
                >
                  Click here to view clips from all segments ({results.length} total)
                </button>
              ) : (
                'Try adjusting your query or selecting "All Shows & Videos".'
              )}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {displayedResults.map((res, index) => {
              const start = res.isVerified ? res.verifiedStartTime : res.startTime;
              const end = res.isVerified ? res.verifiedEndTime : res.endTime;

              return (
                <div
                  key={index}
                  className="glass-panel p-5 rounded-2xl border border-slate-800 hover:border-slate-700 transition-all flex flex-col justify-between space-y-4"
                >
                  <div className="space-y-3">
                    {/* Video Tag & Timestamps */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="space-y-1.5 min-w-0">
                        <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                          <Link
                            href={`/videos/${res.videoId}?t=${start}&end=${end}&sceneId=${res.id || ''}`}
                            className="flex items-center space-x-1.5 text-xs text-blue-400 hover:text-blue-300 font-medium group truncate"
                            title="Open in Studio positioned at this clip"
                          >
                            <Film className="w-3.5 h-3.5 shrink-0" />
                            <span className="truncate max-w-[200px]">{res.videoName}</span>
                            <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform shrink-0" />
                          </Link>

                          {res.groupName && (
                            <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-md bg-indigo-500/15 border border-indigo-500/30 text-indigo-300 text-[10px] font-semibold shrink-0">
                              <Folder className="w-2.5 h-2.5 text-indigo-400" />
                              <span>{res.groupName}</span>
                            </span>
                          )}
                        </div>

                        <button
                          type="button"
                          onClick={() => handleOpenPreview(index)}
                          className="flex items-center space-x-2 mt-1 hover:text-blue-400 group text-left transition-colors cursor-pointer"
                          title="Click to preview this scene"
                        >
                          <span className="font-mono text-base font-bold text-white group-hover:text-blue-400 transition-colors">
                            {formatTime(start)} → {formatTime(end)}
                          </span>
                          <span className="text-xs text-slate-400 font-mono">({res.duration}s)</span>
                        </button>
                      </div>

                      <div className="text-right shrink-0">
                        <span className="px-2 py-0.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-semibold block">
                          Match: {res.similarityScore}%
                        </span>
                        {res.isVerified && (
                          <span className="text-[10px] text-emerald-400 font-semibold mt-1 block">
                            AI Verified
                          </span>
                        )}
                      </div>
                    </div>

                    <p className="text-sm text-slate-200 leading-relaxed">
                      {res.description}
                    </p>

                    {/* Matched Prompt Segments (1-Line default, expandable) */}
                    {res.segmentMatches && res.segmentMatches.length > 0 && (
                      <MatchedSegmentsAccordion
                        segmentMatches={res.segmentMatches}
                        selectedSegmentId={selectedSegmentId}
                        onSelectSegment={setSelectedSegmentId}
                      />
                    )}

                    {res.isVerified && res.verificationReason && (
                      <div className="p-2.5 rounded-lg bg-slate-950/70 border border-slate-800 text-xs text-slate-400 italic">
                        "{res.verificationReason}"
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="pt-3 border-t border-slate-800 flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleOpenPreview(index)}
                        className="flex items-center space-x-1.5 px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-md shadow-blue-500/20 transition-all hover:scale-[1.02] active:scale-[0.98]"
                        title="Preview this scene in popup player without leaving search"
                      >
                        <Play className="w-3.5 h-3.5 fill-current" />
                        <span>Preview Scene</span>
                      </button>

                      <Link
                        href={`/videos/${res.videoId}?t=${start}&end=${end}&sceneId=${res.id || ''}`}
                        className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-medium transition-colors"
                        title="Open full video studio positioned at this clip"
                      >
                        <Film className="w-3 h-3" />
                        <span>Studio</span>
                      </Link>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleOpenClip(res)}
                      className="flex items-center space-x-1.5 px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-md transition-all hover:scale-[1.02] active:scale-[0.98]"
                    >
                      <Scissors className="w-3.5 h-3.5" />
                      <span>Create Clip</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Global Clip Modal */}
      {activeClipData && (
        <ClipModal
          isOpen={clipModalOpen}
          onClose={() => {
            setClipModalOpen(false);
            setActiveClipData(null);
          }}
          videoId={activeClipData.videoId}
          initialStart={activeClipData.isVerified ? activeClipData.verifiedStartTime : activeClipData.startTime}
          initialEnd={activeClipData.isVerified ? activeClipData.verifiedEndTime : activeClipData.endTime}
          sceneId={activeClipData.sceneId}
          query={query}
          isAiVerified={activeClipData.isVerified}
        />
      )}

      {/* Scene Preview Video Modal with Carousel Navigation */}
      <ScenePreviewModal
        isOpen={previewModalOpen}
        onClose={() => setPreviewModalOpen(false)}
        scenes={displayedResults}
        currentIndex={previewSceneIndex}
        onNavigateIndex={(newIdx) => setPreviewSceneIndex(newIdx)}
        onOpenClipModal={(sc) => handleOpenClip(sc)}
      />

      {/* Semantic Search History Modal */}
      <SearchHistoryModal
        isOpen={historyModalOpen}
        onClose={() => {
          setHistoryModalOpen(false);
          fetchHistoryCount();
        }}
        onSelectSearch={handleRestoreSearch}
        currentSearchId={activeHistoryId}
      />
    </div>
  );
}

export default function GlobalSearchPage() {
  return (
    <Suspense fallback={<div className="p-12 text-center text-slate-400">Loading cross-video search...</div>}>
      <GlobalSearchContent />
    </Suspense>
  );
}


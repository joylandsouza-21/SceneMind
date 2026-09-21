'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
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
  X
} from 'lucide-react';
import { formatTime } from '@/components/VideoPlayer';
import ClipModal from '@/components/ClipModal';
import GroupSelectDropdown from '@/components/GroupSelectDropdown';

export default function GlobalSearchPage() {
  const [query, setQuery] = useState('');
  const [groups, setGroups] = useState<any[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string>('all');
  const [isSearching, setIsSearching] = useState(false);
  const [results, setResults] = useState<any[]>([]);
  const [hasSearched, setHasSearched] = useState(false);

  // Clip modal state
  const [clipModalOpen, setClipModalOpen] = useState(false);
  const [activeClipData, setActiveClipData] = useState<any | null>(null);

  useEffect(() => {
    fetch('/api/groups')
      .then((res) => res.json())
      .then((data) => setGroups(data.groups || []))
      .catch((err) => console.error('Failed to load groups:', err));
  }, []);

  const samplePrompts = [
    'Find all fight scenes',
    'Find two people arguing',
    'Find red car or driving',
    'Find person walking a dog',
    'Find scene where someone enters a building',
    'Find conversations in a room',
  ];

  const handleSearch = async (e?: React.FormEvent, customQuery?: string, customGroup?: string) => {
    if (e) e.preventDefault();
    const q = customQuery !== undefined ? customQuery : query;
    const g = customGroup !== undefined ? customGroup : selectedGroupId;
    if (!q || q.trim() === '') return;

    if (customQuery !== undefined) setQuery(customQuery);
    if (customGroup !== undefined) setSelectedGroupId(customGroup);
    setIsSearching(true);
    setHasSearched(true);

    try {
      const res = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: q,
          autoVerify: true,
          limit: 20,
          groupId: g !== 'all' ? g : undefined,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        setResults(data.results || []);
      }
    } catch (err) {
      console.error('Global search error:', err);
    } finally {
      setIsSearching(false);
    }
  };

  const handleOpenClip = (res: any) => {
    setActiveClipData(res);
    setClipModalOpen(true);
  };

  const activeGroup = groups.find((g) => g.id === selectedGroupId);

  return (
    <div className="space-y-8 animate-in fade-in">
      {/* Header */}
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-white flex items-center space-x-3">
          <Search className="w-6 h-6 text-blue-400" />
          <span>Cross-Video Semantic Search</span>
        </h1>
        <p className="text-slate-400 text-sm mt-1">
          Search across every indexed video or filter queries inside a specific TV show or episode group.
        </p>
      </div>

      {/* Query Bar & Group Filter */}
      <div className="glass-panel p-6 rounded-3xl border border-slate-800 space-y-4">
        <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-3">
          {/* Group Scope Selector */}
          <GroupSelectDropdown
            groups={groups}
            selectedGroupId={selectedGroupId}
            onSelectGroup={(id) => {
              setSelectedGroupId(id);
              if (query.trim()) {
                handleSearch(undefined, undefined, id);
              }
            }}
            allLabel="All Shows & Videos"
            allValue="all"
            icon="film"
            className="shrink-0 min-w-[210px]"
          />

          {/* Search Query Input */}
          <div className="relative flex-1">
            <Search className="w-5 h-5 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={
                activeGroup
                  ? `Search inside "${activeGroup.name}" episodes (e.g. "fight scene", "dialogue")...`
                  : 'Search all videos (e.g. "Find all fight scenes", "two people arguing")...'
              }
              className="w-full pl-12 pr-4 py-3.5 bg-slate-950/80 border border-slate-700/80 rounded-2xl text-white placeholder-slate-500 text-sm focus:outline-none focus:border-blue-500 shadow-inner"
            />
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isSearching || !query.trim()}
            className="px-6 py-3.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold text-sm rounded-2xl shadow-lg shadow-blue-500/20 transition-all flex items-center justify-center space-x-2 shrink-0"
          >
            {isSearching ? <span className="animate-spin">🌀</span> : <Search className="w-4 h-4" />}
            <span>Search</span>
          </button>
        </form>

        {/* Active Scope Filter Indicator */}
        {selectedGroupId !== 'all' && (
          <div className="flex items-center space-x-2 text-xs text-indigo-300 bg-indigo-950/40 border border-indigo-500/30 rounded-xl px-3 py-1.5 w-fit">
            <Folder className="w-3.5 h-3.5 text-indigo-400" />
            <span>
              Searching exclusively within <strong>{activeGroup?.name}</strong>
            </span>
            <button
              onClick={() => {
                setSelectedGroupId('all');
                if (query.trim()) {
                  handleSearch(undefined, undefined, 'all');
                }
              }}
              className="hover:text-white p-0.5 rounded-full hover:bg-indigo-800/50 transition-colors ml-1"
              title="Clear group filter"
            >
              <X className="w-3.5 h-3.5" />
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
              className="px-3 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-white text-xs transition-colors"
            >
              "{p}"
            </button>
          ))}
        </div>
      </div>

      {/* Results List */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-white flex items-center space-x-2">
            <span>
              {selectedGroupId !== 'all' && activeGroup
                ? `Matches in "${activeGroup.name}"`
                : 'Global Search Matches'}
            </span>
            {hasSearched && (
              <span className="text-xs text-blue-400 font-normal">
                ({results.length} scenes found)
              </span>
            )}
          </h2>
        </div>

        {!hasSearched ? (
          <div className="p-12 rounded-3xl bg-slate-900/40 border border-slate-800 text-center space-y-3">
            <Search className="w-10 h-10 text-slate-600 mx-auto" />
            <h4 className="text-slate-300 font-semibold">Search across all videos or a specific TV show</h4>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              Query millions of frames with zero manual tagging. Select a group above to search within a show.
            </p>
          </div>
        ) : results.length === 0 ? (
          <div className="p-10 rounded-3xl bg-slate-900/40 border border-slate-800 text-center space-y-3">
            <AlertCircle className="w-10 h-10 text-amber-500 mx-auto" />
            <h4 className="text-slate-300 font-semibold">
              {selectedGroupId !== 'all'
                ? `No scenes matched within "${activeGroup?.name || 'this group'}"`
                : 'No scenes matched across any video'}
            </h4>
            <p className="text-xs text-slate-500">
              Try adjusting your query or selecting "All Shows & Videos".
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {results.map((res, index) => {
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
                            href={`/videos/${res.videoId}`}
                            className="flex items-center space-x-1.5 text-xs text-blue-400 hover:text-blue-300 font-medium group truncate"
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

                        <div className="flex items-center space-x-2 mt-1">
                          <span className="font-mono text-base font-bold text-white">
                            {formatTime(start)} → {formatTime(end)}
                          </span>
                          <span className="text-xs text-slate-400 font-mono">({res.duration}s)</span>
                        </div>
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

                    {res.isVerified && res.verificationReason && (
                      <div className="p-2.5 rounded-lg bg-slate-950/70 border border-slate-800 text-xs text-slate-400 italic">
                        "{res.verificationReason}"
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="pt-3 border-t border-slate-800 flex items-center justify-between">
                    <Link
                      href={`/videos/${res.videoId}`}
                      className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-medium transition-colors"
                    >
                      <Play className="w-3 h-3" />
                      <span>Open in Studio</span>
                    </Link>

                    <button
                      onClick={() => handleOpenClip(res)}
                      className="flex items-center space-x-1.5 px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-md transition-all"
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
    </div>
  );
}

'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import {
  Search,
  Sparkles,
  Scissors,
  Play,
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Clock,
  ExternalLink,
  ChevronRight,
  ShieldCheck
} from 'lucide-react';
import VideoPlayer, { VideoPlayerRef, formatTime } from '@/components/VideoPlayer';
import ClipModal from '@/components/ClipModal';

export default function VideoSemanticSearchPage({ params }: { params: { id: string } }) {
  const [video, setVideo] = useState<any | null>(null);
  const [query, setQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [results, setResults] = useState<any[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [activePreviewRange, setActivePreviewRange] = useState<{ start: number; end: number } | null>(null);

  // Clip modal state
  const [clipModalOpen, setClipModalOpen] = useState(false);
  const [clipStart, setClipStart] = useState(0);
  const [clipEnd, setClipEnd] = useState(10);
  const [clipSceneId, setClipSceneId] = useState<string | undefined>(undefined);
  const [clipQuery, setClipQuery] = useState<string | undefined>(undefined);
  const [clipVerified, setClipVerified] = useState(false);

  const playerRef = useRef<VideoPlayerRef | null>(null);

  const samplePrompts = [
    'Find the fight scene',
    'Show me where two people are arguing',
    'Find the red car driving',
    'Find the scene where the man enters the building',
    'Find all scenes involving a dog',
    'Find two people having coffee in the kitchen',
  ];

  useEffect(() => {
    fetch(`/api/videos/${params.id}`)
      .then((res) => res.json())
      .then((data) => setVideo(data.video))
      .catch(console.error);
  }, [params.id]);

  const handleSearch = async (e?: React.FormEvent, customQuery?: string) => {
    if (e) e.preventDefault();
    const q = customQuery !== undefined ? customQuery : query;
    if (!q || q.trim() === '') return;

    if (customQuery !== undefined) setQuery(customQuery);
    setIsSearching(true);
    setHasSearched(true);

    try {
      const res = await fetch(`/api/videos/${params.id}/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: q,
          autoVerify: true,
          limit: 10,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        setResults(data.results || []);
        // Automatically seek player to top match if available
        if (data.results && data.results.length > 0) {
          const top = data.results[0];
          seekToResult(top);
        }
      }
    } catch (err) {
      console.error('Search request failed:', err);
    } finally {
      setIsSearching(false);
    }
  };

  const seekToResult = (res: any) => {
    const target = res.isVerified ? res.verifiedStartTime : res.startTime;
    const end = res.isVerified ? res.verifiedEndTime : res.endTime;
    setActivePreviewRange({ start: target, end });
    if (playerRef.current) {
      playerRef.current.seekTo(target);
    }
  };

  const handleCreateClipFromMatch = (res: any) => {
    const start = res.isVerified ? res.verifiedStartTime : res.startTime;
    const end = res.isVerified ? res.verifiedEndTime : res.endTime;
    setClipStart(start);
    setClipEnd(end);
    setClipSceneId(res.sceneId);
    setClipQuery(query);
    setClipVerified(res.isVerified);
    setClipModalOpen(true);
  };

  return (
    <div className="space-y-8 animate-in fade-in">
      {/* Navigation Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <Link
            href={`/videos/${params.id}`}
            className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-white flex items-center space-x-2">
              <Sparkles className="w-5 h-5 text-blue-400" />
              <span>Semantic Video Search</span>
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">
              Searching: <span className="text-slate-200 font-semibold">{video?.filename}</span>
            </p>
          </div>
        </div>
      </div>

      {/* Natural Language Search Input Bar */}
      <div className="glass-panel p-6 rounded-3xl border border-slate-800 space-y-4">
        <form onSubmit={handleSearch} className="flex gap-2">
          <div className="relative flex-1">
            <Search className="w-5 h-5 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder='Try "Find the fight scene", "car accident", "someone walking a dog"...'
              className="w-full pl-12 pr-4 py-3.5 bg-slate-950/80 border border-slate-700/80 rounded-2xl text-white placeholder-slate-500 text-sm focus:outline-none focus:border-blue-500 transition-all shadow-inner"
            />
          </div>
          <button
            type="submit"
            disabled={isSearching || !query.trim()}
            className="px-6 py-3.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold text-sm rounded-2xl shadow-lg shadow-blue-500/20 transition-all flex items-center space-x-2"
          >
            {isSearching ? (
              <span className="animate-spin">🌀</span>
            ) : (
              <Search className="w-4 h-4" />
            )}
            <span>Search</span>
          </button>
        </form>

        {/* Suggested Quick Prompts */}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <span className="text-xs text-slate-500 font-medium">Suggestions:</span>
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

      {/* Two Column Workspace: Video Player (Left) & Results (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Column: Player & Active Preview */}
        <div className="lg:col-span-6 space-y-4 sticky top-20">
          <div className="glass-panel p-4 rounded-3xl border border-slate-800 space-y-3">
            <h3 className="text-sm font-semibold text-white flex items-center justify-between">
              <span>Seek & Verification Player</span>
              {activePreviewRange && (
                <span className="text-xs font-mono text-cyan-400">
                  Target: {formatTime(activePreviewRange.start)} → {formatTime(activePreviewRange.end)}
                </span>
              )}
            </h3>

            {video && (
              <VideoPlayer
                ref={playerRef}
                src={`/api/media/${video.storagePath}`}
                poster={`/api/media/thumbnails/thumb_${video.id}.jpg`}
                onTimeUpdate={(t) => setCurrentTime(t)}
                activeSceneRange={activePreviewRange}
              />
            )}
          </div>
        </div>

        {/* Right Column: Search Results */}
        <div className="lg:col-span-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-white flex items-center space-x-2">
              <span>Matching Video Scenes</span>
              {hasSearched && (
                <span className="text-xs text-blue-400 font-normal">
                  ({results.length} found)
                </span>
              )}
            </h2>
          </div>

          {!hasSearched ? (
            <div className="p-12 rounded-3xl bg-slate-900/40 border border-slate-800 text-center space-y-3">
              <Search className="w-10 h-10 text-slate-600 mx-auto" />
              <h4 className="text-slate-300 font-semibold">Ready to search</h4>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                Type any natural language description or click one of the suggested prompts above.
              </p>
            </div>
          ) : results.length === 0 ? (
            <div className="p-10 rounded-3xl bg-slate-900/40 border border-slate-800 text-center space-y-3">
              <AlertCircle className="w-10 h-10 text-amber-500 mx-auto" />
              <h4 className="text-slate-300 font-semibold">No scenes matched your prompt</h4>
              <p className="text-xs text-slate-500">
                Try broader semantic keywords or check that the video has finished indexing.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {results.map((res, index) => {
                const targetStart = res.isVerified ? res.verifiedStartTime : res.startTime;
                const targetEnd = res.isVerified ? res.verifiedEndTime : res.endTime;

                return (
                  <div
                    key={res.sceneId || index}
                    className="glass-panel p-5 rounded-2xl border border-slate-800 hover:border-slate-700 transition-all space-y-3"
                  >
                    {/* Result Header */}
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center space-x-2">
                          <span className="font-mono text-base font-bold text-white">
                            {formatTime(targetStart)} — {formatTime(targetEnd)}
                          </span>
                          <span className="text-xs text-slate-400 font-mono">
                            ({res.duration}s)
                          </span>
                        </div>
                        <div className="flex items-center space-x-2 mt-1">
                          <span className="px-2 py-0.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-semibold">
                            Similarity: {res.similarityScore}%
                          </span>
                          {res.isVerified && (
                            <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold flex items-center space-x-1">
                              <ShieldCheck className="w-3 h-3" />
                              <span>AI Verified ({res.confidenceScore}%)</span>
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center space-x-2">
                        <button
                          onClick={() => seekToResult(res)}
                          className="flex items-center space-x-1.5 px-3 py-1.5 bg-blue-600/20 hover:bg-blue-600 text-blue-300 hover:text-white text-xs font-semibold rounded-lg border border-blue-500/30 transition-all"
                        >
                          <Play className="w-3.5 h-3.5 fill-current" />
                          <span>Preview</span>
                        </button>
                        <button
                          onClick={() => handleCreateClipFromMatch(res)}
                          className="flex items-center space-x-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg shadow-md transition-all"
                        >
                          <Scissors className="w-3.5 h-3.5" />
                          <span>Create Clip</span>
                        </button>
                      </div>
                    </div>

                    {/* Scene Description */}
                    <p className="text-sm text-slate-200 leading-relaxed">
                      {res.description}
                    </p>

                    {/* AI Verification Reason */}
                    {res.isVerified && res.verificationReason && (
                      <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800/90 text-xs space-y-1">
                        <div className="flex items-center space-x-1 text-emerald-400 font-medium">
                          <Sparkles className="w-3.5 h-3.5" />
                          <span>AI Boundary Justification:</span>
                        </div>
                        <p className="text-slate-300 italic">{res.verificationReason}</p>
                        {res.startTime !== res.verifiedStartTime && (
                          <div className="text-[11px] text-slate-500 font-mono pt-1">
                            Candidate scene window: {formatTime(res.startTime)} → {formatTime(res.endTime)}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Clip Creation Modal */}
      <ClipModal
        isOpen={clipModalOpen}
        onClose={() => setClipModalOpen(false)}
        videoId={params.id}
        initialStart={clipStart}
        initialEnd={clipEnd}
        sceneId={clipSceneId}
        query={clipQuery}
        isAiVerified={clipVerified}
      />
    </div>
  );
}

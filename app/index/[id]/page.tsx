'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import {
  Layers,
  ArrowLeft,
  Search,
  Filter,
  Trash2,
  RefreshCw,
  Play,
  Scissors,
  CheckCircle2,
  Clock,
  MapPin,
  Users,
  Sliders
} from 'lucide-react';
import VideoPlayer, { VideoPlayerRef, formatTime } from '@/components/VideoPlayer';
import TimelineBar from '@/components/TimelineBar';
import ClipModal from '@/components/ClipModal';
import { VideoScene } from '@/lib/db/types';

export default function IndexExplorerPage({ params }: { params: { id: string } }) {
  const [video, setVideo] = useState<any | null>(null);
  const [scenes, setScenes] = useState<VideoScene[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchFilter, setSearchFilter] = useState('');
  const [selectedScene, setSelectedScene] = useState<VideoScene | null>(null);
  const [currentTime, setCurrentTime] = useState(0);

  // Clip modal state
  const [clipModalOpen, setClipModalOpen] = useState(false);
  const [clipStart, setClipStart] = useState(0);
  const [clipEnd, setClipEnd] = useState(10);
  const [clipSceneId, setClipSceneId] = useState<string | undefined>(undefined);

  const playerRef = useRef<VideoPlayerRef | null>(null);

  const fetchData = async () => {
    try {
      const res = await fetch(`/api/videos/${params.id}`);
      if (res.ok) {
        const data = await res.json();
        setVideo(data.video);
        setScenes(data.scenes || []);
        if (data.scenes && data.scenes.length > 0 && !selectedScene) {
          setSelectedScene(data.scenes[0]);
        }
      }
    } catch (e) {
      console.error('Error fetching index:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [params.id]);

  const handleSelectScene = (scene: VideoScene) => {
    setSelectedScene(scene);
    if (playerRef.current) {
      playerRef.current.seekTo(scene.startTime);
    }
  };

  const handleReindexSingleScene = async (sceneId: string) => {
    try {
      const res = await fetch(`/api/scenes/${sceneId}`, { method: 'POST' });
      if (res.ok) {
        fetchData();
      }
    } catch (e) {
      console.error('Re-index error:', e);
    }
  };

  const handleDeleteSingleScene = async (sceneId: string) => {
    if (!confirm('Are you sure you want to delete this scene?')) return;
    try {
      const res = await fetch(`/api/scenes/${sceneId}`, { method: 'DELETE' });
      if (res.ok) {
        setScenes((prev) => prev.filter((s) => s.id !== sceneId));
        if (selectedScene?.id === sceneId) setSelectedScene(null);
      }
    } catch (e) {
      console.error('Delete scene error:', e);
    }
  };

  const filteredScenes = scenes.filter((s) => {
    if (!searchFilter.trim()) return true;
    const q = searchFilter.toLowerCase();
    return (
      s.description.toLowerCase().includes(q) ||
      s.location.toLowerCase().includes(q) ||
      s.actions.some((a) => a.toLowerCase().includes(q)) ||
      s.objects.some((o) => o.toLowerCase().includes(q)) ||
      s.people.some((p) => p.toLowerCase().includes(q))
    );
  });

  return (
    <div className="space-y-8 animate-in fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center space-x-3">
          <Link
            href={`/videos/${params.id}`}
            className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-white flex items-center space-x-2">
              <Sliders className="w-5 h-5 text-indigo-400" />
              <span>Visual Index Explorer</span>
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">
              Inspecting scene vector segmentation for: <span className="text-slate-200">{video?.filename}</span>
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          <Link
            href={`/videos/${params.id}/search`}
            className="flex items-center space-x-2 px-3.5 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-xl shadow-md transition-all"
          >
            <Search className="w-3.5 h-3.5" />
            <span>Search Video</span>
          </Link>
        </div>
      </div>

      {/* Visual Continuous Timeline Strip */}
      {video && (
        <div className="glass-panel p-5 rounded-3xl border border-slate-800 space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
              Interactive Timeline Map
            </span>
            <span className="text-xs text-slate-500">Click any block to jump player</span>
          </div>

          <TimelineBar
            duration={video.duration}
            currentTime={currentTime}
            scenes={scenes}
            activeSceneId={selectedScene?.id}
            onSelectScene={handleSelectScene}
            onSeek={(t) => {
              if (playerRef.current) {
                playerRef.current.seekTo(t);
              }
            }}
          />
        </div>
      )}

      {/* Two Column Layout: Player / Inspector (Left) & Scene List (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Column: Video Player & Scene Details */}
        <div className="lg:col-span-6 space-y-6 sticky top-20">
          {video && (
            <div className="glass-panel p-4 rounded-3xl border border-slate-800 space-y-3">
              <VideoPlayer
                ref={playerRef}
                src={`/api/media/${video.storagePath}`}
                poster={`/api/media/thumbnails/thumb_${video.id}.jpg`}
                onTimeUpdate={(t) => setCurrentTime(t)}
                activeSceneRange={
                  selectedScene
                    ? { start: selectedScene.startTime, end: selectedScene.endTime }
                    : null
                }
              />
            </div>
          )}

          {/* Detailed Selected Scene Inspector */}
          {selectedScene && (
            <div className="glass-panel p-6 rounded-3xl border border-indigo-500/40 space-y-4 shadow-xl">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-xs text-indigo-400 font-semibold uppercase tracking-wider">
                    Selected Scene #{selectedScene.sceneNumber}
                  </span>
                  <div className="flex items-center space-x-2 mt-1">
                    <span className="font-mono text-base font-bold text-white">
                      {formatTime(selectedScene.startTime)} → {formatTime(selectedScene.endTime)}
                    </span>
                    <span className="text-xs text-slate-400 font-mono">
                      ({selectedScene.duration}s)
                    </span>
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  <button
                    onClick={() =>
                      handleReindexSingleScene(selectedScene.id)
                    }
                    className="p-2 rounded-lg bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 transition-colors"
                    title="Re-generate embedding for this scene"
                  >
                    <RefreshCw className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => {
                      setClipStart(selectedScene.startTime);
                      setClipEnd(selectedScene.endTime);
                      setClipSceneId(selectedScene.id);
                      setClipModalOpen(true);
                    }}
                    className="flex items-center space-x-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg shadow-md transition-all"
                  >
                    <Scissors className="w-3.5 h-3.5" />
                    <span>Clip Scene</span>
                  </button>
                </div>
              </div>

              <p className="text-sm text-slate-200 leading-relaxed bg-slate-950/60 p-4 rounded-xl border border-slate-800">
                {selectedScene.description}
              </p>

              {/* Vector & Metadata Inspector */}
              <div className="space-y-2 text-xs">
                <div className="grid grid-cols-2 gap-2">
                  <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800">
                    <span className="text-slate-500 block text-[11px]">Embedding Status</span>
                    <span className="text-emerald-400 font-mono font-medium flex items-center space-x-1 mt-0.5">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>{selectedScene.embeddingId ? 'Embedded in Vector DB' : 'Pending'}</span>
                    </span>
                  </div>

                  <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800">
                    <span className="text-slate-500 block text-[11px]">AI Detection Confidence</span>
                    <span className="text-blue-400 font-mono font-semibold mt-0.5 block">
                      {Math.round(selectedScene.confidence * 100)}%
                    </span>
                  </div>
                </div>

                <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800 space-y-1.5">
                  <span className="text-slate-500 block text-[11px]">Actions Detected</span>
                  <div className="flex flex-wrap gap-1">
                    {selectedScene.actions.map((act, i) => (
                      <span key={i} className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 text-[11px]">
                        {act}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800 space-y-1.5">
                  <span className="text-slate-500 block text-[11px]">Objects Detected</span>
                  <div className="flex flex-wrap gap-1">
                    {selectedScene.objects.map((obj, i) => (
                      <span key={i} className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 text-[11px]">
                        {obj}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Filterable Scene List */}
        <div className="lg:col-span-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-white flex items-center space-x-2">
              <Layers className="w-4 h-4 text-indigo-400" />
              <span>Scenes ({filteredScenes.length} / {scenes.length})</span>
            </h2>
          </div>

          {/* Filter Bar */}
          <div className="relative">
            <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              placeholder="Filter scenes by keyword, object, action..."
              className="w-full pl-10 pr-4 py-2 bg-slate-950/90 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
            />
          </div>

          {/* Scene List Cards */}
          <div className="space-y-3">
            {filteredScenes.map((scene) => {
              const isSelected = selectedScene?.id === scene.id;

              return (
                <div
                  key={scene.id}
                  onClick={() => handleSelectScene(scene)}
                  className={`p-4 rounded-2xl border transition-all cursor-pointer ${
                    isSelected
                      ? 'border-indigo-500 bg-indigo-950/30 shadow-lg shadow-indigo-500/10'
                      : 'border-slate-800/80 bg-slate-900/60 hover:bg-slate-900 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="font-bold text-white text-xs">
                          Scene #{scene.sceneNumber}
                        </span>
                        <span className="font-mono text-blue-400 text-xs font-medium">
                          {formatTime(scene.startTime)} → {formatTime(scene.endTime)}
                        </span>
                        <span className="text-[11px] text-slate-500">
                          ({scene.duration}s)
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center space-x-1" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => handleDeleteSingleScene(scene.id)}
                        className="p-1 rounded text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                        title="Delete scene"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <p className="text-xs text-slate-300 line-clamp-2 mt-2 leading-relaxed">
                    {scene.description}
                  </p>

                  <div className="flex items-center gap-2 mt-3 pt-2 border-t border-slate-800/60 text-[11px] text-slate-500">
                    {scene.location && (
                      <span className="flex items-center space-x-1">
                        <MapPin className="w-3 h-3" />
                        <span>{scene.location}</span>
                      </span>
                    )}
                    <span className="ml-auto font-mono text-emerald-400">
                      {Math.round(scene.confidence * 100)}% conf
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Clip Modal */}
      {video && (
        <ClipModal
          isOpen={clipModalOpen}
          onClose={() => setClipModalOpen(false)}
          videoId={video.id}
          initialStart={clipStart}
          initialEnd={clipEnd}
          sceneId={clipSceneId}
        />
      )}
    </div>
  );
}

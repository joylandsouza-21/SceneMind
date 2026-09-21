'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import {
  Film,
  Search,
  Scissors,
  Layers,
  Sparkles,
  RefreshCw,
  Clock,
  MapPin,
  Users,
  Activity,
  CheckCircle2,
  Trash2,
  ArrowLeft,
  Sliders,
  ExternalLink
} from 'lucide-react';
import VideoPlayer, { VideoPlayerRef, formatTime } from '@/components/VideoPlayer';
import TimelineBar from '@/components/TimelineBar';
import ClipModal from '@/components/ClipModal';
import { VideoScene } from '@/lib/db/types';

export default function VideoDetailPage({ params }: { params: { id: string } }) {
  const [video, setVideo] = useState<any | null>(null);
  const [scenes, setScenes] = useState<VideoScene[]>([]);
  const [clips, setClips] = useState<any[]>([]);
  const [jobs, setJobs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [activeScene, setActiveScene] = useState<VideoScene | null>(null);

  // Clip modal state
  const [clipModalOpen, setClipModalOpen] = useState(false);
  const [clipStart, setClipStart] = useState(0);
  const [clipEnd, setClipEnd] = useState(10);
  const [clipSceneId, setClipSceneId] = useState<string | undefined>(undefined);

  const playerRef = useRef<VideoPlayerRef | null>(null);

  const fetchVideoDetails = async () => {
    try {
      const res = await fetch(`/api/videos/${params.id}`);
      if (res.ok) {
        const data = await res.json();
        setVideo(data.video);
        setScenes(data.scenes || []);
        setClips(data.clips || []);
        setJobs(data.jobs || []);
      }
    } catch (e) {
      console.error('Error fetching video details:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchVideoDetails();
    const interval = setInterval(fetchVideoDetails, 4000);
    return () => clearInterval(interval);
  }, [params.id]);

  // Sync active scene based on video currentTime
  useEffect(() => {
    const matched = scenes.find(
      (s) => currentTime >= s.startTime && currentTime <= s.endTime
    );
    if (matched && matched.id !== activeScene?.id) {
      setActiveScene(matched);
    }
  }, [currentTime, scenes, activeScene]);

  const handleSeekScene = (scene: VideoScene) => {
    setActiveScene(scene);
    if (playerRef.current) {
      playerRef.current.seekTo(scene.startTime);
    }
  };

  const handleOpenClipModal = (start: number, end: number, sceneId?: string) => {
    setClipStart(start);
    setClipEnd(end);
    setClipSceneId(sceneId);
    setClipModalOpen(true);
  };

  const handleReindex = async () => {
    if (!confirm('Re-index this entire video with AI? Existing embeddings will be refreshed.')) {
      return;
    }
    try {
      await fetch(`/api/videos/${params.id}/reindex`, { method: 'POST' });
      fetchVideoDetails();
    } catch (e) {
      console.error('Reindex error:', e);
    }
  };

  const handleDeleteScene = async (sceneId: string) => {
    if (!confirm('Delete this scene from the index?')) return;
    try {
      const res = await fetch(`/api/scenes/${sceneId}`, { method: 'DELETE' });
      if (res.ok) {
        setScenes((prev) => prev.filter((s) => s.id !== sceneId));
      }
    } catch (e) {
      console.error('Delete scene error:', e);
    }
  };

  const handleReindexScene = async (sceneId: string) => {
    try {
      const res = await fetch(`/api/scenes/${sceneId}`, { method: 'POST' });
      if (res.ok) {
        fetchVideoDetails();
      }
    } catch (e) {
      console.error('Re-index scene error:', e);
    }
  };

  if (loading && !video) {
    return (
      <div className="py-20 text-center space-y-4">
        <Activity className="w-8 h-8 text-blue-500 animate-spin mx-auto" />
        <p className="text-sm text-slate-400">Loading video studio...</p>
      </div>
    );
  }

  if (!video) {
    return (
      <div className="py-20 text-center space-y-4">
        <Film className="w-12 h-12 text-slate-600 mx-auto" />
        <h2 className="text-xl font-semibold text-white">Video not found</h2>
        <Link href="/videos" className="text-sm text-blue-400 hover:underline">
          Return to video library
        </Link>
      </div>
    );
  }

  const activeJob = jobs.find((j) => j.status === 'processing' || j.status === 'pending');

  return (
    <div className="space-y-8 animate-in fade-in">
      {/* Top Header & Breadcrumb */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center space-x-3">
          <Link
            href="/videos"
            className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <div className="flex items-center space-x-2">
              <h1 className="text-xl sm:text-2xl font-bold text-white truncate max-w-lg">
                {video.filename}
              </h1>
              <span
                className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full ${
                  video.status === 'indexed'
                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                    : video.status === 'processing'
                    ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30 animate-pulse'
                    : 'bg-slate-700/50 text-slate-300'
                }`}
              >
                {video.status}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Duration: {formatTime(video.duration)} • {video.width}x{video.height} • {video.fps} FPS
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center space-x-3">
          <Link
            href={`/videos/${video.id}/search`}
            className="flex items-center space-x-2 px-4 py-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-semibold shadow-lg shadow-blue-500/20 transition-all hover:scale-105 active:scale-95"
          >
            <Search className="w-3.5 h-3.5" />
            <span>Semantic Search</span>
          </Link>

          <Link
            href={`/index/${video.id}`}
            className="flex items-center space-x-2 px-3.5 py-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 transition-colors"
            title="Open visual timeline and scene manager"
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>Index Explorer</span>
          </Link>

          <button
            onClick={handleReindex}
            className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-white transition-colors"
            title="Force re-run AI indexing"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Processing Status Banner */}
      {video.status === 'processing' && (
        <div className="p-5 rounded-2xl bg-slate-900/90 border border-amber-500/30 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2.5 text-amber-400 font-semibold text-sm">
              <Activity className="w-4 h-4 animate-spin" />
              <span>Indexing Video in Background...</span>
            </div>
            <span className="font-mono text-amber-400 text-sm font-bold">{video.processingProgress}%</span>
          </div>

          <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
            <div
              className="bg-amber-500 h-full rounded-full transition-all duration-300"
              style={{ width: `${video.processingProgress}%` }}
            />
          </div>

          <div className="flex flex-wrap items-center justify-between text-xs text-slate-400 pt-1">
            <span>Current Step: {activeJob?.currentStep || 'Extracting multimodal features...'}</span>
            <span>Scenes Analyzed: {scenes.length}</span>
          </div>
        </div>
      )}

      {/* Video Player & Visual Timeline */}
      <div className="space-y-4">
        <VideoPlayer
          ref={playerRef}
          src={`/api/media/${video.storagePath}`}
          poster={`/api/media/thumbnails/thumb_${video.id}.jpg`}
          onTimeUpdate={(t) => setCurrentTime(t)}
          activeSceneRange={
            activeScene ? { start: activeScene.startTime, end: activeScene.endTime } : null
          }
          onRequestClip={(t) => {
            const start = Math.max(0, t - 5);
            const end = Math.min(video.duration, t + 10);
            handleOpenClipModal(start, end, activeScene?.id);
          }}
        />

        {/* Visual Continuous Timeline Strip */}
        <TimelineBar
          duration={video.duration}
          currentTime={currentTime}
          scenes={scenes}
          activeSceneId={activeScene?.id}
          onSelectScene={handleSeekScene}
          onSeek={(t) => {
            if (playerRef.current) {
              playerRef.current.seekTo(t);
            }
          }}
        />
      </div>

      {/* Scene Index & Breakdown */}
      <div className="space-y-6 pt-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-white flex items-center space-x-2">
              <Layers className="w-5 h-5 text-indigo-400" />
              <span>Scene Index ({scenes.length})</span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Continuous visual segments detected and embedded into the vector store.
            </p>
          </div>
        </div>

        {scenes.length === 0 ? (
          <div className="p-10 rounded-2xl bg-slate-900/60 border border-slate-800 text-center space-y-3">
            <Layers className="w-10 h-10 text-slate-600 mx-auto" />
            <h4 className="text-slate-300 font-medium">No scenes indexed yet</h4>
            <p className="text-xs text-slate-500">
              Video indexing is either in progress or has not been triggered.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {scenes.map((scene) => {
              const isCurrent = activeScene?.id === scene.id;

              return (
                <div
                  key={scene.id}
                  className={`glass-panel p-5 rounded-2xl border transition-all duration-200 ${
                    isCurrent
                      ? 'border-blue-500/80 bg-blue-950/20 shadow-lg shadow-blue-500/10 scale-[1.01]'
                      : 'border-slate-800/80 hover:border-slate-700'
                  }`}
                >
                  {/* Scene Header */}
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="font-bold text-white text-sm">
                          Scene #{scene.sceneNumber}
                        </span>
                        <span className="font-mono text-blue-400 text-xs font-semibold bg-blue-500/10 px-2 py-0.5 rounded border border-blue-500/20">
                          {formatTime(scene.startTime)} → {formatTime(scene.endTime)}
                        </span>
                        <span className="text-[11px] text-slate-500 font-mono">
                          ({scene.duration}s)
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center space-x-1.5">
                      <button
                        onClick={() => handleSeekScene(scene)}
                        className="px-2.5 py-1 bg-blue-600/20 hover:bg-blue-600 text-blue-300 hover:text-white text-xs font-semibold rounded-lg border border-blue-500/30 transition-all"
                      >
                        Seek
                      </button>
                      <button
                        onClick={() =>
                          handleOpenClipModal(scene.startTime, scene.endTime, scene.id)
                        }
                        className="p-1.5 rounded-lg bg-indigo-500/10 text-indigo-400 hover:text-white hover:bg-indigo-600 transition-colors"
                        title="Create clip for this scene"
                      >
                        <Scissors className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Description */}
                  <p className="text-sm text-slate-200 mt-3 leading-relaxed">
                    {scene.description}
                  </p>

                  {/* Metadata Chips */}
                  <div className="mt-4 space-y-2 text-xs">
                    {scene.actions && scene.actions.length > 0 && (
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-slate-500 font-medium">Actions:</span>
                        {scene.actions.map((act, i) => (
                          <span
                            key={i}
                            className="px-2 py-0.5 rounded-md bg-slate-800 text-slate-300 text-[11px]"
                          >
                            {act}
                          </span>
                        ))}
                      </div>
                    )}

                    {scene.objects && scene.objects.length > 0 && (
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-slate-500 font-medium">Objects:</span>
                        {scene.objects.map((obj, i) => (
                          <span
                            key={i}
                            className="px-2 py-0.5 rounded-md bg-slate-800/60 text-slate-400 text-[11px]"
                          >
                            {obj}
                          </span>
                        ))}
                      </div>
                    )}

                    <div className="flex flex-wrap items-center gap-4 text-[11px] text-slate-400 pt-2 border-t border-slate-800/60">
                      {scene.location && (
                        <div className="flex items-center space-x-1">
                          <MapPin className="w-3 h-3 text-slate-500" />
                          <span>{scene.location}</span>
                        </div>
                      )}
                      {scene.people && scene.people.length > 0 && (
                        <div className="flex items-center space-x-1">
                          <Users className="w-3 h-3 text-slate-500" />
                          <span>{scene.people.join(', ')}</span>
                        </div>
                      )}
                      <div className="flex items-center space-x-1 ml-auto">
                        <span className="text-slate-500">Confidence:</span>
                        <span className="text-emerald-400 font-semibold font-mono">
                          {Math.round(scene.confidence * 100)}%
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Generated Clips for this Video */}
      {clips.length > 0 && (
        <div className="space-y-4 pt-6 border-t border-slate-800">
          <h2 className="text-lg font-bold text-white flex items-center space-x-2">
            <Scissors className="w-5 h-5 text-emerald-400" />
            <span>Clips Generated for this Video ({clips.length})</span>
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {clips.map((clip) => (
              <div
                key={clip.id}
                className="p-3.5 rounded-2xl bg-slate-900 border border-slate-800 space-y-2"
              >
                <div className="flex items-center justify-between text-xs">
                  <span className="font-mono text-blue-400 font-semibold">
                    {formatTime(clip.startTime)} → {formatTime(clip.endTime)}
                  </span>
                  <span className="text-slate-500">({clip.duration}s)</span>
                </div>
                {clip.query && (
                  <p className="text-xs text-slate-300 italic line-clamp-1">"{clip.query}"</p>
                )}
                <video
                  src={`/api/media/${clip.outputPath}`}
                  controls
                  className="w-full rounded-xl bg-black aspect-video object-contain"
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Clip Modal */}
      <ClipModal
        isOpen={clipModalOpen}
        onClose={() => setClipModalOpen(false)}
        videoId={video.id}
        initialStart={clipStart}
        initialEnd={clipEnd}
        sceneId={clipSceneId}
      />
    </div>
  );
}

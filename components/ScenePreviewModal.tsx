'use client';

import React, { useRef, useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  X,
  Play,
  Pause,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Scissors,
  ExternalLink,
  Film,
  Folder,
  CheckCircle2,
  Tag,
  Volume2,
  VolumeX,
  Maximize,
  Repeat,
  Loader2
} from 'lucide-react';
import { formatTime } from './VideoPlayer';

interface ScenePreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  scenes: any[];
  currentIndex: number;
  onNavigateIndex: (newIndex: number) => void;
  onOpenClipModal: (scene: any) => void;
}

const PREVIEW_SEGMENT_COLORS = [
  { bg: 'bg-blue-500/15', text: 'text-blue-300', border: 'border-blue-500/30' },
  { bg: 'bg-emerald-500/15', text: 'text-emerald-300', border: 'border-emerald-500/30' },
  { bg: 'bg-amber-500/15', text: 'text-amber-300', border: 'border-amber-500/30' },
  { bg: 'bg-purple-500/15', text: 'text-purple-300', border: 'border-purple-500/30' },
  { bg: 'bg-cyan-500/15', text: 'text-cyan-300', border: 'border-cyan-500/30' },
  { bg: 'bg-rose-500/15', text: 'text-rose-300', border: 'border-rose-500/30' },
];

function getPreviewSegmentColor(index: number) {
  return PREVIEW_SEGMENT_COLORS[Math.max(0, (index - 1) % PREVIEW_SEGMENT_COLORS.length)] || PREVIEW_SEGMENT_COLORS[0];
}

function MatchedSegmentsPreviewAccordion({ segmentMatches }: { segmentMatches: any[] }) {
  const [isOpen, setIsOpen] = useState(false);

  if (!segmentMatches || segmentMatches.length === 0) return null;

  const topMatch = segmentMatches[0];
  const topColor = getPreviewSegmentColor(topMatch.segmentIndex || 1);

  return (
    <div className="rounded-2xl bg-slate-900/70 border border-slate-800/80 overflow-hidden transition-all">
      {/* 1-Line Collapsed Summary Bar (Default closed) */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-3 py-2 flex items-center justify-between gap-2 text-left hover:bg-slate-800/50 transition-colors"
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <Tag className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
          <span className="text-[11px] font-medium text-slate-300 truncate">
            Matched Prompt Portions ({segmentMatches.length}):
          </span>
          <span
            className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold shrink-0 ${topColor.bg} ${topColor.text}`}
          >
            <span>{topMatch.segmentLabel}</span>
            <span className="opacity-75 font-mono">({Math.round(topMatch.similarity * 100)}%)</span>
          </span>
        </div>

        <div className="flex items-center gap-1 text-[11px] text-slate-400 shrink-0 font-medium">
          <span>{isOpen ? 'Collapse' : 'Expand'}</span>
          {isOpen ? <ChevronUp className="w-3.5 h-3.5 text-slate-400" /> : <ChevronDown className="w-3.5 h-3.5 text-slate-400" />}
        </div>
      </button>

      {/* Expandable Scrollable Content Area */}
      {isOpen && (
        <div className="p-3 pt-2 border-t border-slate-800/60 bg-slate-950/50 animate-in fade-in duration-150 space-y-2">
          <div className="max-h-48 overflow-y-auto pr-1 space-y-1.5 scrollbar-thin scrollbar-thumb-slate-700">
            {segmentMatches.map((sm: any) => {
              const color = getPreviewSegmentColor(sm.segmentIndex || 1);
              return (
                <div
                  key={sm.segmentId}
                  className="text-xs text-slate-300 bg-slate-900/80 border border-slate-800/80 p-2.5 rounded-xl space-y-1"
                >
                  <div className="flex items-center justify-between text-[11px] font-semibold">
                    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] ${color.bg} ${color.text}`}>
                      {sm.segmentLabel}
                    </span>
                    <span className="font-mono text-emerald-400 text-[10px]">
                      {Math.round(sm.similarity * 100)}% match
                    </span>
                  </div>
                  <p className="text-slate-300 text-[11px] leading-relaxed italic">
                    "{sm.segmentText}"
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export default function ScenePreviewModal({
  isOpen,
  onClose,
  scenes,
  currentIndex,
  onNavigateIndex,
  onOpenClipModal,
}: ScenePreviewModalProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isVideoLoading, setIsVideoLoading] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [isLooping, setIsLooping] = useState(true);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(1);

  const scene = scenes[currentIndex] || null;

  const sceneStart = scene
    ? scene.isVerified && scene.verifiedStartTime !== undefined
      ? scene.verifiedStartTime
      : scene.startTime
    : 0;

  const sceneEnd = scene
    ? scene.isVerified && scene.verifiedEndTime !== undefined
      ? scene.verifiedEndTime
      : scene.endTime
    : 10;

  const duration = Math.max(0.1, sceneEnd - sceneStart);

  // Reset loading state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setIsVideoLoading(true);
      setIsPlaying(false);
    }
  }, [isOpen]);

  // Jump video to sceneStart when scene changes or modal opens
  useEffect(() => {
    if (isOpen && scene && videoRef.current) {
      setIsVideoLoading(true);
      setIsPlaying(false);
      videoRef.current.currentTime = sceneStart;
      setCurrentTime(sceneStart);
      const p = videoRef.current.play();
      if (p !== undefined) {
        p.catch(() => {
          setIsPlaying(false);
          setIsVideoLoading(false);
        });
      }
    }
  }, [isOpen, currentIndex, sceneStart]);

  const handleTimeUpdate = () => {
    const video = videoRef.current;
    if (!video) return;

    const t = video.currentTime;
    setCurrentTime(t);

    // If the video is actively advancing and unpaused, dismiss the loader
    if (!video.paused) {
      setIsPlaying(true);
      setIsVideoLoading(false);
    }

    if (t >= sceneEnd) {
      if (isLooping) {
        video.currentTime = sceneStart;
        video.play().catch(() => {});
      } else {
        video.pause();
        setIsPlaying(false);
      }
    } else if (t < sceneStart - 1) {
      // If outside the scene, snap back
      video.currentTime = sceneStart;
    }
  };

  // Keyboard navigation: ArrowLeft, ArrowRight, Space for play/pause, Esc to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;

      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        if (currentIndex > 0) {
          onNavigateIndex(currentIndex - 1);
        }
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        if (currentIndex < scenes.length - 1) {
          onNavigateIndex(currentIndex + 1);
        }
      } else if (e.key === ' ') {
        e.preventDefault();
        togglePlayPause();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, currentIndex, scenes.length, onClose, onNavigateIndex]);

  if (!isOpen || !scene) return null;

  const togglePlayPause = () => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
      setIsPlaying(false);
    } else {
      if (videoRef.current.currentTime >= sceneEnd) {
        videoRef.current.currentTime = sceneStart;
      }
      const p = videoRef.current.play();
      if (p !== undefined) {
        p.then(() => {
          setIsPlaying(true);
          setIsVideoLoading(false);
        }).catch(() => {
          setIsPlaying(false);
          setIsVideoLoading(false);
        });
      } else {
        setIsPlaying(true);
      }
    }
  };

  const handleReplay = () => {
    if (!videoRef.current) return;
    videoRef.current.currentTime = sceneStart;
    const p = videoRef.current.play();
    if (p !== undefined) {
      p.then(() => {
        setIsPlaying(true);
        setIsVideoLoading(false);
      }).catch(() => {
        setIsPlaying(false);
        setIsVideoLoading(false);
      });
    } else {
      setIsPlaying(true);
    }
  };

  const toggleMute = () => {
    if (!videoRef.current) return;
    const next = !isMuted;
    videoRef.current.muted = next;
    setIsMuted(next);
  };

  const progressInsideScene = Math.max(
    0,
    Math.min(100, ((currentTime - sceneStart) / duration) * 100)
  );

  const videoSrc = scene.videoStoragePath
    ? `/api/media/${scene.videoStoragePath}`
    : `/api/media/videos/${scene.videoId}.mp4`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/85 backdrop-blur-md animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="w-full max-w-5xl bg-[#0b101b] border border-slate-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh] animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Header Bar */}
        <div className="px-5 py-4 border-b border-slate-800/80 flex items-center justify-between gap-3 bg-[#080c14]/60">
          <div className="flex items-center space-x-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-blue-500/15 border border-blue-500/30 flex items-center justify-center text-blue-400 shrink-0">
              <Play className="w-4 h-4 fill-current" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center space-x-2">
                <h3 className="text-sm font-bold text-white truncate max-w-[280px] sm:max-w-[420px]">
                  {scene.videoName}
                </h3>
                {scene.groupName && (
                  <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-md bg-indigo-500/15 border border-indigo-500/30 text-indigo-300 text-[10px] font-semibold shrink-0">
                    <Folder className="w-2.5 h-2.5 text-indigo-400" />
                    <span>{scene.groupName}</span>
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-400 font-mono">
                Scene Window: {formatTime(sceneStart)} → {formatTime(sceneEnd)} ({Math.round(duration * 10) / 10}s)
              </p>
            </div>
          </div>

          {/* Quick Carousel Navigator */}
          <div className="flex items-center space-x-2">
            <div className="flex items-center space-x-1 bg-slate-900 border border-slate-800 rounded-xl p-1">
              <button
                type="button"
                onClick={() => onNavigateIndex(currentIndex - 1)}
                disabled={currentIndex === 0}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white disabled:opacity-30 hover:bg-slate-800 transition-colors"
                title="Previous Match (←)"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-xs font-mono px-2 text-slate-300 font-semibold">
                {currentIndex + 1} / {scenes.length}
              </span>
              <button
                type="button"
                onClick={() => onNavigateIndex(currentIndex + 1)}
                disabled={currentIndex === scenes.length - 1}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white disabled:opacity-30 hover:bg-slate-800 transition-colors"
                title="Next Match (→)"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800/80 transition-colors"
              title="Close (Esc)"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Body: Video on Left / Details on Right */}
        <div className="flex-1 overflow-y-auto grid grid-cols-1 lg:grid-cols-12 divide-y lg:divide-y-0 lg:divide-x divide-slate-800/60">
          {/* Left: Video Player & Scene Scrubber (7 cols) */}
          <div className="lg:col-span-7 p-4 sm:p-5 flex flex-col justify-center space-y-3 bg-black/40">
            {/* Video Container */}
            <div className="relative rounded-2xl overflow-hidden bg-black aspect-video flex items-center justify-center border border-slate-800/80 group">
              <video
                ref={videoRef}
                src={videoSrc}
                poster={scene.thumbnailUrl || `/api/media/thumbnails/thumb_${scene.videoId}.jpg`}
                className="w-full h-full object-contain"
                playsInline
                onClick={togglePlayPause}
                onWaiting={() => setIsVideoLoading(true)}
                onSeeking={() => setIsVideoLoading(true)}
                onSeeked={() => {
                  if (videoRef.current && videoRef.current.paused) {
                    setIsVideoLoading(false);
                  }
                }}
                onPlaying={() => {
                  setIsVideoLoading(false);
                  setIsPlaying(true);
                }}
                onPause={() => setIsPlaying(false)}
                onTimeUpdate={handleTimeUpdate}
                onError={() => {
                  setIsVideoLoading(false);
                  setIsPlaying(false);
                }}
              />

              {/* Buffering & Loading Spinner Overlay */}
              {isVideoLoading && (
                <div className="absolute inset-0 bg-black/75 backdrop-blur-[2px] flex flex-col items-center justify-center space-y-3 z-20 pointer-events-none animate-in fade-in duration-150">
                  <div className="relative flex items-center justify-center">
                    <div className="w-14 h-14 rounded-full border-2 border-blue-500/20 border-t-blue-500 animate-spin" />
                    <Play className="w-5 h-5 text-blue-400 absolute fill-current ml-0.5 opacity-80" />
                  </div>
                  <div className="text-center space-y-1">
                    <div className="flex items-center justify-center space-x-2">
                      <Loader2 className="w-3.5 h-3.5 text-blue-400 animate-spin" />
                      <span className="text-xs font-semibold text-white tracking-wide">
                        Loading Scene Video...
                      </span>
                    </div>
                    <p className="text-[11px] font-mono text-slate-400">
                      Seeking to {formatTime(sceneStart)} ({Math.round(duration * 10) / 10}s)
                    </p>
                  </div>
                </div>
              )}

              {/* Big Center Play/Pause Overlay on Hover */}
              {!isVideoLoading && (
                <button
                  type="button"
                  onClick={togglePlayPause}
                  className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <div className="w-14 h-14 rounded-2xl bg-slate-900/80 border border-slate-700/80 backdrop-blur-md flex items-center justify-center text-white shadow-xl">
                    {isPlaying ? <Pause className="w-6 h-6 fill-current" /> : <Play className="w-6 h-6 fill-current ml-0.5" />}
                  </div>
                </button>
              )}

              {/* Live Scene Progress Bar (Top of player) */}
              <div className="absolute top-0 left-0 right-0 h-1 bg-slate-900/80">
                <div
                  className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 transition-all duration-100"
                  style={{ width: `${progressInsideScene}%` }}
                />
              </div>
            </div>

            {/* Video Control Bar */}
            <div className="flex items-center justify-between gap-3 p-3 rounded-2xl bg-slate-950/70 border border-slate-800/80 text-xs">
              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={togglePlayPause}
                  disabled={isVideoLoading}
                  className="p-2 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:bg-blue-600/60 disabled:cursor-wait text-white transition-colors"
                  title={isVideoLoading ? 'Buffering video...' : isPlaying ? 'Pause (Space)' : 'Play (Space)'}
                >
                  {isVideoLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin text-white" />
                  ) : isPlaying ? (
                    <Pause className="w-4 h-4 fill-current" />
                  ) : (
                    <Play className="w-4 h-4 fill-current" />
                  )}
                </button>

                <button
                  type="button"
                  onClick={handleReplay}
                  className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
                  title="Replay scene from start"
                >
                  <RotateCcw className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  onClick={() => setIsLooping(!isLooping)}
                  className={`p-2 rounded-xl transition-colors ${
                    isLooping
                      ? 'bg-blue-500/15 text-blue-400 border border-blue-500/30'
                      : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                  title={isLooping ? 'Looping scene (Click to toggle)' : 'Loop disabled'}
                >
                  <Repeat className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  onClick={toggleMute}
                  className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
                  title={isMuted ? 'Unmute' : 'Mute'}
                >
                  {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                </button>
              </div>

              {/* Time display */}
              <div className="font-mono text-slate-300 text-xs flex items-center space-x-1.5">
                <span className="text-white font-bold">{formatTime(currentTime)}</span>
                <span className="text-slate-500">/</span>
                <span className="text-slate-400">{formatTime(sceneEnd)}</span>
              </div>
            </div>
          </div>

          {/* Right: Scene Metadata & Storyboard Info (5 cols) */}
          <div className="lg:col-span-5 p-5 flex flex-col justify-between space-y-4 overflow-y-auto max-h-[85vh] lg:max-h-[600px] scrollbar-thin">
            <div className="space-y-4">
              {/* Match Score & Status */}
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-1 rounded-full bg-blue-500/15 border border-blue-500/30 text-blue-400 text-xs font-bold font-mono">
                    Match: {scene.similarityScore}%
                  </span>
                  {scene.isVerified && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/25 px-2.5 py-1 rounded-full">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      AI Verified
                    </span>
                  )}
                </div>

                <span className="text-xs text-slate-400 font-mono">
                  Result #{currentIndex + 1} of {scenes.length}
                </span>
              </div>

              {/* Matched Prompt Segments (Collapsible with internal scrolling) */}
              <MatchedSegmentsPreviewAccordion segmentMatches={scene.segmentMatches || []} />

              {/* Description */}
              <div className="space-y-1.5">
                <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  Scene Description
                </h4>
                <p className="text-sm text-slate-200 leading-relaxed bg-slate-900/40 border border-slate-800/60 p-3 rounded-2xl">
                  {scene.description}
                </p>
              </div>

              {/* Verification Reason */}
              {scene.isVerified && scene.verificationReason && (
                <div className="p-3 rounded-2xl bg-emerald-950/20 border border-emerald-500/25 text-xs text-emerald-300/90 leading-relaxed italic">
                  "{scene.verificationReason}"
                </div>
              )}
            </div>

            {/* Bottom Actions */}
            <div className="pt-4 border-t border-slate-800/80 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
              <Link
                href={`/videos/${scene.videoId}?t=${sceneStart}&end=${sceneEnd}&sceneId=${scene.id || ''}`}
                className="flex items-center justify-center space-x-1.5 px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-white text-xs font-medium transition-colors"
                title="Open this clip in the video studio timeline"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>Open Full Studio</span>
              </Link>

              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenClipModal(scene);
                }}
                className="flex items-center justify-center space-x-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-lg shadow-indigo-500/25 transition-all"
              >
                <Scissors className="w-4 h-4" />
                <span>Create Video Clip</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

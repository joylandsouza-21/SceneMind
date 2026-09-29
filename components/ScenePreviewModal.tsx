'use client';

import React, { useRef, useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  X,
  Play,
  Pause,
  RotateCcw,
  RotateCw,
  SkipBack,
  SkipForward,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Scissors,
  ExternalLink,
  Folder,
  CheckCircle2,
  Tag,
  Volume2,
  VolumeX,
  Maximize,
  Minimize,
  Repeat,
  Loader2,
  Sliders,
  Sparkles,
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

const PLAYBACK_SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];

export default function ScenePreviewModal({
  isOpen,
  onClose,
  scenes,
  currentIndex,
  onNavigateIndex,
  onOpenClipModal,
}: ScenePreviewModalProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const playerContainerRef = useRef<HTMLDivElement | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [isVideoLoading, setIsVideoLoading] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [videoDuration, setVideoDuration] = useState(0);
  const [isLooping, setIsLooping] = useState(true);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);

  // Scrubber & Mode state
  const [timelineMode, setTimelineMode] = useState<'scene' | 'full'>('scene');
  const [lockToScene, setLockToScene] = useState(true);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [scrubTime, setScrubTime] = useState(0);
  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const [hoverPosition, setHoverPosition] = useState<number>(0);

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

  const sceneDuration = Math.max(0.1, sceneEnd - sceneStart);

  // Reset loading state and mode when modal closes
  useEffect(() => {
    if (!isOpen) {
      setIsVideoLoading(true);
      setIsPlaying(false);
      setShowSpeedMenu(false);
    }
  }, [isOpen]);

  // Jump video to sceneStart when scene changes or modal opens with readiness check
  const seekAndPlayScene = useCallback((targetStart: number) => {
    const video = videoRef.current;
    if (!video) return;

    setIsVideoLoading(true);
    setIsPlaying(false);

    const performSeek = () => {
      try {
        video.currentTime = targetStart;
        setCurrentTime(targetStart);
        video.playbackRate = playbackRate;

        const playPromise = video.play();
        if (playPromise !== undefined) {
          playPromise
            .then(() => {
              setIsPlaying(true);
              setIsVideoLoading(false);
            })
            .catch(() => {
              setIsPlaying(false);
              setIsVideoLoading(false);
            });
        } else {
          setIsVideoLoading(false);
        }
      } catch {
        setIsVideoLoading(false);
      }
    };

    if (video.readyState >= 1) {
      performSeek();
    } else {
      video.addEventListener('loadedmetadata', performSeek, { once: true });
    }
  }, [playbackRate]);

  useEffect(() => {
    if (isOpen && scene) {
      setTimelineMode('scene');
      setLockToScene(true);
      seekAndPlayScene(sceneStart);
    }
  }, [isOpen, currentIndex, sceneStart, seekAndPlayScene]);

  // Handle video metadata
  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      setVideoDuration(videoRef.current.duration || 0);
      videoRef.current.playbackRate = playbackRate;
    }
  };

  // Safety fallback: Never let loading spinner get stuck indefinitely
  useEffect(() => {
    if (!isVideoLoading) return;
    const timer = setTimeout(() => {
      setIsVideoLoading(false);
    }, 4000);
    return () => clearTimeout(timer);
  }, [isVideoLoading]);

  // Listen to fullscreen changes
  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);

  const handleTimeUpdate = () => {
    const video = videoRef.current;
    if (!video) return;

    const t = video.currentTime;
    if (!isScrubbing) {
      setCurrentTime(t);
    }

    // Dismiss spinner if video is advancing
    if (!video.paused && video.readyState >= 2) {
      setIsPlaying(true);
      setIsVideoLoading(false);
    }

    // Boundary check when locking to scene
    if (lockToScene && timelineMode === 'scene') {
      if (t >= sceneEnd) {
        if (isLooping) {
          video.currentTime = sceneStart;
          video.play().catch(() => {});
        } else {
          video.pause();
          setIsPlaying(false);
        }
      }
    } else {
      // Full video mode boundary check
      if (videoDuration > 0 && t >= videoDuration) {
        if (isLooping) {
          video.currentTime = 0;
          video.play().catch(() => {});
        } else {
          video.pause();
          setIsPlaying(false);
        }
      }
    }
  };

  const applySeek = useCallback((targetTime: number) => {
    const video = videoRef.current;
    if (!video) return;

    const rangeMax = lockToScene && timelineMode === 'scene'
      ? sceneEnd
      : (videoDuration > 0 ? videoDuration : Math.max(sceneEnd, 100));
    const rangeMin = lockToScene && timelineMode === 'scene' ? sceneStart : 0;
    const clamped = Math.max(rangeMin, Math.min(targetTime, rangeMax));

    video.currentTime = clamped;
    setCurrentTime(clamped);
  }, [lockToScene, timelineMode, sceneEnd, sceneStart, videoDuration]);

  const skipSeconds = useCallback((delta: number) => {
    const video = videoRef.current;
    if (!video) return;

    const target = video.currentTime + delta;
    const rangeMax = lockToScene && timelineMode === 'scene'
      ? sceneEnd
      : (videoDuration > 0 ? videoDuration : Math.max(sceneEnd, 100));
    const rangeMin = lockToScene && timelineMode === 'scene' ? sceneStart : 0;
    const clamped = Math.max(rangeMin, Math.min(target, rangeMax));

    video.currentTime = clamped;
    setCurrentTime(clamped);
  }, [lockToScene, timelineMode, sceneEnd, sceneStart, videoDuration]);

  const jumpToStart = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    const target = timelineMode === 'scene' || lockToScene ? sceneStart : 0;
    video.currentTime = target;
    setCurrentTime(target);
  }, [timelineMode, lockToScene, sceneStart]);

  const jumpToEnd = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    const target = timelineMode === 'scene' || lockToScene
      ? sceneEnd
      : (videoDuration > 0 ? videoDuration : sceneEnd);
    const clamped = Math.max(0, target - 0.1);
    video.currentTime = clamped;
    setCurrentTime(clamped);
  }, [timelineMode, lockToScene, sceneEnd, videoDuration]);

  const togglePlayPause = () => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
      setIsPlaying(false);
    } else {
      if (lockToScene && timelineMode === 'scene') {
        if (videoRef.current.currentTime >= sceneEnd || videoRef.current.currentTime < sceneStart) {
          videoRef.current.currentTime = sceneStart;
        }
      } else if (videoDuration > 0 && videoRef.current.currentTime >= videoDuration) {
        videoRef.current.currentTime = 0;
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
    const target = timelineMode === 'scene' || lockToScene ? sceneStart : 0;
    videoRef.current.currentTime = target;
    setCurrentTime(target);
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
    const nextMuted = !isMuted;
    videoRef.current.muted = nextMuted;
    setIsMuted(nextMuted);
    if (!nextMuted && volume === 0) {
      setVolume(1);
      videoRef.current.volume = 1;
    }
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setVolume(val);
    if (videoRef.current) {
      videoRef.current.volume = val;
      videoRef.current.muted = val === 0;
      setIsMuted(val === 0);
    }
  };

  const handleSpeedSelect = (speed: number) => {
    setPlaybackRate(speed);
    setShowSpeedMenu(false);
    if (videoRef.current) {
      videoRef.current.playbackRate = speed;
    }
  };

  const toggleFullscreen = () => {
    if (!playerContainerRef.current) return;
    if (!document.fullscreenElement) {
      playerContainerRef.current.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };

  // Keyboard controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;

      if (e.key === 'Escape') {
        if (isFullscreen && document.fullscreenElement) {
          document.exitFullscreen().catch(() => {});
        } else {
          onClose();
        }
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        if (e.shiftKey) {
          if (currentIndex > 0) onNavigateIndex(currentIndex - 1);
        } else if (e.altKey) {
          skipSeconds(-1);
        } else {
          skipSeconds(-5);
        }
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        if (e.shiftKey) {
          if (currentIndex < scenes.length - 1) onNavigateIndex(currentIndex + 1);
        } else if (e.altKey) {
          skipSeconds(1);
        } else {
          skipSeconds(5);
        }
      } else if (e.key === ' ' || e.key === 'k') {
        e.preventDefault();
        togglePlayPause();
      } else if (e.key === 'j') {
        e.preventDefault();
        skipSeconds(-5);
      } else if (e.key === 'l') {
        e.preventDefault();
        skipSeconds(5);
      } else if (e.key === 'Home') {
        e.preventDefault();
        jumpToStart();
      } else if (e.key === 'End') {
        e.preventDefault();
        jumpToEnd();
      } else if (e.key === 'm') {
        e.preventDefault();
        toggleMute();
      } else if (e.key === 'f') {
        e.preventDefault();
        toggleFullscreen();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    isOpen,
    isFullscreen,
    currentIndex,
    scenes.length,
    onClose,
    onNavigateIndex,
    skipSeconds,
    jumpToStart,
    jumpToEnd,
  ]);

  if (!isOpen || !scene) return null;

  // Scrubber limits and progress calculation
  const isSceneMode = timelineMode === 'scene';
  const rangeMin = isSceneMode ? sceneStart : 0;
  const rangeMax = isSceneMode
    ? Math.max(sceneStart + 0.1, sceneEnd)
    : (videoDuration > 0 ? videoDuration : Math.max(sceneEnd, 10));

  const displayTime = isScrubbing ? scrubTime : currentTime;
  const progressPercent = isSceneMode
    ? ((displayTime - sceneStart) / sceneDuration) * 100
    : rangeMax > 0
    ? (displayTime / rangeMax) * 100
    : 0;

  // Highlight markers for Scene inside Full Video mode
  const sceneLeftPercent = rangeMax > 0 ? (sceneStart / rangeMax) * 100 : 0;
  const sceneWidthPercent = rangeMax > 0
    ? Math.min(100 - sceneLeftPercent, (sceneDuration / rangeMax) * 100)
    : 0;

  const handlePointerDown = () => {
    setIsScrubbing(true);
    setScrubTime(currentTime);
  };

  const handleScrubChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setScrubTime(val);
    if (!isScrubbing) {
      applySeek(val);
    }
  };

  const handlePointerUp = () => {
    if (isScrubbing) {
      setIsScrubbing(false);
      applySeek(scrubTime);
    }
  };

  const handleMouseMoveScrubber = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    setHoverPosition(pos * 100);
    const timeAtHover = rangeMin + pos * (rangeMax - rangeMin);
    setHoverTime(timeAtHover);
  };

  const handleMouseLeaveScrubber = () => {
    setHoverTime(null);
  };

  const videoSrc = scene.videoStoragePath
    ? `/api/media/${scene.videoStoragePath}`
    : scene.storagePath
    ? `/api/media/${scene.storagePath}`
    : `/api/media/videos/${scene.videoId}.mp4`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-6 bg-black/85 backdrop-blur-md animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="w-full max-w-5xl bg-[#0b101b] border border-slate-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[95vh] animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Header Bar */}
        <div className="px-5 py-3.5 border-b border-slate-800/80 flex items-center justify-between gap-3 bg-[#080c14]/70">
          <div className="flex items-center space-x-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-blue-500/15 border border-blue-500/30 flex items-center justify-center text-blue-400 shrink-0">
              <Play className="w-4 h-4 fill-current" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center space-x-2">
                <h3 className="text-sm font-bold text-white truncate max-w-[240px] sm:max-w-[400px]">
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
                Scene Window: {formatTime(sceneStart)} → {formatTime(sceneEnd)} ({Math.round(sceneDuration * 10) / 10}s)
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
                title="Previous Match (Shift+←)"
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
                title="Next Match (Shift+→)"
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

        {/* Modal Body: Video & Comprehensive Controllers on Left / Details on Right */}
        <div className="flex-1 overflow-y-auto grid grid-cols-1 lg:grid-cols-12 divide-y lg:divide-y-0 lg:divide-x divide-slate-800/60">
          {/* Left: Video Player & Full Suite of Controllers (7 cols) */}
          <div
            ref={playerContainerRef}
            className={`lg:col-span-7 p-3 sm:p-5 flex flex-col justify-center space-y-3 bg-black/50 ${
              isFullscreen ? 'fixed inset-0 z-50 bg-black p-4 sm:p-8 justify-between max-w-none' : ''
            }`}
          >
            {/* Video Container */}
            <div className="relative rounded-2xl overflow-hidden bg-black aspect-video flex items-center justify-center border border-slate-800/80 group shadow-inner">
              <video
                ref={videoRef}
                src={videoSrc}
                poster={scene.thumbnailUrl || `/api/media/thumbnails/thumb_${scene.videoId}.jpg`}
                className="w-full h-full object-contain cursor-pointer"
                playsInline
                onClick={togglePlayPause}
                onLoadedMetadata={handleLoadedMetadata}
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
                      Seeking to {formatTime(sceneStart)} ({Math.round(sceneDuration * 10) / 10}s)
                    </p>
                  </div>
                </div>
              )}

              {/* Big Center Play/Pause Overlay Button */}
              {!isVideoLoading && (
                <button
                  type="button"
                  onClick={togglePlayPause}
                  className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity"
                  title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
                >
                  <div className="w-14 h-14 rounded-2xl bg-slate-900/85 border border-slate-700/80 backdrop-blur-md flex items-center justify-center text-white shadow-2xl transition-transform hover:scale-105 active:scale-95">
                    {isPlaying ? <Pause className="w-6 h-6 fill-current" /> : <Play className="w-6 h-6 fill-current ml-0.5" />}
                  </div>
                </button>
              )}

              {/* Active Mode / Scene Window Overlay Pill */}
              <div className="absolute top-3 left-3 z-10 flex items-center space-x-2">
                <span className="px-2.5 py-1 rounded-lg bg-blue-600/90 text-white text-[11px] font-bold backdrop-blur-md shadow-md border border-blue-400/30 flex items-center space-x-1.5">
                  <span className="w-2 h-2 rounded-full bg-cyan-300 animate-ping" />
                  <span>
                    {isSceneMode
                      ? `Scene: ${formatTime(sceneStart)} → ${formatTime(sceneEnd)}`
                      : `Playing Full Video (${formatTime(videoDuration || sceneEnd)})`}
                  </span>
                </span>
                {playbackRate !== 1 && (
                  <span className="px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-300 text-[10px] font-bold border border-amber-500/30 backdrop-blur-md">
                    {playbackRate}x
                  </span>
                )}
              </div>
            </div>

            {/* Video Controller Dashboard */}
            <div className="p-3 sm:p-4 rounded-2xl bg-[#080d17]/90 border border-slate-800 shadow-xl space-y-3">
              {/* Timeline Header: Mode Switcher & Quick Boundary Jump */}
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                {/* Timeline Mode Segmented Tabs */}
                <div className="flex items-center space-x-1 bg-slate-900/90 border border-slate-800 p-0.5 rounded-xl">
                  <button
                    type="button"
                    onClick={() => {
                      setTimelineMode('scene');
                      setLockToScene(true);
                      if (currentTime < sceneStart || currentTime > sceneEnd) {
                        applySeek(sceneStart);
                      }
                    }}
                    className={`px-2.5 py-1 rounded-lg font-medium text-[11px] transition-all flex items-center space-x-1.5 cursor-pointer ${
                      isSceneMode
                        ? 'bg-blue-600 text-white shadow-sm font-semibold'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                    title="Lock scrubber and playback to this scene match"
                  >
                    <Sparkles className="w-3 h-3 text-cyan-300" />
                    <span>Scene Clip ({Math.round(sceneDuration * 10) / 10}s)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setTimelineMode('full');
                      setLockToScene(false);
                    }}
                    className={`px-2.5 py-1 rounded-lg font-medium text-[11px] transition-all flex items-center space-x-1.5 cursor-pointer ${
                      !isSceneMode
                        ? 'bg-blue-600 text-white shadow-sm font-semibold'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                    title="Unlock scrubber to play and browse entire video"
                  >
                    <span>Full Video</span>
                    {videoDuration > 0 && (
                      <span className="font-mono text-[10px] opacity-75">
                        ({formatTime(videoDuration)})
                      </span>
                    )}
                  </button>
                </div>

                {/* Quick Scene Boundary Jump Shortcuts */}
                <div className="flex items-center space-x-1.5 text-[11px]">
                  <button
                    type="button"
                    onClick={jumpToStart}
                    className="px-2 py-1 rounded-lg bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-300 hover:text-white transition-colors flex items-center space-x-1 cursor-pointer"
                    title="Jump to scene start (Home)"
                  >
                    <SkipBack className="w-3 h-3 text-blue-400" />
                    <span>Start: {formatTime(sceneStart)}</span>
                  </button>
                  <button
                    type="button"
                    onClick={jumpToEnd}
                    className="px-2 py-1 rounded-lg bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-300 hover:text-white transition-colors flex items-center space-x-1 cursor-pointer"
                    title="Jump to scene end (End)"
                  >
                    <span>End: {formatTime(sceneEnd)}</span>
                    <SkipForward className="w-3 h-3 text-blue-400" />
                  </button>
                </div>
              </div>

              {/* Interactive Timeline Scrubber with Scene Marker & Hover Tooltip */}
              <div
                className="relative w-full py-2 flex items-center group/track cursor-pointer select-none"
                onMouseMove={handleMouseMoveScrubber}
                onMouseLeave={handleMouseLeaveScrubber}
              >
                {/* Hover Time Tooltip */}
                {hoverTime !== null && (
                  <div
                    className="absolute -top-7 -translate-x-1/2 px-2 py-0.5 rounded-md bg-slate-900 border border-slate-700 text-[10px] font-mono text-cyan-300 pointer-events-none shadow-xl z-30 whitespace-nowrap"
                    style={{ left: `${hoverPosition}%` }}
                  >
                    {formatTime(hoverTime)}
                  </div>
                )}

                {/* Scrubber Track Background */}
                <div className="absolute inset-x-0 h-2 bg-slate-800 rounded-full overflow-hidden">
                  {/* Full video mode: Active Scene Window Visual Highlight */}
                  {!isSceneMode && rangeMax > 0 && (
                    <div
                      className="absolute top-0 bottom-0 bg-blue-500/35 border-x border-cyan-400"
                      style={{
                        left: `${sceneLeftPercent}%`,
                        width: `${sceneWidthPercent}%`,
                      }}
                      title={`Scene window: ${formatTime(sceneStart)} → ${formatTime(sceneEnd)}`}
                    />
                  )}

                  {/* Played Progress Bar */}
                  <div
                    className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 transition-[width] duration-75"
                    style={{ width: `${Math.max(0, Math.min(100, progressPercent))}%` }}
                  />
                </div>

                {/* Native Range Input for drag & touch scrubbing */}
                <input
                  type="range"
                  min={rangeMin}
                  max={rangeMax}
                  step={0.05}
                  value={displayTime}
                  onPointerDown={handlePointerDown}
                  onChange={handleScrubChange}
                  onPointerUp={handlePointerUp}
                  className="relative z-10 w-full h-2 appearance-none bg-transparent cursor-pointer accent-blue-400 opacity-90 group-hover/track:opacity-100"
                />
              </div>

              {/* Main Playback & Navigation Controls Bar */}
              <div className="flex flex-wrap items-center justify-between gap-2.5 pt-1 text-slate-200">
                {/* Left Cluster: Forward / Backward Jump & Play / Pause Controls */}
                <div className="flex items-center space-x-1.5 sm:space-x-2">
                  {/* Jump To Start */}
                  <button
                    type="button"
                    onClick={jumpToStart}
                    className="p-1.5 rounded-lg bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-300 hover:text-white transition-colors cursor-pointer"
                    title="Jump to scene start (Home)"
                  >
                    <SkipBack className="w-3.5 h-3.5" />
                  </button>

                  {/* Skip Backward 5s */}
                  <button
                    type="button"
                    onClick={() => skipSeconds(-5)}
                    className="flex items-center space-x-0.5 px-2 py-1.5 rounded-lg bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-300 hover:text-white transition-colors cursor-pointer text-xs font-semibold"
                    title="Rewind 5s (← or J)"
                  >
                    <RotateCcw className="w-3.5 h-3.5 text-blue-400" />
                    <span>-5s</span>
                  </button>

                  {/* Fine Step -1s */}
                  <button
                    type="button"
                    onClick={() => skipSeconds(-1)}
                    className="px-1.5 py-1.5 rounded-lg bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer text-[10px] font-mono"
                    title="Step back 1 second (Alt+←)"
                  >
                    -1s
                  </button>

                  {/* Main Play/Pause Button */}
                  <button
                    type="button"
                    onClick={togglePlayPause}
                    disabled={isVideoLoading}
                    className="p-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:bg-blue-600/50 text-white transition-all shadow-md shadow-blue-500/30 cursor-pointer"
                    title={isVideoLoading ? 'Buffering...' : isPlaying ? 'Pause (Space or K)' : 'Play (Space or K)'}
                  >
                    {isVideoLoading ? (
                      <Loader2 className="w-4 h-4 animate-spin text-white" />
                    ) : isPlaying ? (
                      <Pause className="w-4 h-4 fill-current" />
                    ) : (
                      <Play className="w-4 h-4 fill-current ml-0.5" />
                    )}
                  </button>

                  {/* Fine Step +1s */}
                  <button
                    type="button"
                    onClick={() => skipSeconds(1)}
                    className="px-1.5 py-1.5 rounded-lg bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer text-[10px] font-mono"
                    title="Step forward 1 second (Alt+→)"
                  >
                    +1s
                  </button>

                  {/* Skip Forward 5s */}
                  <button
                    type="button"
                    onClick={() => skipSeconds(5)}
                    className="flex items-center space-x-0.5 px-2 py-1.5 rounded-lg bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-300 hover:text-white transition-colors cursor-pointer text-xs font-semibold"
                    title="Forward 5s (→ or L)"
                  >
                    <span>+5s</span>
                    <RotateCw className="w-3.5 h-3.5 text-blue-400" />
                  </button>

                  {/* Jump To End */}
                  <button
                    type="button"
                    onClick={jumpToEnd}
                    className="p-1.5 rounded-lg bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-300 hover:text-white transition-colors cursor-pointer"
                    title="Jump to scene end (End)"
                  >
                    <SkipForward className="w-3.5 h-3.5" />
                  </button>

                  {/* Replay Scene from Start */}
                  <button
                    type="button"
                    onClick={handleReplay}
                    className="p-1.5 rounded-lg bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer"
                    title="Replay scene from beginning"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Right Cluster: Time Display, Speed, Volume, Loop, Fullscreen */}
                <div className="flex items-center space-x-2 sm:space-x-3">
                  {/* Digital Timestamp Display */}
                  <div className="font-mono text-slate-300 text-xs flex items-center space-x-1 bg-slate-900/80 px-2.5 py-1.5 rounded-xl border border-slate-800">
                    <span className="text-white font-bold">{formatTime(displayTime)}</span>
                    <span className="text-slate-500">/</span>
                    <span className="text-slate-400 font-medium">
                      {formatTime(isSceneMode ? sceneEnd : (videoDuration || sceneEnd))}
                    </span>
                  </div>

                  {/* Playback Speed Selector Popover */}
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setShowSpeedMenu(!showSpeedMenu)}
                      className="px-2 py-1.5 rounded-lg bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-300 hover:text-white text-xs font-semibold font-mono transition-colors cursor-pointer flex items-center space-x-1"
                      title="Playback Speed"
                    >
                      <span>{playbackRate}x</span>
                    </button>

                    {showSpeedMenu && (
                      <div className="absolute bottom-full right-0 mb-2 py-1 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl z-30 flex flex-col min-w-[70px]">
                        {PLAYBACK_SPEEDS.map((rate) => (
                          <button
                            key={rate}
                            type="button"
                            onClick={() => handleSpeedSelect(rate)}
                            className={`px-3 py-1 text-left text-xs font-mono font-medium hover:bg-blue-600/30 transition-colors ${
                              playbackRate === rate ? 'text-blue-400 font-bold bg-blue-600/15' : 'text-slate-300'
                            }`}
                          >
                            {rate}x
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Loop Toggle */}
                  <button
                    type="button"
                    onClick={() => setIsLooping(!isLooping)}
                    className={`p-1.5 rounded-lg border transition-colors cursor-pointer ${
                      isLooping
                        ? 'bg-blue-500/20 text-blue-400 border-blue-500/40 shadow-sm'
                        : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200'
                    }`}
                    title={isLooping ? 'Looping enabled (Click to disable)' : 'Looping disabled'}
                  >
                    <Repeat className="w-3.5 h-3.5" />
                  </button>

                  {/* Volume Control & Slider */}
                  <div className="flex items-center space-x-1.5 bg-slate-900 border border-slate-800 px-2 py-1 rounded-xl">
                    <button
                      type="button"
                      onClick={toggleMute}
                      className="text-slate-400 hover:text-white transition-colors cursor-pointer"
                      title={isMuted ? 'Unmute (M)' : 'Mute (M)'}
                    >
                      {isMuted || volume === 0 ? (
                        <VolumeX className="w-3.5 h-3.5 text-red-400" />
                      ) : (
                        <Volume2 className="w-3.5 h-3.5" />
                      )}
                    </button>
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.05}
                      value={isMuted ? 0 : volume}
                      onChange={handleVolumeChange}
                      className="w-14 h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                      title={`Volume: ${Math.round((isMuted ? 0 : volume) * 100)}%`}
                    />
                  </div>

                  {/* Fullscreen Button */}
                  <button
                    type="button"
                    onClick={toggleFullscreen}
                    className="p-1.5 rounded-lg bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer"
                    title={isFullscreen ? 'Exit Fullscreen (F)' : 'Fullscreen (F)'}
                  >
                    {isFullscreen ? <Minimize className="w-3.5 h-3.5" /> : <Maximize className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              {/* Keyboard Shortcuts Hint Bar */}
              <div className="text-[10px] text-slate-400/80 flex items-center justify-between pt-1 border-t border-slate-800/60 font-mono">
                <span>Space: Play/Pause • ← / →: ±5s • Alt+← / →: ±1s</span>
                <span>Home / End: Scene bounds • F: Fullscreen</span>
              </div>
            </div>
          </div>

          {/* Right: Scene Metadata & Storyboard Info (5 cols) */}
          <div className="lg:col-span-5 p-5 flex flex-col justify-between space-y-4 overflow-y-auto max-h-[85vh] lg:max-h-[640px] scrollbar-thin">
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
                className="flex items-center justify-center space-x-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-lg shadow-indigo-500/25 transition-all cursor-pointer"
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

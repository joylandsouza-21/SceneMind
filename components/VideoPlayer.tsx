'use client';

import React, { useRef, useState, useEffect, forwardRef, useImperativeHandle } from 'react';
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize,
  RotateCcw,
  RotateCw,
  Scissors,
  Loader2,
} from 'lucide-react';

export interface VideoPlayerRef {
  seekTo: (seconds: number) => void;
  play: () => void;
  pause: () => void;
  getCurrentTime: () => number;
}

interface VideoPlayerProps {
  src: string;
  poster?: string;
  onTimeUpdate?: (currentTime: number) => void;
  activeSceneRange?: { start: number; end: number } | null;
  onRequestClip?: (currentTime: number) => void;
  initialTime?: number;
  videoId?: string;
  onTranscodeRequest?: () => void;
}

export function formatTime(seconds: number): string {
  if (isNaN(seconds) || seconds < 0) return '00:00:00';
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const hh = hrs.toString().padStart(2, '0');
  const mm = mins.toString().padStart(2, '0');
  const ss = secs.toString().padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

const VideoPlayer = forwardRef<VideoPlayerRef, VideoPlayerProps>(({
  src,
  poster,
  onTimeUpdate,
  activeSceneRange,
  onRequestClip,
  initialTime,
  videoId,
  onTranscodeRequest,
}, ref) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [scrubTime, setScrubTime] = useState(0);
  const [playbackError, setPlaybackError] = useState<string | null>(null);
  const [isTranscoding, setIsTranscoding] = useState(false);
  const [seekingTargetTime, setSeekingTargetTime] = useState<number | null>(
    initialTime !== undefined && initialTime > 0 ? initialTime : null
  );
  const [isBuffering, setIsBuffering] = useState(
    initialTime !== undefined && initialTime > 0
  );
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Auto-seek to initialTime if supplied once video metadata is ready
  useEffect(() => {
    if (initialTime !== undefined && initialTime > 0) {
      setSeekingTargetTime(initialTime);
      setIsBuffering(true);
      const video = videoRef.current;
      if (!video) return;

      const performSeek = () => {
        applySeek(initialTime);
      };

      if (video.readyState >= 1) {
        performSeek();
      } else {
        video.addEventListener('loadedmetadata', performSeek, { once: true });
        return () => video.removeEventListener('loadedmetadata', performSeek);
      }
    }
  }, [initialTime, src]);

  const applySeek = (seconds: number) => {
    if (!videoRef.current) return;
    const clamped = Math.max(0, Math.min(seconds, duration || 99999));
    setSeekingTargetTime(clamped);
    setIsBuffering(true);

    videoRef.current.currentTime = clamped;
    setCurrentTime(clamped);
    if (onTimeUpdate) onTimeUpdate(clamped);

    // Explicitly start playback when user seeks to a timestamp
    const playPromise = videoRef.current.play();
    if (playPromise !== undefined) {
      playPromise
        .then(() => {
          // Playback requested
        })
        .catch(() => {
          // Handled if browser autoplay policy delays playback
        });
    }
  };

  useImperativeHandle(ref, () => ({
    seekTo: (seconds: number) => {
      applySeek(seconds);
    },
    play: () => {
      videoRef.current?.play().catch(() => {});
      setIsPlaying(true);
    },
    pause: () => {
      videoRef.current?.pause();
      setIsPlaying(false);
    },
    getCurrentTime: () => videoRef.current?.currentTime || 0,
  }));

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleTime = () => {
      if (!isScrubbing) {
        const time = video.currentTime;
        setCurrentTime(time);
        if (onTimeUpdate) onTimeUpdate(time);

        // If time is advancing and user was seeking to a target, clear once reached
        if (seekingTargetTime !== null && !video.paused) {
          if (time >= seekingTargetTime || Math.abs(time - seekingTargetTime) < 1.0) {
            setSeekingTargetTime(null);
            setIsBuffering(false);
            setIsPlaying(true);
          }
        }
      }
    };

    const handleLoadedMetadata = () => {
      setDuration(video.duration || 0);
    };

    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);
    const handleWaiting = () => setIsBuffering(true);
    const handlePlaying = () => {
      setIsBuffering(false);
      setSeekingTargetTime(null);
      setIsPlaying(true);
    };
    const handleSeeking = () => setIsBuffering(true);
    const handleSeeked = () => {
      setIsBuffering(false);
      setSeekingTargetTime(null);
    };
    const handleCanPlay = () => {
      setIsBuffering(false);
    };
    const handleCanPlayThrough = () => {
      setIsBuffering(false);
    };
    const handleLoadedData = () => {
      setIsBuffering(false);
      setPlaybackError(null);
    };

    const handleError = () => {
      const err = video.error;
      let msg = 'Browser failed to decode this video stream.';
      if (err) {
        if (err.code === 3) {
          msg = 'Decoding error: The video codec (like 10-bit HEVC) or audio format is incompatible with native browser playback.';
        } else if (err.code === 4) {
          msg = 'Format not supported: Your browser cannot play this video codec directly without transcoding.';
        } else if (err.code === 2) {
          msg = 'Network error while loading video stream.';
        }
      }
      setPlaybackError(msg);
      setIsBuffering(false);
    };

    video.addEventListener('timeupdate', handleTime);
    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);
    video.addEventListener('waiting', handleWaiting);
    video.addEventListener('playing', handlePlaying);
    video.addEventListener('seeking', handleSeeking);
    video.addEventListener('seeked', handleSeeked);
    video.addEventListener('canplay', handleCanPlay);
    video.addEventListener('canplaythrough', handleCanPlayThrough);
    video.addEventListener('loadeddata', handleLoadedData);
    video.addEventListener('error', handleError);

    return () => {
      video.removeEventListener('timeupdate', handleTime);
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
      video.removeEventListener('waiting', handleWaiting);
      video.removeEventListener('playing', handlePlaying);
      video.removeEventListener('seeking', handleSeeking);
      video.removeEventListener('seeked', handleSeeked);
      video.removeEventListener('canplay', handleCanPlay);
      video.removeEventListener('canplaythrough', handleCanPlayThrough);
      video.removeEventListener('loadeddata', handleLoadedData);
      video.removeEventListener('error', handleError);
    };
  }, [onTimeUpdate, isScrubbing, seekingTargetTime]);

  // Reset error on src change
  useEffect(() => {
    setPlaybackError(null);
  }, [src]);

  // Safety fallback: Never let buffering state get stuck
  useEffect(() => {
    if (!isBuffering && seekingTargetTime === null) return;
    const timer = setTimeout(() => {
      setIsBuffering(false);
      setSeekingTargetTime(null);
    }, 2500);
    return () => clearTimeout(timer);
  }, [isBuffering, seekingTargetTime]);

  const togglePlay = () => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
      setIsPlaying(false);
    } else {
      videoRef.current.play().catch(() => {});
      setIsPlaying(true);
    }
  };

  const toggleMute = () => {
    if (!videoRef.current) return;
    videoRef.current.muted = !isMuted;
    setIsMuted(!isMuted);
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

  const skipSeconds = (seconds: number) => {
    if (!videoRef.current) return;
    const target = Math.max(0, Math.min(videoRef.current.currentTime + seconds, duration || 99999));
    applySeek(target);
  };

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

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };

  const displayTime = isScrubbing ? scrubTime : currentTime;

  return (
    <div
      ref={containerRef}
      className="relative group rounded-2xl overflow-hidden bg-black/90 border border-slate-800 shadow-2xl transition-all"
    >
      <video
        ref={videoRef}
        src={src}
        poster={poster}
        className="w-full aspect-video object-contain bg-black cursor-pointer"
        onClick={togglePlay}
        playsInline
      />

      {/* Buffering & Seeking To Startpoint Overlay */}
      {(isBuffering || seekingTargetTime !== null) && (
        <div className="absolute inset-0 bg-black/75 backdrop-blur-[2px] flex flex-col items-center justify-center space-y-3 z-20 pointer-events-none animate-in fade-in duration-150">
          <div className="relative flex items-center justify-center">
            <div className="w-14 h-14 rounded-full border-2 border-blue-500/20 border-t-blue-500 animate-spin" />
            <Play className="w-5 h-5 text-blue-400 absolute fill-current ml-0.5 opacity-80" />
          </div>
          <div className="text-center space-y-1">
            <div className="flex items-center justify-center space-x-2">
              <Loader2 className="w-3.5 h-3.5 text-blue-400 animate-spin" />
              <span className="text-xs font-semibold text-white tracking-wide">
                {seekingTargetTime !== null
                  ? `Seeking to Clip Start Point (${formatTime(seekingTargetTime)})...`
                  : 'Buffering Video Stream...'}
              </span>
            </div>
            <p className="text-[11px] font-mono text-slate-400">
              {seekingTargetTime !== null
                ? activeSceneRange
                  ? `Scene Range: ${formatTime(activeSceneRange.start)} → ${formatTime(activeSceneRange.end)}`
                  : `Positioning playhead to ${formatTime(seekingTargetTime)}`
                : 'Loading high-definition video chunks'}
            </p>
          </div>
        </div>
      )}

      {/* Center Big Play Button overlay on pause */}
      {!isPlaying && !isBuffering && seekingTargetTime === null && (
        <button
          onClick={togglePlay}
          className="absolute inset-0 m-auto w-16 h-16 rounded-full bg-blue-600/80 hover:bg-blue-600 text-white flex items-center justify-center shadow-xl backdrop-blur-sm transition-transform hover:scale-110 active:scale-95 z-20"
        >
          <Play className="w-8 h-8 ml-1 fill-white" />
        </button>
      )}

      {/* Active Scene Overlay Badge */}
      {activeSceneRange && (
        <div className="absolute top-4 left-4 z-20 px-3 py-1 rounded-md bg-blue-600/90 text-white text-xs font-semibold backdrop-blur-md shadow-md border border-blue-400/30 flex items-center space-x-1.5">
          <span className="w-2 h-2 rounded-full bg-cyan-300 animate-ping" />
          <span>Scene: {formatTime(activeSceneRange.start)} → {formatTime(activeSceneRange.end)}</span>
        </div>
      )}

      {/* Player Controls Bar */}
      <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/95 via-black/70 to-transparent p-4 flex flex-col gap-2 z-20 opacity-90 group-hover:opacity-100 transition-opacity">
        {/* Timeline Slider with Active Scene Range Indicator */}
        <div className="relative w-full flex items-center">
          <input
            type="range"
            min={0}
            max={duration || 100}
            step={0.1}
            value={displayTime}
            onPointerDown={handlePointerDown}
            onChange={handleScrubChange}
            onPointerUp={handlePointerUp}
            onKeyUp={(e) => {
              if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
                applySeek(parseFloat((e.target as HTMLInputElement).value));
              }
            }}
            className="w-full h-1.5 bg-slate-700/80 rounded-lg appearance-none cursor-pointer accent-blue-500 hover:h-2 transition-all"
          />

          {/* Active scene marker highlight */}
          {activeSceneRange && duration > 0 && (
            <div
              className="absolute top-0 h-1.5 bg-cyan-400/60 rounded pointer-events-none"
              style={{
                left: `${(activeSceneRange.start / duration) * 100}%`,
                width: `${((activeSceneRange.end - activeSceneRange.start) / duration) * 100}%`,
              }}
            />
          )}
        </div>

        {/* Buttons and Timers */}
        <div className="flex items-center justify-between text-slate-200">
          <div className="flex items-center space-x-3">
            <button
              onClick={togglePlay}
              className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-200 hover:text-white transition-colors"
              title={isPlaying ? 'Pause' : 'Play'}
            >
              {isPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current" />}
            </button>

            <button
              onClick={() => skipSeconds(-5)}
              className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
              title="Rewind 5s"
            >
              <RotateCcw className="w-4 h-4" />
            </button>

            <button
              onClick={() => skipSeconds(5)}
              className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
              title="Forward 5s"
            >
              <RotateCw className="w-4 h-4" />
            </button>

            {/* Time display */}
            <div className="text-xs font-mono text-slate-300">
              <span className="text-blue-400 font-semibold">{formatTime(displayTime)}</span>
              <span className="text-slate-500 mx-1.5">/</span>
              <span>{formatTime(duration)}</span>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            {onRequestClip && (
              <button
                onClick={() => onRequestClip(currentTime)}
                className="flex items-center space-x-1.5 px-2.5 py-1 rounded-lg bg-indigo-600/30 hover:bg-indigo-600/60 text-indigo-300 hover:text-white text-xs font-medium border border-indigo-500/30 transition-all"
                title="Create video clip around this moment"
              >
                <Scissors className="w-3.5 h-3.5" />
                <span>Clip Here</span>
              </button>
            )}

            {/* Volume */}
            <div className="flex items-center space-x-1.5">
              <button onClick={toggleMute} className="p-1 hover:text-white text-slate-400">
                {isMuted || volume === 0 ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
              </button>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={isMuted ? 0 : volume}
                onChange={handleVolumeChange}
                className="w-16 h-1 bg-slate-700 rounded appearance-none cursor-pointer accent-blue-400"
              />
            </div>

            {/* Fullscreen */}
            <button
              onClick={toggleFullscreen}
              className="p-1 hover:text-white text-slate-400 transition-colors"
              title="Toggle Fullscreen"
            >
              <Maximize className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
});

VideoPlayer.displayName = 'VideoPlayer';

export default VideoPlayer;

'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import {
  X,
  Scissors,
  Download,
  Play,
  Pause,
  CheckCircle2,
  Loader2,
  Sparkles,
  Film,
  RotateCcw,
  Volume2,
  VolumeX,
  Repeat,
  ChevronLeft,
  ChevronRight,
  Maximize2
} from 'lucide-react';
import { formatTime } from './VideoPlayer';

interface ClipModalProps {
  isOpen: boolean;
  onClose: () => void;
  videoId: string;
  initialStart: number;
  initialEnd: number;
  sceneId?: string;
  query?: string;
  isAiVerified?: boolean;
}

export default function ClipModal({
  isOpen,
  onClose,
  videoId,
  initialStart,
  initialEnd,
  sceneId,
  query,
  isAiVerified,
}: ClipModalProps) {
  const [startTime, setStartTime] = useState<number>(initialStart);
  const [endTime, setEndTime] = useState<number>(initialEnd);
  const [duration, setDuration] = useState<number>(0);
  const [videoSrc, setVideoSrc] = useState<string>('');
  const [posterUrl, setPosterUrl] = useState<string>('');
  const [currentTime, setCurrentTime] = useState<number>(initialStart);

  const [isPlayingPreview, setIsPlayingPreview] = useState<boolean>(false);
  const [isLooping, setIsLooping] = useState<boolean>(false);
  const [isMuted, setIsMuted] = useState<boolean>(false);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [clipStatus, setClipStatus] = useState<'idle' | 'processing' | 'completed' | 'failed'>('idle');
  const [generatedClip, setGeneratedClip] = useState<any | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);

  // Initialize and load video metadata
  useEffect(() => {
    if (!isOpen || !videoId) return;

    setStartTime(initialStart);
    setEndTime(initialEnd);
    setCurrentTime(initialStart);
    setClipStatus('idle');
    setProgress(0);
    setGeneratedClip(null);
    setErrorMsg(null);
    setIsPlayingPreview(false);
    setPosterUrl(`/api/media/thumbnails/thumb_${videoId}.jpg`);

    // Fetch video info to get media storagePath and accurate total duration
    fetch(`/api/videos/${videoId}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.video) {
          if (data.video.storagePath) {
            setVideoSrc(`/api/media/${data.video.storagePath}`);
          }
          if (data.video.duration && data.video.duration > 0) {
            setDuration(data.video.duration);
          }
        }
      })
      .catch((err) => console.error('Failed to load video details for clip preview:', err));
  }, [videoId, initialStart, initialEnd, isOpen]);

  // Clean up video playback on close
  useEffect(() => {
    if (!isOpen && videoRef.current) {
      videoRef.current.pause();
      setIsPlayingPreview(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const totalDuration = duration > 0 ? duration : Math.max(endTime * 1.2, 30);

  // Toggle preview playback of the selected range
  const handleTogglePreview = () => {
    const video = videoRef.current;
    if (!video) return;

    if (isPlayingPreview) {
      video.pause();
      setIsPlayingPreview(false);
    } else {
      // If playhead is outside or at end of trimmed range, restart from startTime
      if (video.currentTime < startTime || video.currentTime >= endTime) {
        video.currentTime = startTime;
        setCurrentTime(startTime);
      }
      video
        .play()
        .then(() => setIsPlayingPreview(true))
        .catch((e) => {
          console.warn('Playback error:', e);
          setIsPlayingPreview(false);
        });
    }
  };

  const handleTimeUpdate = () => {
    const video = videoRef.current;
    if (!video) return;
    const curr = video.currentTime;
    setCurrentTime(curr);

    if (isPlayingPreview) {
      if (curr >= endTime) {
        if (isLooping) {
          video.currentTime = startTime;
          video.play().catch(console.error);
        } else {
          video.pause();
          video.currentTime = startTime;
          setCurrentTime(startTime);
          setIsPlayingPreview(false);
        }
      }
    }
  };

  const handleStartTimeChange = (val: number) => {
    const clamped = Math.max(0, Math.min(val, endTime - 0.2));
    const formatted = parseFloat(clamped.toFixed(1));
    setStartTime(formatted);
    if (videoRef.current && !isPlayingPreview) {
      videoRef.current.currentTime = formatted;
      setCurrentTime(formatted);
    }
  };

  const handleEndTimeChange = (val: number) => {
    const clamped = Math.min(totalDuration, Math.max(val, startTime + 0.2));
    const formatted = parseFloat(clamped.toFixed(1));
    setEndTime(formatted);
    if (videoRef.current && !isPlayingPreview) {
      videoRef.current.currentTime = formatted;
      setCurrentTime(formatted);
    }
  };

  const nudgeStart = (delta: number) => {
    handleStartTimeChange(startTime + delta);
  };

  const nudgeEnd = (delta: number) => {
    handleEndTimeChange(endTime + delta);
  };

  const jumpToStart = () => {
    if (videoRef.current) {
      videoRef.current.currentTime = startTime;
      setCurrentTime(startTime);
    }
  };

  const jumpToEnd = () => {
    if (videoRef.current) {
      videoRef.current.currentTime = endTime;
      setCurrentTime(endTime);
    }
  };

  const handleCreateClip = async () => {
    if (startTime >= endTime) {
      setErrorMsg('Start time must be less than end time.');
      return;
    }

    if (videoRef.current) {
      videoRef.current.pause();
      setIsPlayingPreview(false);
    }

    setIsSubmitting(true);
    setErrorMsg(null);
    setClipStatus('processing');
    setProgress(10);

    try {
      const res = await fetch(`/api/videos/${videoId}/clips`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          startTime,
          endTime,
          sceneId,
          query,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to trigger clip creation');

      const clipId = data.clip.id;

      // Poll clip status until complete
      const pollInterval = setInterval(async () => {
        try {
          const pollRes = await fetch(`/api/clips/${clipId}`);
          if (pollRes.ok) {
            const pollData = await pollRes.json();
            const c = pollData.clip;
            setProgress(c.progress || 30);

            if (c.status === 'completed') {
              clearInterval(pollInterval);
              setClipStatus('completed');
              setGeneratedClip(c);
              setIsSubmitting(false);
            } else if (c.status === 'failed') {
              clearInterval(pollInterval);
              setClipStatus('failed');
              setErrorMsg(c.errorMessage || 'FFmpeg clip creation failed');
              setIsSubmitting(false);
            }
          }
        } catch (e) {
          // ignore transient poll error
        }
      }, 750);
    } catch (err: any) {
      setIsSubmitting(false);
      setClipStatus('failed');
      setErrorMsg(err.message);
    }
  };

  // Safe percentage calculation
  const startPercent = Math.max(0, Math.min(100, (startTime / totalDuration) * 100));
  const endPercent = Math.max(0, Math.min(100, (endTime / totalDuration) * 100));
  const currentPercent = Math.max(0, Math.min(100, (currentTime / totalDuration) * 100));
  const clipLength = Math.max(0, endTime - startTime);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md animate-in fade-in">
      <div className="w-full max-w-2xl bg-[#0b101b] border border-slate-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800/80 bg-slate-950/70 shrink-0">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-xl bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
              <Scissors className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-white text-base">Trim & Create Video Clip</h3>
              <p className="text-xs text-slate-400">Interactive frame trimmer & range preview</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-5 flex-1">
          {isAiVerified && (
            <div className="flex items-center space-x-2 px-3 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-medium">
              <Sparkles className="w-4 h-4 text-emerald-300 shrink-0" />
              <span>AI Verified Temporal Boundaries Active (Exact Scene Cut)</span>
            </div>
          )}

          {clipStatus === 'idle' && (
            <div className="space-y-4">
              {/* Video Player on Top */}
              <div className="relative aspect-video max-h-[290px] w-full bg-slate-950 rounded-2xl overflow-hidden border border-slate-800 shadow-lg group">
                <video
                  ref={videoRef}
                  src={videoSrc || undefined}
                  poster={posterUrl}
                  onTimeUpdate={handleTimeUpdate}
                  onLoadedMetadata={(e) => {
                    const d = e.currentTarget.duration;
                    if (d && !isNaN(d) && d > 0) setDuration(d);
                  }}
                  playsInline
                  muted={isMuted}
                  className="w-full h-full object-contain cursor-pointer"
                  onClick={handleTogglePreview}
                />

                {/* Top Badge: Mode Indicator */}
                <div className="absolute top-3 left-3 z-10 flex items-center space-x-2">
                  <div
                    className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold backdrop-blur-md border ${
                      isPlayingPreview
                        ? 'bg-blue-600/90 text-white border-blue-400/40 animate-pulse'
                        : 'bg-black/60 text-slate-300 border-slate-700/60'
                    }`}
                  >
                    {isPlayingPreview ? (
                      <>
                        <Play className="w-3 h-3 fill-current text-white" />
                        <span>Previewing Range</span>
                      </>
                    ) : (
                      <>
                        <Film className="w-3 h-3 text-indigo-400" />
                        <span>Trimmer View</span>
                      </>
                    )}
                  </div>

                  {isLooping && isPlayingPreview && (
                    <span className="px-2 py-0.5 rounded-md bg-indigo-500/80 text-white text-[10px] font-medium backdrop-blur-md">
                      Looping
                    </span>
                  )}
                </div>

                {/* Bottom Left: Playback Time / Duration */}
                <div className="absolute bottom-3 left-3 z-10 px-2.5 py-1 rounded-lg bg-black/80 text-xs font-mono text-slate-200 backdrop-blur-md border border-slate-800 flex items-center space-x-1.5">
                  <span className="text-white font-semibold">{formatTime(currentTime)}</span>
                  <span className="text-slate-500">/</span>
                  <span className="text-slate-400">{formatTime(totalDuration)}</span>
                </div>

                {/* Bottom Right: Audio & Center Controls */}
                <div className="absolute bottom-3 right-3 z-10 flex items-center space-x-2">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsMuted(!isMuted);
                    }}
                    className="p-1.5 rounded-lg bg-black/80 hover:bg-black text-slate-300 hover:text-white border border-slate-800 backdrop-blur-md transition-colors"
                    title={isMuted ? 'Unmute' : 'Mute'}
                  >
                    {isMuted ? <VolumeX className="w-3.5 h-3.5 text-red-400" /> : <Volume2 className="w-3.5 h-3.5" />}
                  </button>
                </div>

                {/* Centered Big Play Overlay on Hover / Pause */}
                {!isPlayingPreview && (
                  <button
                    type="button"
                    onClick={handleTogglePreview}
                    className="absolute inset-0 m-auto w-12 h-12 rounded-full bg-blue-600/80 hover:bg-blue-600 text-white flex items-center justify-center backdrop-blur-sm shadow-xl transition-transform hover:scale-110 active:scale-95 z-10"
                    title="Play selection preview"
                  >
                    <Play className="w-5 h-5 fill-current ml-0.5" />
                  </button>
                )}
              </div>

              {/* Range Trimmer / Dual Slider Track */}
              <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800/80 space-y-3">
                {/* Timeline Header Info */}
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center space-x-1.5 text-blue-400 font-semibold font-mono">
                    <span className="text-slate-400 text-[11px] font-sans font-normal">Start:</span>
                    <span>{formatTime(startTime)}</span>
                  </div>

                  <div className="px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/30 text-indigo-300 font-semibold text-xs flex items-center space-x-1.5">
                    <Scissors className="w-3 h-3 text-indigo-400" />
                    <span>Selected: {clipLength.toFixed(1)}s</span>
                  </div>

                  <div className="flex items-center space-x-1.5 text-purple-400 font-semibold font-mono">
                    <span className="text-slate-400 text-[11px] font-sans font-normal">End:</span>
                    <span>{formatTime(endTime)}</span>
                  </div>
                </div>

                {/* Interactive Dual Slider Track */}
                <div className="relative w-full h-8 flex items-center select-none pt-1">
                  {/* Background Track */}
                  <div
                    className="absolute inset-x-0 h-3 bg-slate-800 rounded-full overflow-hidden cursor-pointer"
                    onClick={(e) => {
                      const rect = e.currentTarget.getBoundingClientRect();
                      const ratio = (e.clientX - rect.left) / rect.width;
                      const clickTime = parseFloat((ratio * totalDuration).toFixed(1));
                      if (videoRef.current) {
                        videoRef.current.currentTime = clickTime;
                        setCurrentTime(clickTime);
                      }
                    }}
                  >
                    {/* Active Highlighted Range */}
                    <div
                      className="absolute h-full bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500 opacity-90 shadow-md"
                      style={{
                        left: `${startPercent}%`,
                        width: `${Math.max(0, endPercent - startPercent)}%`,
                      }}
                    />
                  </div>

                  {/* Playhead Marker */}
                  <div
                    className="absolute top-1 bottom-1 w-0.5 bg-amber-400 z-10 pointer-events-none transition-all duration-75"
                    style={{ left: `${currentPercent}%` }}
                  >
                    <div className="w-2.5 h-2.5 -ml-[4px] -mt-1 rounded-full bg-amber-400 shadow-md shadow-amber-400/50" />
                  </div>

                  {/* Left / Start Range Slider Thumb */}
                  <input
                    type="range"
                    min={0}
                    max={totalDuration}
                    step={0.1}
                    value={startTime}
                    onChange={(e) => handleStartTimeChange(parseFloat(e.target.value) || 0)}
                    className="absolute inset-0 w-full appearance-none bg-transparent pointer-events-none z-20 focus:outline-none [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-7 [&::-webkit-slider-thumb]:rounded-md [&::-webkit-slider-thumb]:bg-blue-500 [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white [&::-webkit-slider-thumb]:cursor-ew-resize [&::-webkit-slider-thumb]:shadow-lg [&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:h-7 [&::-moz-range-thumb]:rounded-md [&::-moz-range-thumb]:bg-blue-500 [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-white [&::-moz-range-thumb]:cursor-ew-resize"
                    title={`Start cut: ${formatTime(startTime)}`}
                  />

                  {/* Right / End Range Slider Thumb */}
                  <input
                    type="range"
                    min={0}
                    max={totalDuration}
                    step={0.1}
                    value={endTime}
                    onChange={(e) => handleEndTimeChange(parseFloat(e.target.value) || 0)}
                    className="absolute inset-0 w-full appearance-none bg-transparent pointer-events-none z-20 focus:outline-none [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-7 [&::-webkit-slider-thumb]:rounded-md [&::-webkit-slider-thumb]:bg-purple-500 [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white [&::-webkit-slider-thumb]:cursor-ew-resize [&::-webkit-slider-thumb]:shadow-lg [&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:h-7 [&::-moz-range-thumb]:rounded-md [&::-moz-range-thumb]:bg-purple-500 [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-white [&::-moz-range-thumb]:cursor-ew-resize"
                    title={`End cut: ${formatTime(endTime)}`}
                  />
                </div>

                {/* Preview and Quick-Set Action Buttons */}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-800/80">
                  <div className="flex items-center space-x-2">
                    <button
                      type="button"
                      onClick={handleTogglePreview}
                      className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xl font-semibold text-xs shadow-md transition-all cursor-pointer ${
                        isPlayingPreview
                          ? 'bg-amber-600 hover:bg-amber-500 text-white shadow-amber-600/20'
                          : 'bg-blue-600 hover:bg-blue-500 text-white shadow-blue-600/20'
                      }`}
                    >
                      {isPlayingPreview ? (
                        <>
                          <Pause className="w-3.5 h-3.5 fill-current" />
                          <span>Pause Preview</span>
                        </>
                      ) : (
                        <>
                          <Play className="w-3.5 h-3.5 fill-current" />
                          <span>Preview Clip</span>
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => setIsLooping(!isLooping)}
                      className={`flex items-center space-x-1 px-2.5 py-1.5 rounded-xl border text-xs font-medium transition-colors ${
                        isLooping
                          ? 'bg-indigo-600/20 border-indigo-500/50 text-indigo-300'
                          : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                      }`}
                      title="Loop playback while previewing"
                    >
                      <Repeat className="w-3.5 h-3.5" />
                      <span>Loop</span>
                    </button>

                    <button
                      type="button"
                      onClick={jumpToStart}
                      className="px-2 py-1.5 rounded-xl bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-400 hover:text-white text-xs transition-colors"
                      title="Seek to start cut frame"
                    >
                      Jump to Start
                    </button>

                    <button
                      type="button"
                      onClick={jumpToEnd}
                      className="px-2 py-1.5 rounded-xl bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-400 hover:text-white text-xs transition-colors"
                      title="Seek to end cut frame"
                    >
                      Jump to End
                    </button>
                  </div>

                  <div className="flex items-center space-x-1.5">
                    <button
                      type="button"
                      onClick={() => handleStartTimeChange(currentTime)}
                      className="px-2.5 py-1.5 rounded-xl bg-blue-500/10 hover:bg-blue-500/20 text-blue-300 hover:text-white border border-blue-500/30 text-xs font-medium transition-all"
                      title="Set start cut to current video frame"
                    >
                      Set Start Here
                    </button>
                    <button
                      type="button"
                      onClick={() => handleEndTimeChange(currentTime)}
                      className="px-2.5 py-1.5 rounded-xl bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 hover:text-white border border-purple-500/30 text-xs font-medium transition-all"
                      title="Set end cut to current video frame"
                    >
                      Set End Here
                    </button>
                  </div>
                </div>
              </div>

              {/* Precision Numeric Time Adjustment Inputs */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                {/* Start Trim Input */}
                <div className="p-3 rounded-2xl bg-slate-950/60 border border-slate-800/80 space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-medium text-blue-400 flex items-center space-x-1">
                      <span>Cut Start (seconds)</span>
                    </label>
                    <span className="text-[11px] font-mono text-slate-400">{formatTime(startTime)}</span>
                  </div>

                  <div className="flex items-center space-x-1.5">
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      max={endTime - 0.2}
                      value={startTime}
                      onChange={(e) => handleStartTimeChange(parseFloat(e.target.value) || 0)}
                      className="w-full px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-xl text-white text-xs font-mono focus:outline-none focus:border-blue-500"
                    />
                    <div className="flex items-center space-x-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => nudgeStart(-1)}
                        className="px-1.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-[11px] text-slate-400 hover:text-white border border-slate-800"
                        title="-1 second"
                      >
                        -1s
                      </button>
                      <button
                        type="button"
                        onClick={() => nudgeStart(-0.1)}
                        className="px-1.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-[11px] text-slate-400 hover:text-white border border-slate-800"
                        title="-0.1 second"
                      >
                        -0.1s
                      </button>
                      <button
                        type="button"
                        onClick={() => nudgeStart(0.1)}
                        className="px-1.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-[11px] text-slate-400 hover:text-white border border-slate-800"
                        title="+0.1 second"
                      >
                        +0.1s
                      </button>
                      <button
                        type="button"
                        onClick={() => nudgeStart(1)}
                        className="px-1.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-[11px] text-slate-400 hover:text-white border border-slate-800"
                        title="+1 second"
                      >
                        +1s
                      </button>
                    </div>
                  </div>
                </div>

                {/* End Trim Input */}
                <div className="p-3 rounded-2xl bg-slate-950/60 border border-slate-800/80 space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-medium text-purple-400 flex items-center space-x-1">
                      <span>Cut End (seconds)</span>
                    </label>
                    <span className="text-[11px] font-mono text-slate-400">{formatTime(endTime)}</span>
                  </div>

                  <div className="flex items-center space-x-1.5">
                    <input
                      type="number"
                      step="0.1"
                      min={startTime + 0.2}
                      max={totalDuration}
                      value={endTime}
                      onChange={(e) => handleEndTimeChange(parseFloat(e.target.value) || 0)}
                      className="w-full px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-xl text-white text-xs font-mono focus:outline-none focus:border-purple-500"
                    />
                    <div className="flex items-center space-x-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => nudgeEnd(-1)}
                        className="px-1.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-[11px] text-slate-400 hover:text-white border border-slate-800"
                        title="-1 second"
                      >
                        -1s
                      </button>
                      <button
                        type="button"
                        onClick={() => nudgeEnd(-0.1)}
                        className="px-1.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-[11px] text-slate-400 hover:text-white border border-slate-800"
                        title="-0.1 second"
                      >
                        -0.1s
                      </button>
                      <button
                        type="button"
                        onClick={() => nudgeEnd(0.1)}
                        className="px-1.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-[11px] text-slate-400 hover:text-white border border-slate-800"
                        title="+0.1 second"
                      >
                        +0.1s
                      </button>
                      <button
                        type="button"
                        onClick={() => nudgeEnd(1)}
                        className="px-1.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-[11px] text-slate-400 hover:text-white border border-slate-800"
                        title="+1 second"
                      >
                        +1s
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {errorMsg && (
                <div className="p-3 bg-red-500/10 border border-red-500/30 text-red-400 text-xs rounded-xl">
                  {errorMsg}
                </div>
              )}
            </div>
          )}

          {/* Processing State */}
          {clipStatus === 'processing' && (
            <div className="py-12 space-y-4 text-center">
              <Loader2 className="w-12 h-12 text-blue-500 animate-spin mx-auto" />
              <div>
                <h4 className="font-semibold text-white text-base">Rendering High-Quality Clip...</h4>
                <p className="text-xs text-slate-400 mt-1">
                  Trimming from <span className="font-mono text-blue-400">{formatTime(startTime)}</span> to{' '}
                  <span className="font-mono text-purple-400">{formatTime(endTime)}</span> ({clipLength.toFixed(1)}s)
                </p>
              </div>

              {/* Progress bar */}
              <div className="w-full max-w-md mx-auto bg-slate-800 h-2.5 rounded-full overflow-hidden">
                <div
                  className="bg-gradient-to-r from-blue-500 to-indigo-500 h-full transition-all duration-300 rounded-full"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <span className="text-xs text-slate-400 font-mono">{progress}% completed</span>
            </div>
          )}

          {/* Completed State */}
          {clipStatus === 'completed' && generatedClip && (
            <div className="space-y-4">
              <div className="flex items-center space-x-2 text-emerald-400 text-sm font-semibold">
                <CheckCircle2 className="w-5 h-5" />
                <span>Clip Generated Successfully! ({generatedClip.duration}s)</span>
              </div>

              {/* Video Player for the Newly Rendered Clip */}
              <div className="rounded-2xl overflow-hidden border border-slate-800 bg-black aspect-video max-h-[320px]">
                <video
                  src={generatedClip.mediaUrl}
                  controls
                  autoPlay
                  className="w-full h-full object-contain"
                />
              </div>

              <div className="flex items-center justify-between gap-3 pt-2">
                <a
                  href={generatedClip.mediaUrl}
                  download={`clip_${Math.round(startTime)}s_${Math.round(endTime)}s.mp4`}
                  className="flex-1 flex items-center justify-center space-x-2 py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-xl shadow-lg shadow-emerald-600/20 transition-all cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  <span>Download MP4 Clip</span>
                </a>

                <Link
                  href={`/videos/${videoId}?t=${startTime}&end=${endTime}&sceneId=${sceneId || ''}`}
                  onClick={onClose}
                  className="flex-1 flex items-center justify-center space-x-2 py-2.5 px-4 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl border border-slate-700 transition-all text-center"
                  title="Open video studio positioned at this clip"
                >
                  <Film className="w-4 h-4 text-blue-400" />
                  <span>View in Video Studio</span>
                </Link>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        {clipStatus === 'idle' && (
          <div className="px-6 py-4 border-t border-slate-800/80 bg-slate-950/80 flex items-center justify-between shrink-0">
            <button
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-slate-400 hover:text-white transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleCreateClip}
              disabled={isSubmitting}
              className="flex items-center space-x-2 px-5 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-bold rounded-xl shadow-lg shadow-blue-500/20 transition-all cursor-pointer hover:scale-[1.02] active:scale-[0.98]"
            >
              <Scissors className="w-4 h-4" />
              <span>Trim & Render ({clipLength.toFixed(1)}s)</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

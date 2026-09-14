'use client';

import React, { useState, useEffect } from 'react';
import { X, Scissors, Download, Play, CheckCircle2, Loader2, Sparkles } from 'lucide-react';
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
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [clipStatus, setClipStatus] = useState<'idle' | 'processing' | 'completed' | 'failed'>('idle');
  const [generatedClip, setGeneratedClip] = useState<any | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    setStartTime(initialStart);
    setEndTime(initialEnd);
    setClipStatus('idle');
    setProgress(0);
    setGeneratedClip(null);
    setErrorMsg(null);
  }, [initialStart, initialEnd, isOpen]);

  if (!isOpen) return null;

  const handleCreateClip = async () => {
    if (startTime >= endTime) {
      setErrorMsg('Start time must be less than end time.');
      return;
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
          // ignore
        }
      }, 750);
    } catch (err: any) {
      setIsSubmitting(false);
      setClipStatus('failed');
      setErrorMsg(err.message);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
      <div className="w-full max-w-lg bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/50">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
              <Scissors className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-semibold text-white text-base">Generate Video Clip</h3>
              <p className="text-xs text-slate-400">Frame-accurate cut via FFmpeg</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5">
          {isAiVerified && (
            <div className="flex items-center space-x-2 px-3 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-medium">
              <Sparkles className="w-4 h-4 text-emerald-300" />
              <span>AI Verified Temporal Boundaries Active</span>
            </div>
          )}

          {clipStatus === 'idle' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Start Time (seconds)</label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    value={startTime}
                    onChange={(e) => setStartTime(parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500"
                  />
                  <span className="text-[11px] font-mono text-slate-500 mt-1 block">
                    {formatTime(startTime)}
                  </span>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">End Time (seconds)</label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    value={endTime}
                    onChange={(e) => setEndTime(parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500"
                  />
                  <span className="text-[11px] font-mono text-slate-500 mt-1 block">
                    {formatTime(endTime)}
                  </span>
                </div>
              </div>

              <div className="p-3 bg-slate-950/60 rounded-lg border border-slate-800/80 text-xs text-slate-400 flex items-center justify-between">
                <span>Calculated Clip Duration:</span>
                <span className="font-semibold text-blue-400">
                  {Math.max(0, endTime - startTime).toFixed(1)} seconds
                </span>
              </div>

              {errorMsg && (
                <div className="p-3 bg-red-500/10 border border-red-500/30 text-red-400 text-xs rounded-lg">
                  {errorMsg}
                </div>
              )}
            </div>
          )}

          {clipStatus === 'processing' && (
            <div className="py-6 space-y-4 text-center">
              <Loader2 className="w-10 h-10 text-blue-500 animate-spin mx-auto" />
              <div>
                <h4 className="font-medium text-slate-200">Creating Video Clip...</h4>
                <p className="text-xs text-slate-400 mt-1">
                  Trimming from {formatTime(startTime)} to {formatTime(endTime)}
                </p>
              </div>

              {/* Progress bar */}
              <div className="w-full bg-slate-800 h-2.5 rounded-full overflow-hidden">
                <div
                  className="bg-blue-600 h-full transition-all duration-300 rounded-full"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <span className="text-xs text-slate-400 font-mono">{progress}% completed</span>
            </div>
          )}

          {clipStatus === 'completed' && generatedClip && (
            <div className="space-y-4">
              <div className="flex items-center space-x-2 text-emerald-400 text-sm font-semibold">
                <CheckCircle2 className="w-5 h-5" />
                <span>Clip Ready! ({generatedClip.duration}s)</span>
              </div>

              {/* Video Player for the Clip */}
              <div className="rounded-xl overflow-hidden border border-slate-800 bg-black aspect-video">
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
                  className="flex-1 flex items-center justify-center space-x-2 py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium rounded-xl shadow-lg shadow-emerald-600/20 transition-all"
                >
                  <Download className="w-4 h-4" />
                  <span>Download MP4 Clip</span>
                </a>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        {clipStatus === 'idle' && (
          <div className="px-6 py-4 border-t border-slate-800 bg-slate-900/80 flex items-center justify-end space-x-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-slate-400 hover:text-white transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleCreateClip}
              disabled={isSubmitting}
              className="flex items-center space-x-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-lg shadow-md shadow-blue-500/20 transition-all"
            >
              <Scissors className="w-3.5 h-3.5" />
              <span>Trim & Render Clip</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

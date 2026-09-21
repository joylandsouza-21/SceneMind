'use client';

import React, { useState } from 'react';
import { VideoScene } from '@/lib/db/types';
import { formatTime } from './VideoPlayer';

interface TimelineBarProps {
  duration: number;
  currentTime: number;
  scenes: VideoScene[];
  onSelectScene: (scene: VideoScene) => void;
  onSeek?: (seconds: number) => void;
  activeSceneId?: string;
}

export default function TimelineBar({
  duration,
  currentTime,
  scenes,
  onSelectScene,
  onSeek,
  activeSceneId,
}: TimelineBarProps) {
  const [hoveredScene, setHoveredScene] = useState<VideoScene | null>(null);
  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  if (duration <= 0) return null;

  const getSceneColor = (scene: VideoScene) => {
    const desc = scene.description.toLowerCase();
    const acts = scene.actions.join(' ').toLowerCase();
    const all = `${desc} ${acts}`;

    if (all.includes('fight') || all.includes('punch') || all.includes('confront')) {
      return 'from-rose-600 to-red-500 hover:from-rose-500 hover:to-red-400';
    }
    if (all.includes('car') || all.includes('accident') || all.includes('driv')) {
      return 'from-amber-600 to-yellow-500 hover:from-amber-500 hover:to-yellow-400';
    }
    if (all.includes('dog') || all.includes('park') || all.includes('run')) {
      return 'from-emerald-600 to-green-500 hover:from-emerald-500 hover:to-green-400';
    }
    if (all.includes('talk') || all.includes('conversation') || all.includes('kitchen')) {
      return 'from-blue-600 to-cyan-500 hover:from-blue-500 hover:to-cyan-400';
    }
    if (all.includes('building') || all.includes('office') || all.includes('enter')) {
      return 'from-purple-600 to-indigo-500 hover:from-purple-500 hover:to-indigo-400';
    }
    return 'from-slate-600 to-slate-500 hover:from-slate-500 hover:to-slate-400';
  };

  const getTimeFromEvent = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const pct = Math.max(0, Math.min(1, clickX / rect.width));
    return pct * duration;
  };

  const handleTrackClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const seekTime = getTimeFromEvent(e);
    if (onSeek) {
      onSeek(seekTime);
    }
    const matched = scenes.find((s) => seekTime >= s.startTime && seekTime <= s.endTime);
    if (matched) {
      onSelectScene(matched);
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const time = getTimeFromEvent(e);
    setHoverTime(time);
    const matched = scenes.find((s) => time >= s.startTime && time <= s.endTime);
    setHoveredScene(matched || null);

    if (isDragging && onSeek) {
      onSeek(time);
    }
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    setIsDragging(true);
    handleTrackClick(e);
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleMouseLeave = () => {
    setHoverTime(null);
    setHoveredScene(null);
    setIsDragging(false);
  };

  const playheadPercent = Math.min(100, Math.max(0, (currentTime / duration) * 100));

  return (
    <div className="w-full space-y-2 select-none">
      <div className="flex items-center justify-between text-xs text-slate-400">
        <span className="font-mono">00:00:00</span>
        <span className="text-slate-500 text-[11px] font-medium">
          {scenes.length} Indexed Scene{scenes.length !== 1 ? 's' : ''} • Click anywhere to seek
        </span>
        <span className="font-mono">{formatTime(duration)}</span>
      </div>

      {/* Visual Timeline Strip - Click and drag anywhere to seek */}
      <div
        onClick={handleTrackClick}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        className="relative w-full h-8 bg-slate-950 rounded-lg p-0.5 border border-slate-800 flex items-stretch overflow-hidden group cursor-pointer"
        title="Click anywhere to jump to timestamp"
      >
        {scenes.map((scene) => {
          const startPct = (scene.startTime / duration) * 100;
          const endPct = (scene.endTime / duration) * 100;
          const widthPct = Math.max(0.5, endPct - startPct);
          const isActive = scene.id === activeSceneId;

          return (
            <div
              key={scene.id}
              style={{
                left: `${startPct}%`,
                width: `${widthPct}%`,
              }}
              className={`absolute top-0.5 bottom-0.5 rounded transition-all duration-150 bg-gradient-to-r pointer-events-none ${getSceneColor(
                scene
              )} ${
                isActive
                  ? 'ring-2 ring-white z-20 brightness-125'
                  : 'opacity-85 group-hover:opacity-95'
              }`}
            />
          );
        })}

        {/* Hover position line */}
        {hoverTime !== null && (
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-blue-400/70 z-25 pointer-events-none"
            style={{ left: `${(hoverTime / duration) * 100}%` }}
          />
        )}

        {/* Current playback playhead */}
        <div
          className="absolute top-0 bottom-0 w-0.5 bg-white z-30 pointer-events-none shadow-[0_0_8px_white]"
          style={{ left: `${playheadPercent}%` }}
        >
          <div className="w-2.5 h-2.5 -ml-[4px] -mt-1 bg-white rounded-full shadow-md" />
        </div>
      </div>

      {/* Hover Tooltip or Active Scene Summary */}
      {(hoveredScene || hoverTime !== null) && (
        <div className="p-2.5 rounded-lg bg-slate-900 border border-blue-500/40 text-xs shadow-lg animate-in fade-in flex items-center justify-between">
          <div className="flex items-center space-x-2">
            {hoveredScene ? (
              <>
                <span className="font-bold text-blue-400">Scene #{hoveredScene.sceneNumber}:</span>
                <span className="text-slate-200 line-clamp-1">{hoveredScene.description}</span>
              </>
            ) : (
              <span className="text-slate-300">Seek to point</span>
            )}
          </div>
          <div className="flex items-center space-x-2 font-mono text-slate-400 text-[11px] whitespace-nowrap ml-3">
            {hoverTime !== null && (
              <span className="text-blue-300 font-bold bg-blue-950/80 px-1.5 py-0.5 rounded border border-blue-800/60">
                {formatTime(hoverTime)}
              </span>
            )}
            {hoveredScene && (
              <span>
                ({formatTime(hoveredScene.startTime)} → {formatTime(hoveredScene.endTime)})
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

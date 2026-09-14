'use client';

import React, { useState } from 'react';
import { VideoScene } from '@/lib/db/types';
import { formatTime } from './VideoPlayer';

interface TimelineBarProps {
  duration: number;
  currentTime: number;
  scenes: VideoScene[];
  onSelectScene: (scene: VideoScene) => void;
  activeSceneId?: string;
}

export default function TimelineBar({
  duration,
  currentTime,
  scenes,
  onSelectScene,
  activeSceneId,
}: TimelineBarProps) {
  const [hoveredScene, setHoveredScene] = useState<VideoScene | null>(null);

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

  const playheadPercent = Math.min(100, Math.max(0, (currentTime / duration) * 100));

  return (
    <div className="w-full space-y-2 select-none">
      <div className="flex items-center justify-between text-xs text-slate-400">
        <span className="font-mono">00:00:00</span>
        <span className="text-slate-500 text-[11px] font-medium">
          {scenes.length} Indexed Scene{scenes.length !== 1 ? 's' : ''}
        </span>
        <span className="font-mono">{formatTime(duration)}</span>
      </div>

      {/* Visual Timeline Strip */}
      <div className="relative w-full h-8 bg-slate-950 rounded-lg p-0.5 border border-slate-800 flex items-stretch overflow-hidden group">
        {scenes.map((scene) => {
          const startPct = (scene.startTime / duration) * 100;
          const endPct = (scene.endTime / duration) * 100;
          const widthPct = Math.max(0.5, endPct - startPct);
          const isActive = scene.id === activeSceneId;

          return (
            <div
              key={scene.id}
              onClick={() => onSelectScene(scene)}
              onMouseEnter={() => setHoveredScene(scene)}
              onMouseLeave={() => setHoveredScene(null)}
              style={{
                left: `${startPct}%`,
                width: `${widthPct}%`,
              }}
              className={`absolute top-0.5 bottom-0.5 rounded cursor-pointer transition-all duration-150 bg-gradient-to-r ${getSceneColor(
                scene
              )} ${
                isActive
                  ? 'ring-2 ring-white z-20 brightness-125'
                  : 'opacity-85 hover:opacity-100 hover:z-10'
              }`}
            />
          );
        })}

        {/* Current playback playhead */}
        <div
          className="absolute top-0 bottom-0 w-0.5 bg-white z-30 pointer-events-none shadow-[0_0_8px_white]"
          style={{ left: `${playheadPercent}%` }}
        >
          <div className="w-2 h-2 -ml-[3.5px] -mt-1 bg-white rounded-full shadow" />
        </div>
      </div>

      {/* Hover Tooltip or Active Scene Summary */}
      {hoveredScene && (
        <div className="p-2.5 rounded-lg bg-slate-900 border border-blue-500/40 text-xs shadow-lg animate-in fade-in flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <span className="font-bold text-blue-400">Scene #{hoveredScene.sceneNumber}:</span>
            <span className="text-slate-200 line-clamp-1">{hoveredScene.description}</span>
          </div>
          <span className="font-mono text-slate-400 text-[11px] whitespace-nowrap ml-3">
            {formatTime(hoveredScene.startTime)} → {formatTime(hoveredScene.endTime)}
          </span>
        </div>
      )}
    </div>
  );
}

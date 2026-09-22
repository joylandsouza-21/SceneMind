'use client';

import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Film, ChevronDown, Check, Clock, Layers, Folder, Search, X } from 'lucide-react';
import { formatTime } from '@/components/VideoPlayer';

export interface VideoOption {
  id: string;
  filename: string;
  duration?: number;
  sceneCount?: number;
  groupId?: string;
  groupName?: string;
  status?: string;
}

interface VideoSelectDropdownProps {
  videos: VideoOption[];
  selectedVideoId: string;
  onSelectVideo: (videoId: string) => void;
  selectedGroupId?: string;
  allLabel?: string;
  allValue?: string;
  className?: string;
  menuWidth?: string;
}

export default function VideoSelectDropdown({
  videos,
  selectedVideoId,
  onSelectVideo,
  selectedGroupId = 'all',
  allLabel = 'All Videos in Scope',
  allValue = 'all',
  className = '',
  menuWidth = 'w-full min-w-[260px]',
}: VideoSelectDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchFilter, setSearchFilter] = useState('');
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Filter videos by groupId if selectedGroupId is specified and not 'all'
  const scopedVideos = useMemo(() => {
    if (!selectedGroupId || selectedGroupId === 'all') return videos;
    return videos.filter((v) => v.groupId === selectedGroupId);
  }, [videos, selectedGroupId]);

  const filteredVideos = useMemo(() => {
    if (!searchFilter.trim()) return scopedVideos;
    const q = searchFilter.toLowerCase();
    return scopedVideos.filter(
      (v) =>
        v.filename.toLowerCase().includes(q) ||
        (v.groupName && v.groupName.toLowerCase().includes(q))
    );
  }, [scopedVideos, searchFilter]);

  const selectedVideo = videos.find((v) => v.id === selectedVideoId);

  const displayLabel = () => {
    if (selectedVideoId !== allValue && selectedVideo) {
      return selectedVideo.filename;
    }
    if (selectedGroupId && selectedGroupId !== 'all') {
      return 'All Episodes in Show';
    }
    return allLabel;
  };

  return (
    <div ref={containerRef} className={`relative inline-block ${className}`}>
      {/* Trigger button */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className={`w-full flex items-center justify-between gap-2.5 px-3.5 py-2.5 rounded-xl bg-slate-950/90 border border-slate-700/80 hover:border-slate-600 text-slate-200 text-xs shadow-inner focus:outline-none focus:border-blue-500/80 transition-all cursor-pointer ${
          isOpen ? 'border-blue-500 ring-1 ring-blue-500/30' : ''
        } ${selectedVideoId !== allValue ? 'bg-blue-950/20 border-blue-500/40 text-blue-200' : ''}`}
        title={selectedVideo ? selectedVideo.filename : 'Select video scope'}
      >
        <div className="flex items-center space-x-2 min-w-0">
          <Film className={`w-3.5 h-3.5 shrink-0 ${selectedVideoId !== allValue ? 'text-blue-400' : 'text-slate-400'}`} />
          <span className="truncate font-medium text-slate-200">
            {displayLabel()}
          </span>
          {selectedVideo && selectedVideo.sceneCount !== undefined && (
            <span className="text-[10px] px-1.5 py-0.2 rounded-md bg-blue-500/20 text-blue-300 font-semibold shrink-0">
              {selectedVideo.sceneCount} sc
            </span>
          )}
        </div>

        <div className="flex items-center space-x-1 shrink-0">
          {selectedVideoId !== allValue && (
            <span
              onClick={(e) => {
                e.stopPropagation();
                onSelectVideo(allValue);
              }}
              className="p-0.5 rounded hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
              title="Clear video filter"
            >
              <X className="w-3 h-3" />
            </span>
          )}
          <ChevronDown
            className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-200 ${
              isOpen ? 'rotate-180 text-blue-400' : ''
            }`}
          />
        </div>
      </button>

      {/* Popover Dropdown Menu */}
      {isOpen && (
        <div
          className={`absolute z-50 mt-1.5 left-0 ${menuWidth} max-h-72 overflow-y-auto rounded-2xl bg-[#0b101b]/98 border border-slate-700/90 shadow-2xl backdrop-blur-xl p-1.5 space-y-1 animate-in fade-in zoom-in-95 scrollbar-thin scrollbar-thumb-slate-700`}
        >
          {/* Search filter inside dropdown if many videos */}
          {scopedVideos.length > 4 && (
            <div className="p-1 border-b border-slate-800/80 mb-1">
              <div className="relative">
                <Search className="w-3 h-3 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchFilter}
                  onChange={(e) => setSearchFilter(e.target.value)}
                  placeholder="Filter video..."
                  autoFocus
                  className="w-full pl-7 pr-2 py-1 bg-slate-900/90 border border-slate-800 rounded-lg text-[11px] text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>
          )}

          {/* All Videos Option */}
          <button
            type="button"
            onClick={() => {
              onSelectVideo(allValue);
              setIsOpen(false);
            }}
            className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs transition-all text-left ${
              selectedVideoId === allValue
                ? 'bg-blue-600/20 text-blue-300 font-semibold'
                : 'text-slate-300 hover:bg-slate-900/80 hover:text-white'
            }`}
          >
            <div className="flex items-center space-x-2 truncate">
              <Film className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <span className="truncate">
                {selectedGroupId && selectedGroupId !== 'all' ? 'All Episodes in Show' : allLabel}
              </span>
              <span className="text-[10px] text-slate-500">({scopedVideos.length})</span>
            </div>
            {selectedVideoId === allValue && (
              <Check className="w-3.5 h-3.5 text-blue-400 shrink-0" />
            )}
          </button>

          {scopedVideos.length > 0 && (
            <div className="h-px bg-slate-800/80 my-1 mx-2" />
          )}

          {/* Video Options List */}
          {filteredVideos.length === 0 ? (
            <div className="px-3 py-2 text-[11px] text-slate-500 text-center">
              No videos found
            </div>
          ) : (
            filteredVideos.map((vid) => {
              const isSelected = selectedVideoId === vid.id;
              return (
                <button
                  key={vid.id}
                  type="button"
                  onClick={() => {
                    onSelectVideo(vid.id);
                    setIsOpen(false);
                  }}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs transition-all text-left group ${
                    isSelected
                      ? 'bg-blue-600/20 text-blue-300 font-semibold'
                      : 'text-slate-300 hover:bg-slate-900/80 hover:text-white'
                  }`}
                >
                  <div className="flex items-center space-x-2.5 min-w-0 pr-2">
                    <div className="w-6 h-6 rounded bg-slate-900 shrink-0 overflow-hidden flex items-center justify-center border border-slate-800">
                      <img
                        src={`/api/media/thumbnails/thumb_${vid.id}.jpg`}
                        alt=""
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = 'none';
                        }}
                      />
                      <Film className="w-3 h-3 text-slate-600 group-hover:text-blue-400" />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate font-medium group-hover:text-white">
                        {vid.filename}
                      </p>
                      <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
                        {vid.duration ? <span>{formatTime(vid.duration)}</span> : null}
                        {vid.sceneCount !== undefined && <span>• {vid.sceneCount} scenes</span>}
                        {vid.groupName && selectedGroupId === 'all' && (
                          <span className="text-indigo-400 truncate max-w-[100px]">
                            • {vid.groupName}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {isSelected && (
                    <Check className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                  )}
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

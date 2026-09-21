'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Folder, ChevronDown, Check, Layers, Film } from 'lucide-react';

export interface GroupOption {
  id: string;
  name: string;
  videoCount?: number;
}

interface GroupSelectDropdownProps {
  groups: GroupOption[];
  selectedGroupId: string;
  onSelectGroup: (groupId: string) => void;
  allLabel?: string;
  allValue?: string;
  icon?: 'folder' | 'film' | 'layers';
  className?: string;
  menuWidth?: string;
}

export default function GroupSelectDropdown({
  groups,
  selectedGroupId,
  onSelectGroup,
  allLabel = 'No Group (Standalone)',
  allValue = '',
  icon = 'folder',
  className = '',
  menuWidth = 'w-full min-w-[240px]',
}: GroupSelectDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
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

  const selectedGroup = groups.find((g) => g.id === selectedGroupId);

  const getIcon = () => {
    if (selectedGroupId !== allValue && selectedGroup) {
      return <Folder className="w-3.5 h-3.5 text-indigo-400 shrink-0" />;
    }
    if (icon === 'layers') return <Layers className="w-3.5 h-3.5 text-blue-400 shrink-0" />;
    if (icon === 'film') return <Film className="w-3.5 h-3.5 text-blue-400 shrink-0" />;
    return <Folder className="w-3.5 h-3.5 text-slate-400 shrink-0" />;
  };

  return (
    <div ref={containerRef} className={`relative inline-block ${className}`}>
      {/* Trigger button */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className={`w-full flex items-center justify-between gap-2.5 px-3.5 py-2.5 rounded-xl bg-slate-950/90 border border-slate-700/80 hover:border-slate-600 text-slate-200 text-xs shadow-inner focus:outline-none focus:border-indigo-500/80 transition-all cursor-pointer ${
          isOpen ? 'border-indigo-500 ring-1 ring-indigo-500/30' : ''
        }`}
      >
        <div className="flex items-center space-x-2 min-w-0">
          {getIcon()}
          <span className="truncate font-medium text-slate-200">
            {selectedGroup ? selectedGroup.name : allLabel}
          </span>
          {selectedGroup && selectedGroup.videoCount !== undefined && (
            <span className="text-[10px] px-1.5 py-0.2 rounded-md bg-indigo-500/20 text-indigo-300 font-semibold shrink-0">
              {selectedGroup.videoCount} {selectedGroup.videoCount === 1 ? 'ep' : 'eps'}
            </span>
          )}
        </div>

        <ChevronDown
          className={`w-3.5 h-3.5 text-slate-400 shrink-0 transition-transform duration-200 ${
            isOpen ? 'rotate-180 text-indigo-400' : ''
          }`}
        />
      </button>

      {/* Popover Dropdown Menu */}
      {isOpen && (
        <div
          className={`absolute z-50 mt-1.5 left-0 ${menuWidth} max-h-64 overflow-y-auto rounded-2xl bg-[#0b101b]/98 border border-slate-700/90 shadow-2xl backdrop-blur-xl p-1.5 space-y-1 animate-in fade-in zoom-in-95 scrollbar-thin scrollbar-thumb-slate-700`}
        >
          {/* Default / All Option */}
          <button
            type="button"
            onClick={() => {
              onSelectGroup(allValue);
              setIsOpen(false);
            }}
            className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs transition-all text-left ${
              selectedGroupId === allValue
                ? 'bg-indigo-600/20 text-indigo-300 font-semibold'
                : 'text-slate-300 hover:bg-slate-900/80 hover:text-white'
            }`}
          >
            <div className="flex items-center space-x-2 truncate">
              <Folder className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <span className="truncate">{allLabel}</span>
            </div>
            {selectedGroupId === allValue && (
              <Check className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
            )}
          </button>

          {groups.length > 0 && (
            <div className="h-px bg-slate-800/80 my-1 mx-2" />
          )}

          {/* Group Options */}
          {groups.map((group) => {
            const isSelected = selectedGroupId === group.id;
            return (
              <button
                key={group.id}
                type="button"
                onClick={() => {
                  onSelectGroup(group.id);
                  setIsOpen(false);
                }}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs transition-all text-left ${
                  isSelected
                    ? 'bg-indigo-600/20 text-indigo-300 font-semibold'
                    : 'text-slate-300 hover:bg-slate-900/80 hover:text-white'
                }`}
              >
                <div className="flex items-center space-x-2 truncate">
                  <Folder className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                  <span className="truncate">{group.name}</span>
                  {group.videoCount !== undefined && (
                    <span className="text-[10px] px-1.5 py-0.2 rounded-md bg-slate-800 text-slate-400 font-medium shrink-0">
                      {group.videoCount} {group.videoCount === 1 ? 'ep' : 'eps'}
                    </span>
                  )}
                </div>

                {isSelected && (
                  <Check className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                )}
              </button>
            );
          })}

          {groups.length === 0 && (
            <div className="py-2 px-3 text-[11px] text-slate-500 text-center">
              No shows or groups created yet.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Folder, X, Plus, Check, Trash2, FolderPlus, Layers, AlertCircle } from 'lucide-react';

export interface AssignGroupModalProps {
  isOpen: boolean;
  onClose: () => void;
  video: {
    id: string;
    filename?: string;
    title?: string;
    groupId?: string;
    groupName?: string;
  } | null;
  groups: Array<{ id: string; name: string; videoCount?: number }>;
  onSuccess: () => void;
}

export default function AssignGroupModal({
  isOpen,
  onClose,
  video,
  groups,
  onSuccess,
}: AssignGroupModalProps) {
  const [selectedGroupId, setSelectedGroupId] = useState<string>('');
  const [initialGroupId, setInitialGroupId] = useState<string>('');
  const [isCreatingNew, setIsCreatingNew] = useState<boolean>(false);
  const [newGroupName, setNewGroupName] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Track the video ID that this modal session was initialized for
  // This prevents background polling / parent re-renders from wiping user selection
  const initializedVideoIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (isOpen && video) {
      // Only initialize state when the modal first opens or switches to a different video
      if (initializedVideoIdRef.current !== video.id) {
        const initGroup = video.groupId || '';
        setSelectedGroupId(initGroup);
        setInitialGroupId(initGroup);
        setIsCreatingNew(false);
        setNewGroupName('');
        setErrorMsg(null);
        initializedVideoIdRef.current = video.id;
      }
    } else if (!isOpen) {
      // Reset ref when modal is closed so next opening starts fresh
      initializedVideoIdRef.current = null;
    }
  }, [isOpen, video?.id]);

  // Handle escape to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !video) return null;

  const currentGroup = groups.find((g) => g.id === (video.groupId || initialGroupId));
  const currentGroupName = currentGroup?.name || video.groupName;
  const videoTitle = video.filename || video.title || 'Untitled Video';

  const handleSave = async (targetGroupId: string | null, targetNewName?: string) => {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const payload: any = {};
      if (targetNewName && targetNewName.trim()) {
        payload.newGroupName = targetNewName.trim();
      } else {
        payload.groupId = targetGroupId || null;
      }

      const res = await fetch(`/api/videos/${video.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to update group');
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      console.error('Assign group error:', err);
      setErrorMsg(err.message || 'Failed to update group');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRemoveFromGroup = async () => {
    await handleSave(null);
  };

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-md bg-[#0b101b] border border-slate-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-150"
      >
        {/* Header */}
        <div className="p-5 border-b border-slate-800/80 bg-slate-950/60 flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-xl bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
              <Folder className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Manage Group / Show</h3>
              <p className="text-xs text-slate-400 truncate max-w-[260px]">{videoTitle}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body Content */}
        <div className="p-5 space-y-4 text-xs">
          {errorMsg && (
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Current Status banner */}
          <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800 flex items-center justify-between">
            <div className="space-y-0.5">
              <span className="text-slate-400 text-[11px] block">Current Group:</span>
              <div className="flex items-center space-x-1.5 font-semibold text-white">
                <Folder className="w-3.5 h-3.5 text-indigo-400" />
                <span>{currentGroupName || 'No Group (Ungrouped / All)'}</span>
              </div>
            </div>

            {(video.groupId || initialGroupId) && (
              <button
                type="button"
                onClick={handleRemoveFromGroup}
                disabled={isLoading}
                className="px-2.5 py-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-300 hover:text-red-200 border border-red-500/30 font-medium transition-all flex items-center space-x-1 cursor-pointer disabled:opacity-50"
                title="Remove video from this group and move to All / No Group"
              >
                <Trash2 className="w-3 h-3" />
                <span>Remove from Group</span>
              </button>
            )}
          </div>

          {/* Select Target Group */}
          <div className="space-y-2">
            <label className="font-semibold text-slate-300 block">
              Assign or Move to Group:
            </label>

            <div className="max-h-52 overflow-y-auto space-y-1.5 pr-1">
              {/* Option: No Group */}
              <button
                type="button"
                onClick={() => setSelectedGroupId('')}
                className={`w-full p-2.5 rounded-xl border text-left flex items-center justify-between transition-all cursor-pointer ${
                  selectedGroupId === ''
                    ? 'bg-blue-600/20 border-blue-500/50 text-white shadow-sm'
                    : 'bg-slate-900/50 border-slate-800 text-slate-300 hover:bg-slate-800/60'
                }`}
              >
                <div className="flex items-center space-x-2">
                  <Layers className="w-3.5 h-3.5 text-slate-400" />
                  <span className="font-medium">No Group (Ungrouped / Standalone)</span>
                </div>
                {selectedGroupId === '' && <Check className="w-3.5 h-3.5 text-blue-400" />}
              </button>

              {/* Existing Groups */}
              {groups.map((g) => {
                const isSelected = selectedGroupId === g.id;
                return (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => setSelectedGroupId(g.id)}
                    className={`w-full p-2.5 rounded-xl border text-left flex items-center justify-between transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-indigo-600/20 border-indigo-500/50 text-white shadow-sm'
                        : 'bg-slate-900/50 border-slate-800 text-slate-300 hover:bg-slate-800/60'
                    }`}
                  >
                    <div className="flex items-center space-x-2">
                      <Folder className="w-3.5 h-3.5 text-indigo-400" />
                      <span className="font-medium">{g.name}</span>
                      {g.videoCount !== undefined && (
                        <span className="text-[10px] text-slate-500">
                          ({g.videoCount} {g.videoCount === 1 ? 'video' : 'videos'})
                        </span>
                      )}
                    </div>
                    {isSelected && <Check className="w-3.5 h-3.5 text-indigo-400" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Create New Show/Group Option */}
          <div className="pt-2 border-t border-slate-800/70 space-y-2">
            {!isCreatingNew ? (
              <button
                type="button"
                onClick={() => setIsCreatingNew(true)}
                className="w-full py-2 px-3 rounded-xl border border-dashed border-slate-700 hover:border-indigo-500/60 text-slate-400 hover:text-indigo-300 transition-colors flex items-center justify-center space-x-1.5 font-medium cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Create New Show / Group</span>
              </button>
            ) : (
              <div className="space-y-2">
                <span className="text-[11px] text-slate-400 font-medium">New Show Name:</span>
                <div className="flex items-center space-x-2">
                  <input
                    type="text"
                    value={newGroupName}
                    onChange={(e) => setNewGroupName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && newGroupName.trim() && !isLoading) {
                        e.preventDefault();
                        handleSave(null, newGroupName.trim());
                      }
                    }}
                    placeholder='e.g. "Loki", "Breaking Bad", "Tutorials"...'
                    autoFocus
                    className="flex-1 px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 text-xs"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (newGroupName.trim()) {
                        handleSave(null, newGroupName.trim());
                      }
                    }}
                    disabled={isLoading || !newGroupName.trim()}
                    className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs transition-colors disabled:opacity-50 shrink-0"
                  >
                    Create & Assign
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsCreatingNew(false);
                      setNewGroupName('');
                    }}
                    className="px-2 py-1.5 text-slate-400 hover:text-white text-xs"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/70 flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-colors"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={() => handleSave(selectedGroupId)}
            disabled={isLoading || selectedGroupId === initialGroupId}
            className="px-4 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-xs font-semibold shadow-md shadow-blue-500/20 transition-all cursor-pointer"
          >
            {isLoading ? 'Saving...' : 'Apply Group Change'}
          </button>
        </div>
      </div>
    </div>
  );
}

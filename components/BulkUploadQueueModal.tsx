'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import {
  Upload,
  X,
  Film,
  CheckCircle2,
  AlertCircle,
  Clock,
  Trash2,
  Square,
  RefreshCw,
  FolderPlus,
  Folder,
  Plus,
  Play,
  Layers,
  ArrowRight,
  ShieldCheck
} from 'lucide-react';

import { formatTime } from '@/components/VideoPlayer';
import GroupSelectDropdown from '@/components/GroupSelectDropdown';
import ProcessingLogsConsole from '@/components/ProcessingLogsConsole';

export interface QueueItem {
  id: string; // client id or videoId
  file?: File;
  name: string;
  sizeMB: string;
  status: 'queued' | 'uploading' | 'processing' | 'indexed' | 'cancelled' | 'failed';
  progress: number;
  stage?: string;
  videoId?: string;
  jobId?: string;
  groupId?: string;
  groupName?: string;
  error?: string;
  logs?: string[];
}

interface BulkUploadQueueModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUploadSuccess?: () => void;
  groups: Array<{ id: string; name: string; videoCount?: number }>;
  onRefreshGroups?: () => void;
}

export default function BulkUploadQueueModal({
  isOpen,
  onClose,
  onUploadSuccess,
  groups,
  onRefreshGroups,
}: BulkUploadQueueModalProps) {
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [localGroups, setLocalGroups] = useState(groups);
  const [selectedGroupId, setSelectedGroupId] = useState<string>('');
  const [newGroupName, setNewGroupName] = useState<string>('');
  const [isCreatingNewGroup, setIsCreatingNewGroup] = useState<boolean>(false);
  const [createGroupLoading, setCreateGroupLoading] = useState<boolean>(false);
  const [isBatchProcessing, setIsBatchProcessing] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const isBatchCancelledRef = useRef<boolean>(false);

  useEffect(() => {
    setLocalGroups(groups);
  }, [groups]);

  // Handle escape key to close modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Poll existing jobs and videos to keep active items in queue updated
  useEffect(() => {
    if (!isOpen) return;

    const syncWithBackend = async () => {
      try {
        const [jobsRes, videosRes] = await Promise.all([
          fetch('/api/jobs'),
          fetch('/api/videos'),
        ]);

        if (jobsRes.ok && videosRes.ok) {
          const { jobs } = await jobsRes.json();
          const { videos } = await videosRes.json();
          const jobMap = new Map((jobs || []).map((j: any) => [j.videoId, j]));
          const videoMap = new Map((videos || []).map((v: any) => [v.id, v]));

          setQueue((prevQueue) =>
            prevQueue.map((item) => {
              if (!item.videoId) return item;
              const remoteVideo: any = videoMap.get(item.videoId);
              const remoteJob: any = jobMap.get(item.videoId);

              if (!remoteVideo) return item;

              let updatedStatus = item.status;
              let updatedProgress = item.progress;
              let updatedStage = item.stage;
              let updatedError = item.error;

              if (remoteVideo.status === 'indexed') {
                updatedStatus = 'indexed';
                updatedProgress = 100;
                updatedStage = 'Indexing complete and ready for semantic search';
              } else if (remoteVideo.status === 'cancelled' || remoteJob?.status === 'cancelled') {
                updatedStatus = 'cancelled';
                updatedStage = 'Cancelled by user';
              } else if (remoteVideo.status === 'failed') {
                updatedStatus = 'failed';
                updatedError = remoteVideo.errorMessage || remoteJob?.error || 'AI analysis failed';
                updatedStage = updatedError;
              } else if (remoteVideo.status === 'processing' || remoteJob?.status === 'processing') {
                updatedStatus = 'processing';
                updatedProgress = remoteJob?.progress ?? remoteVideo.processingProgress ?? item.progress;
                updatedStage = remoteJob?.currentStep || 'Analyzing video scenes...';
              }

              return {
                ...item,
                status: updatedStatus,
                progress: updatedProgress,
                stage: updatedStage,
                jobId: remoteJob?.id || item.jobId,
                logs: remoteJob?.logs || item.logs || [],
                error: updatedError,
              };
            })
          );
        }
      } catch (err) {
        console.error('Queue poll error:', err);
      }
    };

    syncWithBackend();
    const interval = setInterval(syncWithBackend, 3000);
    return () => clearInterval(interval);
  }, [isOpen]);

  const handleCreateGroup = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = newGroupName.trim();
    if (!trimmed) return;

    setCreateGroupLoading(true);
    try {
      const res = await fetch('/api/groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed }),
      });

      if (res.ok) {
        const data = await res.json();
        const createdGroup = data.group;

        setLocalGroups((prev) => {
          if (prev.some((g) => g.id === createdGroup.id)) return prev;
          return [...prev, createdGroup];
        });

        setSelectedGroupId(createdGroup.id);

        setQueue((prevQueue) =>
          prevQueue.map((item) =>
            item.status === 'queued'
              ? { ...item, groupId: createdGroup.id, groupName: createdGroup.name }
              : item
          )
        );

        if (onRefreshGroups) onRefreshGroups();
        setNewGroupName('');
        setIsCreatingNewGroup(false);
      }
    } catch (err) {
      console.error('Failed to create group:', err);
    } finally {
      setCreateGroupLoading(false);
    }
  };

  const handleSelectGroup = (groupId: string) => {
    setSelectedGroupId(groupId);
    const targetGroup = localGroups.find((g) => g.id === groupId);
    setQueue((prevQueue) =>
      prevQueue.map((item) =>
        item.status === 'queued'
          ? {
              ...item,
              groupId: groupId || undefined,
              groupName: targetGroup ? targetGroup.name : undefined,
            }
          : item
      )
    );
  };

  const handleFilesSelected = (files: FileList | null) => {
    if (!files || files.length === 0) return;

    const allowed = ['mp4', 'mkv', 'mov', 'webm', 'avi'];
    const newItems: QueueItem[] = [];

    const targetGroup = localGroups.find((g) => g.id === selectedGroupId);
    const effectiveGroupId = selectedGroupId || undefined;
    const effectiveGroupName = targetGroup ? targetGroup.name : undefined;

    Array.from(files).forEach((file) => {
      const ext = file.name.split('.').pop()?.toLowerCase();
      if (!ext || !allowed.includes(ext)) return;

      const isOverSize = file.size > 2 * 1024 * 1024 * 1024;
      const sizeMB = (file.size / (1024 * 1024)).toFixed(1);
      const sizeGB = (file.size / (1024 * 1024 * 1024)).toFixed(2);

      newItems.push({
        id: `q_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
        file,
        name: file.name,
        sizeMB,
        status: isOverSize ? 'failed' : 'queued',
        progress: 0,
        stage: isOverSize ? 'Exceeds 2 GB Google File API limit' : 'Waiting in queue',
        groupId: effectiveGroupId,
        groupName: effectiveGroupName,
        error: isOverSize
          ? `File size (${sizeGB} GB) exceeds Google Gemini File API limit of 2 GB per file.`
          : undefined,
      });
    });

    setQueue((prev) => [...prev, ...newItems]);
  };

  const uploadItem = async (item: QueueItem): Promise<void> => {
    if (!item.file) return;

    setQueue((prev) =>
      prev.map((q) =>
        q.id === item.id
          ? { ...q, status: 'uploading', progress: 20, stage: 'Uploading file buffer...' }
          : q
      )
    );

    const formData = new FormData();
    formData.append('file', item.file);
    formData.append('autoIndex', 'true');
    formData.append('async', 'true');

    if (item.groupId) {
      formData.append('groupId', item.groupId);
    }
    if (item.groupName) {
      formData.append('groupName', item.groupName);
    }

    try {
      const res = await fetch('/api/videos/upload', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Upload failed');
      }

      setQueue((prev) =>
        prev.map((q) =>
          q.id === item.id
            ? {
                ...q,
                status: 'processing',
                videoId: data.video?.id,
                groupId: data.video?.groupId || q.groupId,
                groupName: data.video?.groupName || q.groupName,
                progress: 10,
                stage: 'Analyzing metadata and queued for scene detection',
              }
            : q
        )
      );

      if (onUploadSuccess) onUploadSuccess();
      if (onRefreshGroups) onRefreshGroups();
    } catch (err: any) {
      setQueue((prev) =>
        prev.map((q) =>
          q.id === item.id
            ? { ...q, status: 'failed', error: err.message, stage: `Upload failed: ${err.message}` }
            : q
        )
      );
    }
  };

  const startBatchUpload = async () => {
    isBatchCancelledRef.current = false;
    setIsBatchProcessing(true);
    const pendingItems = queue.filter((item) => item.status === 'queued');

    for (const item of pendingItems) {
      if (isBatchCancelledRef.current) {
        console.log('[BATCH_QUEUE] Processing aborted by user.');
        break;
      }
      await uploadItem(item);
    }

    setIsBatchProcessing(false);
  };

  const stopQueue = async () => {
    isBatchCancelledRef.current = true;
    setIsBatchProcessing(false);

    // Cancel all items currently uploading or processing
    const activeItems = queue.filter(
      (item) => item.status === 'uploading' || item.status === 'processing'
    );

    for (const item of activeItems) {
      await handleCancel(item);
    }
  };

  const deleteEntireQueue = async () => {
    if (queue.length === 0) return;
    if (!confirm('Are you sure you want to stop and delete all videos from this queue?')) {
      return;
    }

    isBatchCancelledRef.current = true;
    setIsBatchProcessing(false);

    // Cancel and delete all items
    for (const item of queue) {
      const targetId = item.jobId || item.videoId;
      if (targetId) {
        fetch(`/api/jobs/${targetId}/cancel`, { method: 'POST' }).catch(() => {});
        if (item.jobId) fetch(`/api/jobs/${item.jobId}`, { method: 'DELETE' }).catch(() => {});
        if (item.videoId) fetch(`/api/videos/${item.videoId}`, { method: 'DELETE' }).catch(() => {});
      }
    }

    setQueue([]);
    if (onUploadSuccess) onUploadSuccess();
  };

  const handleCancel = async (item: QueueItem) => {
    const targetId = item.jobId || item.videoId;
    if (targetId) {
      try {
        await fetch(`/api/jobs/${targetId}/cancel`, { method: 'POST' });
      } catch (err) {
        console.error('Failed to cancel job:', err);
      }
    }

    setQueue((prev) =>
      prev.map((q) =>
        q.id === item.id
          ? { ...q, status: 'cancelled', stage: 'Processing cancelled by user' }
          : q
      )
    );
  };

  const handleRemove = async (item: QueueItem) => {
    // If it's already on server, cancel and delete if failed or cancelled
    if (item.jobId) {
      fetch(`/api/jobs/${item.jobId}`, { method: 'DELETE' }).catch(() => {});
    }
    if (item.videoId && (item.status === 'cancelled' || item.status === 'failed')) {
      fetch(`/api/videos/${item.videoId}`, { method: 'DELETE' }).catch(() => {});
    }

    setQueue((prev) => prev.filter((q) => q.id !== item.id));
  };

  const clearCompletedOrCancelled = () => {
    setQueue((prev) => prev.filter((q) => q.status !== 'indexed' && q.status !== 'cancelled'));
  };

  const pendingCount = queue.filter((i) => i.status === 'queued').length;
  const processingCount = queue.filter((i) => i.status === 'processing' || i.status === 'uploading').length;
  const completedCount = queue.filter((i) => i.status === 'indexed').length;

  if (!isOpen) return null;

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-4xl max-h-[90vh] flex flex-col bg-[#0b101b] border border-slate-800 rounded-3xl shadow-2xl overflow-hidden"
      >
        {/* Header */}
        <div className="p-6 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div>
            <h2 className="text-xl font-bold text-white flex items-center space-x-2.5">
              <Layers className="w-5 h-5 text-blue-400" />
              <span>Bulk Video Upload & Queue</span>
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Upload multiple episodes or video batches simultaneously, assign them to a show/group, and manage processing.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
            title="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Group Assignment Bar */}
        <div className="p-5 border-b border-slate-800/80 bg-slate-900/40 flex flex-wrap items-center gap-4 text-xs">
          <div className="flex items-center space-x-2 text-slate-300 font-semibold">
            <Folder className="w-4 h-4 text-indigo-400" />
            <span>Target Group / Show:</span>
          </div>

          {!isCreatingNewGroup ? (
            <div className="flex items-center space-x-2.5 flex-1 min-w-[220px]">
              <GroupSelectDropdown
                groups={localGroups}
                selectedGroupId={selectedGroupId}
                onSelectGroup={handleSelectGroup}
                allLabel="No Group (Ungrouped / Standalone)"
                allValue=""
                className="flex-1 max-w-sm"
              />

              <button
                type="button"
                onClick={() => setIsCreatingNewGroup(true)}
                className="flex items-center space-x-1.5 px-3 py-2.5 rounded-xl bg-indigo-600/20 hover:bg-indigo-600 text-indigo-400 hover:text-white border border-indigo-500/30 transition-all text-xs font-semibold shrink-0"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>New Show / Group</span>
              </button>
            </div>
          ) : (
            <form onSubmit={handleCreateGroup} className="flex items-center space-x-2 flex-1 min-w-[280px]">
              <input
                type="text"
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                placeholder='Enter show name (e.g. "One Piece", "Breaking Bad")...'
                autoFocus
                disabled={createGroupLoading}
                className="bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 text-xs flex-1 max-w-xs shadow-inner"
              />
              <button
                type="submit"
                disabled={createGroupLoading || !newGroupName.trim()}
                className="flex items-center space-x-1.5 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold text-xs shadow-md shadow-indigo-500/20 transition-all shrink-0"
              >
                {createGroupLoading ? (
                  <span className="animate-spin">🌀</span>
                ) : (
                  <Plus className="w-3.5 h-3.5" />
                )}
                <span>Create & Select</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsCreatingNewGroup(false);
                  setNewGroupName('');
                }}
                className="px-2.5 py-2 text-slate-400 hover:text-white text-xs transition-colors"
              >
                Cancel
              </button>
            </form>
          )}

          {/* Queue Statistics Badges */}
          <div className="flex items-center space-x-2 ml-auto">
            {pendingCount > 0 && (
              <span className="px-2.5 py-1 rounded-lg bg-blue-500/10 border border-blue-500/30 text-blue-400 text-[11px]">
                {pendingCount} Pending
              </span>
            )}
            {processingCount > 0 && (
              <span className="px-2.5 py-1 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400 text-[11px] animate-pulse">
                {processingCount} Processing
              </span>
            )}
            {completedCount > 0 && (
              <span className="px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[11px]">
                {completedCount} Done
              </span>
            )}
          </div>
        </div>

        {/* Dropzone & Queue Content */}
        <div className="p-6 flex-1 overflow-y-auto space-y-5">
          {/* Multi-file Dropzone */}
          <div
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-slate-700 hover:border-blue-500/70 bg-slate-950/40 hover:bg-slate-900/30 rounded-2xl p-6 text-center cursor-pointer transition-all space-y-2 group"
          >
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="video/mp4,video/mkv,video/mov,video/webm,video/avi"
              className="hidden"
              onChange={(e) => handleFilesSelected(e.target.files)}
            />
            <div className="w-10 h-10 rounded-xl bg-blue-600/10 text-blue-400 flex items-center justify-center mx-auto group-hover:scale-110 transition-transform">
              <Upload className="w-5 h-5" />
            </div>
            <p className="text-xs font-semibold text-slate-300">
              Click to browse or drop multiple video files
            </p>
            <p className="text-[11px] text-slate-500">
              Select multiple episodes/videos at once (MP4, MKV, MOV, WEBM, AVI)
            </p>
          </div>

          {/* Google File API Limits Indicator */}
          <div className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-xl bg-slate-950/80 border border-slate-800 text-[11px] text-slate-400">
            <div className="flex items-center space-x-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span className="font-semibold text-slate-200">Google Gemini File API Limits:</span>
            </div>
            <div className="flex flex-wrap items-center gap-2.5 text-slate-400">
              <span>Max Size: <strong className="text-slate-200">2 GB / video</strong></span>
              <span>•</span>
              <span>Max Duration: <strong className="text-slate-200">Up to 2 hours</strong></span>
              <span>•</span>
              <span>Project Storage: <strong className="text-slate-200">20 GB Limit</strong></span>
              <span>•</span>
              <span>Formats: <strong className="text-slate-200">MP4, MKV, MOV, WEBM, AVI</strong></span>
            </div>
          </div>
          {queue.length === 0 ? (
            <div className="py-12 text-center text-slate-500 text-xs">
              Queue is empty. Select files above to queue them for bulk AI processing.
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between text-xs text-slate-400 px-1 gap-2">
                <span>Queue Items ({queue.length})</span>
                <div className="flex items-center space-x-2">
                  {(isBatchProcessing || processingCount > 0) && (
                    <button
                      type="button"
                      onClick={stopQueue}
                      className="flex items-center space-x-1 px-2.5 py-1 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-300 hover:text-red-200 border border-red-500/30 text-xs font-semibold transition-all cursor-pointer"
                    >
                      <Square className="w-3 h-3 text-red-400" />
                      <span>Stop Processing</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={deleteEntireQueue}
                    className="flex items-center space-x-1 px-2.5 py-1 rounded-lg bg-slate-800/80 hover:bg-red-500/15 hover:text-red-400 text-slate-400 text-xs transition-colors border border-slate-700/80 cursor-pointer"
                    title="Stop all and clear entire queue"
                  >
                    <Trash2 className="w-3 h-3" />
                    <span>Delete Queue</span>
                  </button>

                  {(completedCount > 0 || queue.some((q) => q.status === 'cancelled')) && (
                    <button
                      type="button"
                      onClick={clearCompletedOrCancelled}
                      className="text-slate-400 hover:text-slate-200 text-xs underline decoration-slate-700 ml-1 cursor-pointer"
                    >
                      Clear finished
                    </button>
                  )}
                </div>
              </div>

              {queue.map((item) => (
                <div
                  key={item.id}
                  className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800/80 flex flex-col gap-3 transition-all"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center space-x-3 min-w-0">
                      <div className="w-9 h-9 rounded-xl bg-slate-800/80 flex items-center justify-center shrink-0 text-slate-300">
                        <Film className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center space-x-2">
                          <p className="text-xs font-semibold text-slate-200 truncate max-w-sm" title={item.name}>
                            {item.name}
                          </p>
                          {item.groupName && (
                            <span className="px-2 py-0.5 rounded-md bg-indigo-500/10 border border-indigo-500/30 text-indigo-400 text-[10px] font-medium shrink-0">
                              {item.groupName}
                            </span>
                          )}
                          {(item.name.toLowerCase().endsWith('.mkv') ||
                            item.name.toLowerCase().endsWith('.avi') ||
                            item.name.toLowerCase().endsWith('.mov')) && (
                            <span className="px-1.5 py-0.5 rounded bg-amber-500/10 border border-amber-500/25 text-amber-300 text-[9px] font-medium shrink-0">
                              ⚡ Auto-Transcode
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-500 mt-0.5">{item.sizeMB} MB</p>
                      </div>
                    </div>

                    {/* Status Badges & Quick Actions */}
                    <div className="flex items-center space-x-2 shrink-0">
                      {item.status === 'queued' && (
                        <span className="flex items-center space-x-1 px-2.5 py-1 rounded-md bg-slate-800 text-slate-400 text-[11px]">
                          <Clock className="w-3 h-3" />
                          <span>Queued</span>
                        </span>
                      )}

                      {item.status === 'uploading' && (
                        <span className="flex items-center space-x-1 px-2.5 py-1 rounded-md bg-blue-600/20 border border-blue-500/30 text-blue-400 text-[11px] animate-pulse">
                          <Upload className="w-3 h-3" />
                          <span>Uploading</span>
                        </span>
                      )}

                      {item.status === 'processing' && (
                        <span className="flex items-center space-x-1 px-2.5 py-1 rounded-md bg-amber-500/20 border border-amber-500/30 text-amber-400 text-[11px] animate-pulse">
                          <RefreshCw className="w-3 h-3 animate-spin" />
                          <span>Processing ({item.progress}%)</span>
                        </span>
                      )}

                      {item.status === 'indexed' && (
                        <span className="flex items-center space-x-1 px-2.5 py-1 rounded-md bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 text-[11px]">
                          <CheckCircle2 className="w-3 h-3" />
                          <span>Indexed</span>
                        </span>
                      )}

                      {item.status === 'cancelled' && (
                        <span className="flex items-center space-x-1 px-2.5 py-1 rounded-md bg-slate-800 border border-slate-700 text-slate-400 text-[11px]">
                          <Square className="w-3 h-3" />
                          <span>Cancelled</span>
                        </span>
                      )}

                      {item.status === 'failed' && (
                        <span className="flex items-center space-x-1 px-2.5 py-1 rounded-md bg-red-500/20 border border-red-500/30 text-red-400 text-[11px]">
                          <AlertCircle className="w-3 h-3" />
                          <span>Failed</span>
                        </span>
                      )}

                      {/* Cancel button if active */}
                      {(item.status === 'processing' || item.status === 'uploading' || item.status === 'queued') && (
                        <button
                          onClick={() => handleCancel(item)}
                          className="flex items-center space-x-1 px-2.5 py-1 rounded-md bg-slate-800 hover:bg-red-500/20 hover:text-red-400 text-slate-400 text-[11px] transition-colors border border-slate-700"
                          title="Cancel processing"
                        >
                          <Square className="w-3 h-3" />
                          <span>Cancel</span>
                        </button>
                      )}

                      {/* Open Studio link if indexed */}
                      {item.status === 'indexed' && item.videoId && (
                        <Link
                          href={`/videos/${item.videoId}`}
                          className="flex items-center space-x-1 px-2.5 py-1 rounded-md bg-blue-600/20 hover:bg-blue-600 text-blue-400 hover:text-white text-[11px] font-semibold border border-blue-500/30 transition-all"
                        >
                          <Play className="w-3 h-3" />
                          <span>Studio</span>
                        </Link>
                      )}

                      {/* Remove button */}
                      <button
                        onClick={() => handleRemove(item)}
                        className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                        title="Remove from queue"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Progress & Stage Details */}
                  {(item.status === 'processing' || item.status === 'uploading') && (
                    <div className="space-y-2 pt-1 border-t border-slate-800/60">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-amber-400 truncate max-w-md font-medium">{item.stage}</span>
                        <span className="font-mono text-amber-400 font-bold">{item.progress}%</span>
                      </div>
                      <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                        <div
                          className="bg-gradient-to-r from-amber-500 to-indigo-500 h-full rounded-full transition-all duration-300"
                          style={{ width: `${item.progress}%` }}
                        />
                      </div>

                      {item.logs && item.logs.length > 0 && (
                        <ProcessingLogsConsole
                          logs={item.logs}
                          currentStep={item.stage}
                          progress={item.progress}
                          status={item.status}
                          isCompact={true}
                          defaultExpanded={false}
                          title="Pipeline Logs"
                        />
                      )}
                    </div>
                  )}

                  {item.status === 'failed' && item.error && (
                    <div className="text-[11px] text-red-400/90 pt-1 border-t border-slate-800/60 truncate">
                      {item.error}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-5 border-t border-slate-800 bg-slate-950/70 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="text-xs text-slate-400 flex items-center space-x-2">
            {isBatchProcessing || processingCount > 0 ? (
              <span className="text-amber-400 flex items-center space-x-1.5 animate-pulse font-medium">
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-amber-400" />
                <span>Processing batch ({processingCount} active)...</span>
              </span>
            ) : pendingCount > 0 ? (
              <span>{pendingCount} video(s) queued. Click "Upload & Process Queue" to start.</span>
            ) : queue.length > 0 ? (
              <span>All queue items completed or stopped.</span>
            ) : (
              <span>Queue is empty. Select files above to queue them.</span>
            )}
          </div>

          <div className="flex flex-wrap items-center space-x-2.5 w-full sm:w-auto">
            {queue.length > 0 && (
              <button
                type="button"
                onClick={deleteEntireQueue}
                className="px-3.5 py-2.5 rounded-xl bg-slate-900 hover:bg-red-500/20 hover:text-red-300 text-slate-400 text-xs font-semibold border border-slate-800 hover:border-red-500/30 transition-all flex items-center space-x-1.5 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete Queue</span>
              </button>
            )}

            {(isBatchProcessing || processingCount > 0) && (
              <button
                type="button"
                onClick={stopQueue}
                className="px-4 py-2.5 rounded-xl bg-red-600/20 hover:bg-red-600 text-red-300 hover:text-white border border-red-500/30 text-xs font-semibold shadow-md transition-all flex items-center space-x-1.5 cursor-pointer"
              >
                <Square className="w-3.5 h-3.5" />
                <span>Stop Queue</span>
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-all flex-1 sm:flex-initial cursor-pointer"
            >
              Close
            </button>

            <button
              type="button"
              onClick={startBatchUpload}
              disabled={isBatchProcessing || pendingCount === 0}
              className="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-semibold shadow-lg shadow-blue-500/20 transition-all flex items-center justify-center space-x-2 flex-1 sm:flex-initial cursor-pointer"
            >
              <Upload className="w-4 h-4" />
              <span>{isBatchProcessing ? 'Processing Queue...' : `Upload & Process Queue (${pendingCount})`}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

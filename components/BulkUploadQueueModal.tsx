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
  ShieldCheck,
  RotateCcw
} from 'lucide-react';

import { formatTime } from '@/components/VideoPlayer';
import GroupSelectDropdown from '@/components/GroupSelectDropdown';
import ProcessingLogsConsole from '@/components/ProcessingLogsConsole';
import ConfirmModal from '@/components/ConfirmModal';

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
  const [reprocessingIds, setReprocessingIds] = useState<Set<string>>(new Set());
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const isBatchCancelledRef = useRef<boolean>(false);
  const abortControllersRef = useRef<Map<string, AbortController>>(new Map());
  const queueRef = useRef<QueueItem[]>(queue);
  useEffect(() => {
    queueRef.current = queue;
  }, [queue]);
  const [confirmConfig, setConfirmConfig] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    variant?: 'danger' | 'warning' | 'info';
    iconType?: 'trash' | 'stop' | 'warning' | 'refresh';
    onConfirm: () => void | Promise<void>;
  }>({
    isOpen: false,
    title: '',
    message: '',
    variant: 'warning',
    onConfirm: () => {},
  });

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

          setQueue((prevQueue) => {
            // 1. Update existing items in queue with live server status
            const updatedExisting = prevQueue.map((item) => {
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
            });

            // 2. Discover videos on the server that are active/processing/stuck/interrupted
            // so opening the modal immediately displays them for monitoring and reprocessing!
            const existingVideoIds = new Set(
              prevQueue.map((q) => q.videoId).filter(Boolean)
            );
            const discoveredServerItems: QueueItem[] = [];

            (videos || []).forEach((v: any) => {
              const remoteJob: any = jobMap.get(v.id);
              const isRelevant =
                v.status === 'processing' ||
                v.status === 'pending' ||
                remoteJob?.status === 'processing' ||
                (v.status === 'failed' && (v.errorMessage?.includes('restarted') || v.errorMessage?.includes('interrupted')));

              if (isRelevant && !existingVideoIds.has(v.id)) {
                const job: any = remoteJob;
                const sizeMB = v.sizeBytes ? (v.sizeBytes / (1024 * 1024)).toFixed(1) : '0';
                discoveredServerItems.push({
                  id: `server_${v.id}`,
                  videoId: v.id,
                  name: v.filename || v.originalName || 'Video',
                  sizeMB,
                  status: v.status as any,
                  progress: job?.progress ?? v.processingProgress ?? (v.status === 'failed' ? 0 : 10),
                  stage:
                    job?.currentStep ||
                    (v.status === 'processing'
                      ? 'Processing video scenes (in progress)...'
                      : v.status === 'failed'
                      ? (v.errorMessage || 'Processing interrupted. Click Reprocess to restart.')
                      : 'Waiting in queue'),
                  jobId: job?.id,
                  groupId: v.groupId,
                  groupName: v.groupName,
                  logs: job?.logs || [],
                  error: v.errorMessage || job?.error,
                });
              }
            });

            if (discoveredServerItems.length === 0) {
              return updatedExisting;
            }

            return [...updatedExisting, ...discoveredServerItems];
          });
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
    if (isBatchCancelledRef.current) return;

    const controller = new AbortController();
    abortControllersRef.current.set(item.id, controller);

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
        signal: controller.signal,
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Upload failed');
      }

      abortControllersRef.current.delete(item.id);

      // If the batch or item was cancelled while upload was finishing, cancel backend processing immediately!
      if (isBatchCancelledRef.current) {
        if (data.video?.id) {
          fetch(`/api/jobs/${data.video.id}/cancel`, { method: 'POST' }).catch(() => {});
        }
        return;
      }

      const isFailed = data.video?.status === 'failed';
      setQueue((prev) =>
        prev.map((q) =>
          q.id === item.id
            ? {
                ...q,
                status: isFailed ? 'failed' : 'processing',
                videoId: data.video?.id,
                groupId: data.video?.groupId || q.groupId,
                groupName: data.video?.groupName || q.groupName,
                progress: isFailed ? 0 : 10,
                stage: isFailed
                  ? (data.video?.errorMessage || 'AI Analysis failed. Configure API key and reprocess.')
                  : 'Analyzing metadata and queued for scene detection',
                error: isFailed ? data.video?.errorMessage : undefined,
              }
            : q
        )
      );

      if (onUploadSuccess) onUploadSuccess();
      if (onRefreshGroups) onRefreshGroups();
    } catch (err: any) {
      abortControllersRef.current.delete(item.id);
      if (err.name === 'AbortError') {
        setQueue((prev) =>
          prev.map((q) =>
            q.id === item.id
              ? { ...q, status: 'cancelled', stage: 'Upload cancelled by user' }
              : q
          )
        );
        return;
      }
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

  const executeStopQueue = async () => {
    isBatchCancelledRef.current = true;
    setIsBatchProcessing(false);

    // 1. Abort all in-flight upload fetch requests immediately
    abortControllersRef.current.forEach((ctrl) => {
      try { ctrl.abort(); } catch {}
    });
    abortControllersRef.current.clear();

    // 2. Send global cancel to backend so any active Gemini processing terminates immediately
    try {
      await fetch('/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'cancel-all' }),
      });
    } catch {}

    // 3. Stop and cancel all specific active items on backend
    const currentQueue = queueRef.current;
    await Promise.all(
      currentQueue.map(async (item) => {
        const targetId = item.videoId || item.jobId;
        if (targetId) {
          try {
            await fetch(`/api/jobs/${targetId}/cancel`, { method: 'POST' });
          } catch {}
        }
      })
    );

    setQueue((prev) =>
      prev.map((q) =>
        q.status === 'uploading' || q.status === 'processing' || q.status === 'queued'
          ? { ...q, status: 'cancelled', stage: 'Processing stopped by user' }
          : q
      )
    );

    if (onUploadSuccess) onUploadSuccess();
  };

  const promptStopQueue = () => {
    setConfirmConfig({
      isOpen: true,
      title: 'Stop Queue Processing?',
      message: 'This will immediately abort current uploads and stop background video analysis for all active items in this queue.',
      confirmText: 'Yes, Stop Processing',
      cancelText: 'Keep Processing',
      variant: 'warning',
      iconType: 'stop',
      onConfirm: async () => {
        await executeStopQueue();
        setConfirmConfig((prev) => ({ ...prev, isOpen: false }));
      },
    });
  };

  const executeDeleteEntireQueue = async () => {
    const currentQueue = queueRef.current;
    if (currentQueue.length === 0) return;

    isBatchCancelledRef.current = true;
    setIsBatchProcessing(false);

    // 1. Abort all in-flight upload requests immediately
    abortControllersRef.current.forEach((ctrl) => {
      try { ctrl.abort(); } catch {}
    });
    abortControllersRef.current.clear();

    // 2. Cancel all backend pipelines immediately
    try {
      await fetch('/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'cancel-all' }),
      });
    } catch {}

    // 3. Cancel and delete all items on server in parallel
    await Promise.all(
      currentQueue.map(async (item) => {
        const videoId = item.videoId;
        const jobId = item.jobId;

        if (videoId) {
          try {
            await fetch(`/api/videos/${videoId}`, { method: 'DELETE' });
          } catch {}
        } else if (jobId) {
          try {
            await fetch(`/api/jobs/${jobId}/cancel`, { method: 'POST' });
            await fetch(`/api/jobs/${jobId}`, { method: 'DELETE' });
          } catch {}
        }
      })
    );

    setQueue([]);
    if (onUploadSuccess) onUploadSuccess();
  };

  const promptDeleteEntireQueue = () => {
    if (queue.length === 0) return;
    setConfirmConfig({
      isOpen: true,
      title: 'Delete Entire Upload Queue?',
      message: 'This will stop all running queues, abort in-flight uploads, and permanently delete all queued videos, thumbnails, and indexing data from the system.',
      confirmText: 'Yes, Delete All',
      cancelText: 'Cancel',
      variant: 'danger',
      iconType: 'trash',
      onConfirm: async () => {
        await executeDeleteEntireQueue();
        setConfirmConfig((prev) => ({ ...prev, isOpen: false }));
      },
    });
  };

  const executeCancel = async (item: QueueItem) => {
    // 1. Abort in-flight upload fetch if active
    const ctrl = abortControllersRef.current.get(item.id);
    if (ctrl) {
      try { ctrl.abort(); } catch {}
      abortControllersRef.current.delete(item.id);
    }

    // 2. Cancel on backend
    const targetId = item.videoId || item.jobId;
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
    if (onUploadSuccess) onUploadSuccess();
  };

  const promptCancelItem = (item: QueueItem) => {
    if (item.status === 'processing' || item.status === 'uploading') {
      setConfirmConfig({
        isOpen: true,
        title: `Cancel Processing for "${item.name}"?`,
        message: 'Are you sure you want to stop processing this video? Any partial FFmpeg transcode and scene analysis will be terminated immediately.',
        confirmText: 'Yes, Cancel Processing',
        cancelText: 'Keep Running',
        variant: 'warning',
        iconType: 'stop',
        onConfirm: async () => {
          await executeCancel(item);
          setConfirmConfig((prev) => ({ ...prev, isOpen: false }));
        },
      });
    } else {
      executeCancel(item);
    }
  };

  const handleRemove = async (item: QueueItem) => {
    // Abort if currently uploading
    const ctrl = abortControllersRef.current.get(item.id);
    if (ctrl) {
      try { ctrl.abort(); } catch {}
      abortControllersRef.current.delete(item.id);
    }

    if (item.videoId) {
      try {
        await fetch(`/api/videos/${item.videoId}`, { method: 'DELETE' });
      } catch {}
    } else if (item.jobId) {
      try {
        await fetch(`/api/jobs/${item.jobId}/cancel`, { method: 'POST' });
        await fetch(`/api/jobs/${item.jobId}`, { method: 'DELETE' });
      } catch {}
    }

    setQueue((prev) => prev.filter((q) => q.id !== item.id));
    if (onUploadSuccess) onUploadSuccess();
  };

  const handleReprocessQueueItem = async (item: QueueItem) => {
    if (!item.videoId) return;
    const vId = item.videoId;
    setReprocessingIds((prev) => new Set(prev).add(vId));
    setQueue((prev) =>
      prev.map((q) =>
        q.videoId === vId || q.id === item.id
          ? {
              ...q,
              status: 'processing',
              stage: 'Restarting video indexing pipeline...',
              progress: 5,
              error: undefined,
            }
          : q
      )
    );

    try {
      const res = await fetch(`/api/videos/${vId}/reindex`, { method: 'POST' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to reprocess video');
      }
      if (onUploadSuccess) onUploadSuccess();
    } catch (err: any) {
      console.error('Failed to reprocess item in queue:', err);
      setQueue((prev) =>
        prev.map((q) =>
          q.videoId === vId || q.id === item.id
            ? {
                ...q,
                status: 'failed',
                error: err.message,
                stage: `Reprocess failed: ${err.message}`,
              }
            : q
        )
      );
    } finally {
      setReprocessingIds((prev) => {
        const next = new Set(prev);
        next.delete(vId);
        return next;
      });
    }
  };

  const handleReprocessAllEligible = async () => {
    const eligible = queue.filter(
      (q) => q.videoId && (q.status === 'failed' || q.status === 'cancelled')
    );
    for (const item of eligible) {
      await handleReprocessQueueItem(item);
    }
  };

  const promptRemoveItem = (item: QueueItem) => {
    if (item.status === 'processing' || item.status === 'uploading' || item.videoId || item.jobId) {
      setConfirmConfig({
        isOpen: true,
        title: `Remove "${item.name}"?`,
        message: 'This will stop any active processing and remove this video and its associated data.',
        confirmText: 'Remove Video',
        cancelText: 'Keep Video',
        variant: 'danger',
        iconType: 'trash',
        onConfirm: async () => {
          await handleRemove(item);
          setConfirmConfig((prev) => ({ ...prev, isOpen: false }));
        },
      });
    } else {
      handleRemove(item);
    }
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
              accept="video/*,.mp4,.mkv,.mov,.webm,.avi,.m4v,video/mp4,video/x-matroska,video/quicktime,video/webm,video/x-msvideo"
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
              <span>Duration: <strong className="text-slate-200">Any Length (Auto-Split)</strong></span>
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
                      onClick={promptStopQueue}
                      className="flex items-center space-x-1 px-2.5 py-1 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-300 hover:text-red-200 border border-red-500/30 text-xs font-semibold transition-all cursor-pointer"
                    >
                      <Square className="w-3 h-3 text-red-400" />
                      <span>Stop Processing</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={promptDeleteEntireQueue}
                    className="flex items-center space-x-1 px-2.5 py-1 rounded-lg bg-slate-800/80 hover:bg-red-500/15 hover:text-red-400 text-slate-400 text-xs transition-colors border border-slate-700/80 cursor-pointer"
                    title="Stop all and clear entire queue"
                  >
                    <Trash2 className="w-3 h-3" />
                    <span>Delete Queue</span>
                  </button>

                  {queue.some((q) => q.videoId && (q.status === 'failed' || q.status === 'cancelled')) && (
                    <button
                      type="button"
                      onClick={handleReprocessAllEligible}
                      className="flex items-center space-x-1 px-2.5 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 hover:text-amber-200 border border-amber-500/30 text-xs font-semibold transition-all cursor-pointer"
                      title="Restart all interrupted or failed items"
                    >
                      <RotateCcw className="w-3 h-3 text-amber-400" />
                      <span>Reprocess Failed</span>
                    </button>
                  )}

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

                      {/* Reprocess button only for failed or cancelled videos */}
                      {item.videoId && (item.status === 'failed' || item.status === 'cancelled') && (
                        <button
                          type="button"
                          onClick={() => handleReprocessQueueItem(item)}
                          disabled={reprocessingIds.has(item.videoId)}
                          className="flex items-center space-x-1 px-2.5 py-1 rounded-md bg-amber-600/20 hover:bg-amber-600 text-amber-300 hover:text-white text-[11px] font-semibold border border-amber-500/30 transition-all cursor-pointer shadow-sm disabled:opacity-50"
                          title="Restart AI indexing pipeline for this video"
                        >
                          <RotateCcw className={`w-3 h-3 ${reprocessingIds.has(item.videoId) ? 'animate-spin' : ''}`} />
                          <span>Reprocess</span>
                        </button>
                      )}

                      {/* Cancel button if active */}
                      {(item.status === 'processing' || item.status === 'uploading' || item.status === 'queued') && (
                        <button
                          onClick={() => promptCancelItem(item)}
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
                        onClick={() => promptRemoveItem(item)}
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
                onClick={promptDeleteEntireQueue}
                className="px-3.5 py-2.5 rounded-xl bg-slate-900 hover:bg-red-500/20 hover:text-red-300 text-slate-400 text-xs font-semibold border border-slate-800 hover:border-red-500/30 transition-all flex items-center space-x-1.5 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete Queue</span>
              </button>
            )}

            {(isBatchProcessing || processingCount > 0) && (
              <button
                type="button"
                onClick={promptStopQueue}
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

      {/* Custom Confirmation Modal */}
      <ConfirmModal
        isOpen={confirmConfig.isOpen}
        title={confirmConfig.title}
        message={confirmConfig.message}
        confirmText={confirmConfig.confirmText}
        cancelText={confirmConfig.cancelText}
        variant={confirmConfig.variant}
        iconType={confirmConfig.iconType}
        onConfirm={confirmConfig.onConfirm}
        onClose={() => setConfirmConfig((prev) => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
}

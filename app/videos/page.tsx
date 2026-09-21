'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import {
  Upload,
  Film,
  Search,
  Trash2,
  Play,
  Layers,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Clock,
  FileVideo,
  RefreshCw,
  Folder,
  FolderPlus,
  Plus,
  Square,
  Tag,
  ShieldCheck
} from 'lucide-react';
import { formatTime } from '@/components/VideoPlayer';
import BulkUploadQueueModal from '@/components/BulkUploadQueueModal';
import GroupSelectDropdown from '@/components/GroupSelectDropdown';

export default function VideosPage() {
  const [videos, setVideos] = useState<any[]>([]);
  const [groups, setGroups] = useState<any[]>([]);
  const [activeGroupId, setActiveGroupId] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [fileDetails, setFileDetails] = useState<any | null>(null);
  const [singleUploadGroupId, setSingleUploadGroupId] = useState<string>('');
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [processingStage, setProcessingStage] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [bulkModalOpen, setBulkModalOpen] = useState(false);
  const [activeJobsCount, setActiveJobsCount] = useState(0);
  const [isCreatingGroupInline, setIsCreatingGroupInline] = useState(false);
  const [inlineGroupName, setInlineGroupName] = useState('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const fetchVideos = async () => {
    try {
      const res = await fetch('/api/videos');
      if (res.ok) {
        const data = await res.json();
        setVideos(data.videos || []);
      }
    } catch (e) {
      console.error('Error fetching videos:', e);
    } finally {
      setLoading(false);
    }
  };

  const fetchGroups = async () => {
    try {
      const res = await fetch('/api/groups');
      if (res.ok) {
        const data = await res.json();
        setGroups(data.groups || []);
      }
    } catch (e) {
      console.error('Error fetching groups:', e);
    }
  };

  const fetchJobs = async () => {
    try {
      const res = await fetch('/api/jobs');
      if (res.ok) {
        const data = await res.json();
        const active = (data.jobs || []).filter(
          (j: any) => j.status === 'processing' || j.status === 'pending'
        ).length;
        setActiveJobsCount(active);
      }
    } catch (e) {
      console.error('Error fetching jobs:', e);
    }
  };

  const refreshAll = () => {
    fetchVideos();
    fetchGroups();
    fetchJobs();
  };

  useEffect(() => {
    refreshAll();
    const interval = setInterval(refreshAll, 4000);
    return () => clearInterval(interval);
  }, []);

  const handleFileSelect = (file: File) => {
    setErrorMsg(null);
    setSelectedFile(file);
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);

    const tempVideo = document.createElement('video');
    tempVideo.preload = 'metadata';
    tempVideo.src = url;
    tempVideo.onloadedmetadata = () => {
      setFileDetails({
        name: file.name,
        sizeMB: (file.size / (1024 * 1024)).toFixed(2),
        duration: tempVideo.duration || 0,
        width: tempVideo.videoWidth || 1280,
        height: tempVideo.videoHeight || 720,
        type: file.type || 'video/mp4',
      });
    };
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelect(e.dataTransfer.files[0]);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) return;

    setUploading(true);
    setErrorMsg(null);
    setUploadProgress(15);
    setProcessingStage('Uploading video file...');

    const formData = new FormData();
    formData.append('file', selectedFile);
    formData.append('autoIndex', 'true');
    if (singleUploadGroupId) {
      formData.append('groupId', singleUploadGroupId);
    }

    try {
      setUploadProgress(50);
      setProcessingStage('Extracting metadata & storing...');

      const res = await fetch('/api/videos/upload', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Upload failed');
      }

      setUploadProgress(100);
      setProcessingStage('Indexing initiated! Redirecting to video studio...');
      refreshAll();
      setTimeout(() => {
        window.location.href = `/videos/${data.video.id}`;
      }, 1000);
    } catch (err: any) {
      setErrorMsg(err.message);
      setUploading(false);
      setProcessingStage(null);
    }
  };

  const handleDeleteVideo = async (videoId: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm('Are you sure you want to delete this video and all its scenes/embeddings?')) {
      return;
    }

    try {
      const res = await fetch(`/api/videos/${videoId}`, { method: 'DELETE' });
      if (res.ok) {
        setVideos((prev) => prev.filter((v) => v.id !== videoId));
        fetchGroups();
      }
    } catch (e) {
      console.error('Delete error:', e);
    }
  };

  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inlineGroupName.trim()) return;

    try {
      const res = await fetch('/api/groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: inlineGroupName.trim() }),
      });
      if (res.ok) {
        const data = await res.json();
        setInlineGroupName('');
        setIsCreatingGroupInline(false);
        fetchGroups();
        if (data.group?.id) {
          setActiveGroupId(data.group.id);
          setSingleUploadGroupId(data.group.id);
        }
      }
    } catch (err) {
      console.error('Failed to create group:', err);
    }
  };

  // Filtered videos based on active tab
  const displayedVideos =
    activeGroupId === 'all'
      ? videos
      : videos.filter((v) => v.groupId === activeGroupId);

  return (
    <div className="space-y-10 animate-in fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white">Video Studio & Upload</h1>
          <p className="text-slate-400 text-sm mt-1">
            Upload videos for multimodal AI scene indexing, organize into shows/groups, and search semantically.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={() => setBulkModalOpen(true)}
            className="flex items-center space-x-2 px-4 py-2.5 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs sm:text-sm font-semibold shadow-lg shadow-blue-500/25 transition-all"
          >
            <Layers className="w-4 h-4" />
            <span>Bulk Upload & Queue</span>
            {activeJobsCount > 0 && (
              <span className="ml-1 px-2 py-0.5 rounded-full bg-amber-400 text-slate-950 font-bold text-[10px] animate-pulse">
                {activeJobsCount} active
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Upload Zone & Inspector */}
      <div className="glass-panel p-6 rounded-3xl border border-slate-800 space-y-6">
        <div
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`relative border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all ${
            dragActive
              ? 'border-blue-500 bg-blue-500/10'
              : 'border-slate-700/80 hover:border-slate-600 bg-slate-950/40 hover:bg-slate-900/40'
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="video/mp4,video/mkv,video/mov,video/webm,video/avi"
            className="hidden"
            onChange={(e) => {
              if (e.target.files && e.target.files[0]) {
                handleFileSelect(e.target.files[0]);
              }
            }}
          />

          <div className="space-y-3">
            <div className="w-14 h-14 rounded-2xl bg-blue-600/10 border border-blue-500/30 text-blue-400 flex items-center justify-center mx-auto shadow-lg shadow-blue-500/10">
              <Upload className="w-7 h-7" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-200">
                Click to browse or drag & drop video here
              </p>
              <p className="text-xs text-slate-500 mt-1">
                Supports MP4, MKV, MOV, WEBM, AVI (including long videos up to 2 hours)
              </p>
            </div>
            <div className="pt-1">
              <span
                onClick={(e) => {
                  e.stopPropagation();
                  setBulkModalOpen(true);
                }}
                className="inline-flex items-center space-x-1.5 text-xs text-indigo-400 hover:text-indigo-300 underline underline-offset-4 font-medium"
              >
                <Layers className="w-3.5 h-3.5" />
                <span>Want to upload multiple episodes/videos at once? Open Bulk Queue</span>
              </span>
            </div>
          </div>
        </div>

        {/* Google File API Limits Indicator */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs pt-1">
          <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80 flex items-center space-x-2.5">
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
            <div>
              <span className="text-slate-500 block text-[11px]">Max File Size</span>
              <span className="font-semibold text-slate-200">2 GB / video</span>
            </div>
          </div>
          <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80 flex items-center space-x-2.5">
            <Clock className="w-4 h-4 text-blue-400 shrink-0" />
            <div>
              <span className="text-slate-500 block text-[11px]">Max Video Length</span>
              <span className="font-semibold text-slate-200">Up to 2 hours</span>
            </div>
          </div>
          <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80 flex items-center space-x-2.5">
            <Layers className="w-4 h-4 text-indigo-400 shrink-0" />
            <div>
              <span className="text-slate-500 block text-[11px]">Cloud Buffer</span>
              <span className="font-semibold text-slate-200">20 GB Project Limit</span>
            </div>
          </div>
          <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80 flex items-center space-x-2.5">
            <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
            <div>
              <span className="text-slate-500 block text-[11px]">Auto Clean-up</span>
              <span className="font-semibold text-slate-200">48h retention</span>
            </div>
          </div>
        </div>

        {/* Client-Side Preview & Metadata Inspector before Upload */}
        {selectedFile && fileDetails && (
          <div className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-4 animate-in fade-in">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white flex items-center space-x-2">
                <FileVideo className="w-4 h-4 text-blue-400" />
                <span>Video Inspection Preview</span>
              </h3>
              <button
                onClick={() => {
                  setSelectedFile(null);
                  setPreviewUrl(null);
                  setFileDetails(null);
                }}
                className="text-xs text-slate-400 hover:text-white"
              >
                Clear
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-5 items-center">
              {previewUrl && (
                <div className="aspect-video rounded-xl overflow-hidden bg-black border border-slate-800">
                  <video src={previewUrl} controls className="w-full h-full object-contain" />
                </div>
              )}

              <div className="md:col-span-2 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800">
                  <span className="text-slate-500 block">Filename</span>
                  <span className="font-semibold text-slate-200 truncate block mt-0.5" title={fileDetails.name}>
                    {fileDetails.name}
                  </span>
                </div>
                <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800">
                  <span className="text-slate-500 block">File Size</span>
                  <span className="font-semibold text-slate-200 block mt-0.5">{fileDetails.sizeMB} MB</span>
                </div>
                <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800">
                  <span className="text-slate-500 block">Est. Duration</span>
                  <span className="font-semibold text-slate-200 block mt-0.5">{formatTime(fileDetails.duration)}</span>
                </div>
                <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800">
                  <span className="text-slate-500 block">Resolution</span>
                  <span className="font-semibold text-slate-200 block mt-0.5">
                    {fileDetails.width}x{fileDetails.height}
                  </span>
                </div>
              </div>
            </div>

            {/* Over 2 GB Limit Warning Banner */}
            {selectedFile && selectedFile.size > 2 * 1024 * 1024 * 1024 && (
              <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs flex items-center space-x-2.5">
                <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                <span>
                  <strong>Google File API limit exceeded:</strong> This video is {(selectedFile.size / (1024 * 1024 * 1024)).toFixed(2)} GB. Google allows a maximum of <strong>2 GB</strong> per video upload. Please trim or compress the video before uploading.
                </span>
              </div>
            )}

            {/* Show / Group Selection for Single Upload */}
            <div className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800/80 flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex items-center space-x-2 text-slate-300">
                <Folder className="w-4 h-4 text-indigo-400" />
                <span className="font-semibold">Assign to Show / Group:</span>
              </div>
              <div className="flex items-center space-x-2">
                <GroupSelectDropdown
                  groups={groups}
                  selectedGroupId={singleUploadGroupId}
                  onSelectGroup={(id) => setSingleUploadGroupId(id)}
                  allLabel="No Group (Standalone)"
                  allValue=""
                  className="min-w-[200px]"
                />
                <button
                  type="button"
                  onClick={() => setIsCreatingGroupInline(true)}
                  className="px-2.5 py-2.5 rounded-xl bg-indigo-600/20 text-indigo-400 hover:bg-indigo-600 hover:text-white border border-indigo-500/30 text-xs transition-colors shrink-0"
                >
                  + New
                </button>
              </div>
            </div>

            {/* Upload Action */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-2">
              <div className="text-xs text-slate-400">
                AI indexing will automatically segment continuous scenes and generate embeddings.
              </div>
              <button
                onClick={handleUpload}
                disabled={uploading || (selectedFile && selectedFile.size > 2 * 1024 * 1024 * 1024)}
                className="w-full sm:w-auto flex items-center justify-center space-x-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold rounded-xl shadow-lg shadow-blue-500/20 transition-all disabled:opacity-50"
              >
                <Upload className="w-4 h-4" />
                <span>{uploading ? 'Processing...' : 'Upload & Start Indexing'}</span>
              </button>
            </div>

            {/* Upload Progress Bar */}
            {uploading && (
              <div className="space-y-2 pt-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-blue-400 font-medium">{processingStage}</span>
                  <span className="font-mono text-slate-400">{uploadProgress}%</span>
                </div>
                <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                  <div
                    className="bg-blue-600 h-full rounded-full transition-all duration-300"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
              </div>
            )}

            {errorMsg && (
              <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs">
                {errorMsg}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Video Library Section */}
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center space-x-3">
            <h2 className="text-xl font-bold text-white flex items-center space-x-2">
              <Film className="w-5 h-5 text-blue-400" />
              <span>Video Library</span>
            </h2>
            <span className="px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-400 text-xs font-semibold">
              {displayedVideos.length} {displayedVideos.length === 1 ? 'video' : 'videos'}
            </span>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={refreshAll}
              className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-colors"
              title="Refresh list"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Group / Show Filter Tabs */}
        <div className="flex flex-wrap items-center gap-2 pb-2 border-b border-slate-800/80">
          <button
            onClick={() => setActiveGroupId('all')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center space-x-2 ${
              activeGroupId === 'all'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
                : 'bg-slate-900/80 text-slate-400 hover:text-slate-200 hover:bg-slate-800 border border-slate-800'
            }`}
          >
            <span>All Videos</span>
            <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${
              activeGroupId === 'all' ? 'bg-blue-500 text-white' : 'bg-slate-800 text-slate-400'
            }`}>
              {videos.length}
            </span>
          </button>

          {groups.map((group) => {
            const count = videos.filter((v) => v.groupId === group.id).length;
            const isActive = activeGroupId === group.id;

            return (
              <button
                key={group.id}
                onClick={() => setActiveGroupId(group.id)}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center space-x-2 ${
                  isActive
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-500/20'
                    : 'bg-slate-900/80 text-slate-400 hover:text-slate-200 hover:bg-slate-800 border border-slate-800'
                }`}
              >
                <Folder className="w-3.5 h-3.5" />
                <span>{group.name}</span>
                <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                  isActive ? 'bg-indigo-500 text-white' : 'bg-slate-800 text-slate-400'
                }`}>
                  {count}
                </span>
              </button>
            );
          })}

          {!isCreatingGroupInline ? (
            <button
              onClick={() => setIsCreatingGroupInline(true)}
              className="px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-400 hover:text-indigo-400 hover:bg-indigo-500/10 border border-dashed border-slate-800 hover:border-indigo-500/30 transition-all flex items-center space-x-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>New Show / Group</span>
            </button>
          ) : (
            <form onSubmit={handleCreateGroup} className="flex items-center space-x-1.5">
              <input
                type="text"
                value={inlineGroupName}
                onChange={(e) => setInlineGroupName(e.target.value)}
                placeholder="Show or group name..."
                autoFocus
                className="bg-slate-950 border border-slate-700 rounded-xl px-2.5 py-1 text-slate-200 text-xs focus:outline-none focus:border-blue-500"
              />
              <button
                type="submit"
                className="px-2.5 py-1 rounded-xl bg-blue-600 text-white text-xs font-semibold hover:bg-blue-500"
              >
                Add
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsCreatingGroupInline(false);
                  setInlineGroupName('');
                }}
                className="px-2 py-1 text-slate-400 hover:text-white text-xs"
              >
                Cancel
              </button>
            </form>
          )}
        </div>

        {displayedVideos.length === 0 && !loading ? (
          <div className="p-12 rounded-3xl bg-slate-900/40 border border-slate-800 text-center space-y-3">
            <Film className="w-12 h-12 text-slate-600 mx-auto" />
            <h4 className="text-slate-300 font-semibold">
              {activeGroupId === 'all' ? 'No indexed videos' : 'No videos in this show / group'}
            </h4>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              {activeGroupId === 'all'
                ? 'Upload a video above or use Bulk Upload Queue to get started.'
                : 'Upload videos or episodes and assign them to this group.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {displayedVideos.map((video) => (
              <div
                key={video.id}
                className="glass-panel glass-panel-hover rounded-2xl border border-slate-800 overflow-hidden flex flex-col justify-between group"
              >
                <div>
                  {/* Thumbnail / Header */}
                  <div className="relative aspect-video bg-slate-950 overflow-hidden">
                    <img
                      src={`/api/media/thumbnails/thumb_${video.id}.jpg`}
                      alt={video.filename}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none';
                      }}
                    />
                    <div className="absolute top-3 left-3 flex flex-wrap gap-1.5">
                      <span
                        className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-md backdrop-blur-md ${
                          video.status === 'indexed'
                            ? 'bg-emerald-500/80 text-white'
                            : video.status === 'processing'
                            ? 'bg-amber-500/80 text-white animate-pulse'
                            : video.status === 'failed'
                            ? 'bg-red-600/90 text-white'
                            : video.status === 'cancelled'
                            ? 'bg-slate-800/90 text-slate-300 border border-slate-700'
                            : 'bg-slate-800/80 text-slate-300'
                        }`}
                      >
                        {video.status === 'failed'
                          ? '✕ Failed'
                          : video.status === 'cancelled'
                          ? '⊘ Cancelled'
                          : video.status}
                      </span>

                      {video.groupName && (
                        <span className="text-[10px] font-semibold px-2 py-1 rounded-md bg-indigo-900/80 text-indigo-200 backdrop-blur-md border border-indigo-500/30 flex items-center space-x-1">
                          <Folder className="w-3 h-3 text-indigo-400" />
                          <span className="truncate max-w-[120px]">{video.groupName}</span>
                        </span>
                      )}
                    </div>
                    <div className="absolute bottom-3 right-3 px-2 py-0.5 rounded bg-black/80 text-xs font-mono text-slate-200 backdrop-blur-sm">
                      {formatTime(video.duration)}
                    </div>
                  </div>

                  {/* Body Info */}
                  <div className="p-5 space-y-3">
                    <h3 className="font-semibold text-white text-base line-clamp-1 group-hover:text-blue-400 transition-colors">
                      {video.filename}
                    </h3>

                    <div className="grid grid-cols-2 gap-2 text-xs text-slate-400">
                      <div className="flex items-center space-x-1.5">
                        <Layers className="w-3.5 h-3.5 text-indigo-400" />
                        <span>{video.sceneCount || 0} scenes</span>
                      </div>
                      <div className="flex items-center space-x-1.5">
                        <Clock className="w-3.5 h-3.5 text-blue-400" />
                        <span>{video.width}x{video.height} @ {video.fps}fps</span>
                      </div>
                    </div>

                    {video.status === 'processing' && (
                      <div className="space-y-1 pt-1">
                        <div className="flex justify-between text-[11px] text-amber-400">
                          <span>Indexing video...</span>
                          <span>{video.processingProgress}%</span>
                        </div>
                        <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                          <div
                            className="bg-amber-500 h-full rounded-full transition-all duration-300"
                            style={{ width: `${video.processingProgress}%` }}
                          />
                        </div>
                      </div>
                    )}

                    {video.status === 'failed' && (
                      <div className="flex items-start gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/30">
                        <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                        <div className="space-y-0.5">
                          <p className="text-[11px] font-semibold text-red-400">AI Analysis Failed</p>
                          <p className="text-[10px] text-red-300/80 line-clamp-2">
                            {video.errorMessage || 'Processing error. Try re-uploading.'}
                          </p>
                        </div>
                      </div>
                    )}

                    {video.status === 'cancelled' && (
                      <div className="flex items-start gap-2 p-3 rounded-xl bg-slate-800/40 border border-slate-700/60">
                        <Square className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                        <p className="text-[11px] text-slate-400">
                          Processing was cancelled by user.
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Card Actions */}
                <div className="px-5 py-3.5 border-t border-slate-800/80 bg-slate-900/50 flex items-center justify-between gap-2">
                  <div className="flex items-center space-x-2">
                    {video.status !== 'failed' && video.status !== 'cancelled' && (
                      <>
                        <Link
                          href={`/videos/${video.id}`}
                          className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-blue-600/20 hover:bg-blue-600 text-blue-400 hover:text-white text-xs font-semibold border border-blue-500/30 transition-all"
                        >
                          <Play className="w-3.5 h-3.5" />
                          <span>Studio</span>
                        </Link>

                        <Link
                          href={`/videos/${video.id}/search`}
                          className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-indigo-600/20 hover:bg-indigo-600 text-indigo-400 hover:text-white text-xs font-semibold border border-indigo-500/30 transition-all"
                        >
                          <Search className="w-3.5 h-3.5" />
                          <span>Search</span>
                        </Link>
                      </>
                    )}
                    {(video.status === 'failed' || video.status === 'cancelled') && (
                      <span className="text-[11px] text-slate-400 italic">
                        {video.status === 'cancelled' ? 'Indexing halted' : 'Delete and re-upload'}
                      </span>
                    )}
                  </div>

                  <button
                    onClick={(e) => handleDeleteVideo(video.id, e)}
                    className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                    title="Delete video"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Bulk Upload Queue Modal */}
      <BulkUploadQueueModal
        isOpen={bulkModalOpen}
        onClose={() => setBulkModalOpen(false)}
        onUploadSuccess={refreshAll}
        groups={groups}
        onRefreshGroups={fetchGroups}
      />
    </div>
  );
}

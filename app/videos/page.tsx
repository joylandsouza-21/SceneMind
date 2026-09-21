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
  Eye
} from 'lucide-react';
import { formatTime } from '@/components/VideoPlayer';

export default function VideosPage() {
  const [videos, setVideos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [fileDetails, setFileDetails] = useState<any | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [processingStage, setProcessingStage] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
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

  useEffect(() => {
    fetchVideos();
    const interval = setInterval(fetchVideos, 4000);
    return () => clearInterval(interval);
  }, []);

  const handleFileSelect = (file: File) => {
    setErrorMsg(null);
    setSelectedFile(file);
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);

    // Read metadata via temporary HTML5 video element
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
      }
    } catch (e) {
      console.error('Delete error:', e);
    }
  };

  return (
    <div className="space-y-10 animate-in fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white">Video Studio & Upload</h1>
          <p className="text-slate-400 text-sm mt-1">
            Upload videos for multimodal AI scene indexing and semantic search.
          </p>
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

            {/* Upload Action */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-2">
              <div className="text-xs text-slate-400">
                AI indexing will automatically segment continuous scenes and generate embeddings.
              </div>
              <button
                onClick={handleUpload}
                disabled={uploading}
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
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-white flex items-center space-x-2">
            <Film className="w-5 h-5 text-blue-400" />
            <span>Video Library ({videos.length})</span>
          </h2>
          <button
            onClick={fetchVideos}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
            title="Refresh list"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

        {videos.length === 0 && !loading ? (
          <div className="p-12 rounded-3xl bg-slate-900/40 border border-slate-800 text-center space-y-3">
            <Film className="w-12 h-12 text-slate-600 mx-auto" />
            <h4 className="text-slate-300 font-semibold">No indexed videos</h4>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              Upload a video above or generate a multi-scene demo video using the top right navbar button.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {videos.map((video) => (
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
                    <div className="absolute top-3 left-3">
                      <span
                        className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-md backdrop-blur-md ${
                          video.status === 'indexed'
                            ? 'bg-emerald-500/80 text-white'
                            : video.status === 'processing'
                            ? 'bg-amber-500/80 text-white animate-pulse'
                            : video.status === 'failed'
                            ? 'bg-red-600/90 text-white'
                            : 'bg-slate-800/80 text-slate-300'
                        }`}
                      >
                        {video.status === 'failed' ? '✕ Failed' : video.status}
                      </span>
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
                            {video.errorMessage || 'Gemini API call failed. Check your API key or try again later.'}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Card Actions */}
                <div className="px-5 py-3.5 border-t border-slate-800/80 bg-slate-900/50 flex items-center justify-between gap-2">
                  <div className="flex items-center space-x-2">
                    {video.status !== 'failed' && (
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
                    {video.status === 'failed' && (
                      <span className="text-[11px] text-red-400/70 italic">Delete and re-upload to retry</span>
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
    </div>
  );
}

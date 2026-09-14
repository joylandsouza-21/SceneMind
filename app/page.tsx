'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Film,
  Scissors,
  DollarSign,
  Layers,
  Search,
  Upload,
  Sparkles,
  ArrowRight,
  Clock,
  CheckCircle2,
  AlertCircle,
  Activity,
  Play
} from 'lucide-react';
import { formatTime } from '@/components/VideoPlayer';

export default function DashboardPage() {
  const [stats, setStats] = useState({
    videoCount: 0,
    sceneCount: 0,
    clipCount: 0,
    totalCost: '$0.000',
  });
  const [recentVideos, setRecentVideos] = useState<any[]>([]);
  const [recentClips, setRecentClips] = useState<any[]>([]);
  const [activeJobs, setActiveJobs] = useState<any[]>([]);
  const [costsSummary, setCostsSummary] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchDashboardData = async () => {
    try {
      const [videosRes, clipsRes, jobsRes, costsRes] = await Promise.all([
        fetch('/api/videos'),
        fetch('/api/clips'),
        fetch('/api/jobs'),
        fetch('/api/costs'),
      ]);

      const videosData = await videosRes.json();
      const clipsData = await clipsRes.json();
      const jobsData = await jobsRes.json();
      const costsData = await costsRes.json();

      const videos = videosData.videos || [];
      const clips = clipsData.clips || [];
      const jobs = jobsData.jobs || [];

      let totalScenes = 0;
      videos.forEach((v: any) => {
        totalScenes += v.sceneCount || 0;
      });

      setStats({
        videoCount: videos.length,
        sceneCount: totalScenes,
        clipCount: clips.length,
        totalCost: `$${(costsData.summary?.totalCost || 0).toFixed(4)}`,
      });

      setRecentVideos(videos.slice(0, 4));
      setRecentClips(clips.slice(0, 3));
      setActiveJobs(jobs.filter((j: any) => j.status === 'processing' || j.status === 'pending'));
      setCostsSummary(costsData.summary);
    } catch (e) {
      console.error('Error fetching dashboard:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
    const interval = setInterval(fetchDashboardData, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="space-y-8 animate-in fade-in">
      {/* Hero Welcome Banner */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-blue-950/80 via-slate-900 to-indigo-950/80 border border-blue-500/20 p-8 shadow-2xl">
        <div className="relative z-10 max-w-2xl space-y-4">
          <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/30 text-blue-400 text-xs font-semibold">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Multimodal Gemini AI + FFmpeg Engine</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white">
            AI-Powered Video Indexing & Semantic Video Clipping
          </h1>
          <p className="text-slate-300 text-sm leading-relaxed">
            Index long videos up to 2 hours into searchable multimodal scenes. Query using natural language, verify exact temporal boundaries with AI, and extract sub-clips in seconds.
          </p>

          <div className="flex flex-wrap gap-3 pt-2">
            <Link
              href="/videos"
              className="flex items-center space-x-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold shadow-lg shadow-blue-500/30 transition-all hover:scale-105 active:scale-95"
            >
              <Upload className="w-4 h-4" />
              <span>Upload Video</span>
            </Link>
            <Link
              href="/search"
              className="flex items-center space-x-2 px-5 py-2.5 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 text-slate-200 text-sm font-semibold border border-slate-700 transition-all"
            >
              <Search className="w-4 h-4" />
              <span>Global Semantic Search</span>
            </Link>
          </div>
        </div>

        {/* Ambient background glow */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <div className="glass-panel p-6 rounded-2xl border border-slate-800 flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Total Videos</p>
            <h3 className="text-3xl font-bold text-white mt-1">{stats.videoCount}</h3>
            <p className="text-[11px] text-slate-500 mt-1">Ingested & stored</p>
          </div>
          <div className="p-3.5 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20">
            <Film className="w-6 h-6" />
          </div>
        </div>

        <div className="glass-panel p-6 rounded-2xl border border-slate-800 flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Indexed Scenes</p>
            <h3 className="text-3xl font-bold text-white mt-1">{stats.sceneCount}</h3>
            <p className="text-[11px] text-slate-500 mt-1">Vector embeddings ready</p>
          </div>
          <div className="p-3.5 rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
            <Layers className="w-6 h-6" />
          </div>
        </div>

        <div className="glass-panel p-6 rounded-2xl border border-slate-800 flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Generated Clips</p>
            <h3 className="text-3xl font-bold text-white mt-1">{stats.clipCount}</h3>
            <p className="text-[11px] text-slate-500 mt-1">Rendered with FFmpeg</p>
          </div>
          <div className="p-3.5 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <Scissors className="w-6 h-6" />
          </div>
        </div>

        <div className="glass-panel p-6 rounded-2xl border border-slate-800 flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">AI Processing Cost</p>
            <h3 className="text-3xl font-bold text-white mt-1">{stats.totalCost}</h3>
            <p className="text-[11px] text-slate-500 mt-1">Tracked via PricingService</p>
          </div>
          <div className="p-3.5 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <DollarSign className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Active Pipeline Jobs Banner */}
      {activeJobs.length > 0 && (
        <div className="p-5 rounded-2xl bg-slate-900 border border-amber-500/40 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2 text-amber-400 text-sm font-semibold">
              <Activity className="w-4 h-4 animate-spin" />
              <span>Background Processing Queue ({activeJobs.length} Active)</span>
            </div>
            <span className="text-xs text-slate-400">Streaming live updates</span>
          </div>

          <div className="space-y-2">
            {activeJobs.map((job) => (
              <div key={job.id} className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <span className="text-xs font-semibold text-slate-200">
                    {job.videoName || 'Video Pipeline'}: {job.currentStep}
                  </span>
                  <p className="text-[11px] text-slate-500 font-mono">Job ID: {job.id.slice(0, 16)}...</p>
                </div>
                <div className="flex items-center space-x-3 sm:w-48">
                  <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                    <div className="bg-amber-500 h-full rounded-full transition-all" style={{ width: `${job.progress}%` }} />
                  </div>
                  <span className="text-xs font-mono text-amber-400 whitespace-nowrap">{job.progress}%</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Main Two-Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left 2 Cols: Recent Videos */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-white flex items-center space-x-2">
              <Film className="w-5 h-5 text-blue-400" />
              <span>Recent Videos</span>
            </h2>
            <Link href="/videos" className="text-xs text-blue-400 hover:text-blue-300 flex items-center space-x-1">
              <span>View Library</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          {recentVideos.length === 0 ? (
            <div className="p-10 rounded-2xl bg-slate-900/60 border border-slate-800 text-center space-y-4">
              <Film className="w-12 h-12 text-slate-600 mx-auto" />
              <div>
                <h4 className="text-slate-300 font-medium">No videos uploaded yet</h4>
                <p className="text-xs text-slate-500 mt-1">
                  Upload a video or click "Seed Demo Video" in the navbar to test immediately.
                </p>
              </div>
              <Link
                href="/videos"
                className="inline-flex items-center space-x-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-lg shadow-md transition-all"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>Upload First Video</span>
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {recentVideos.map((video) => (
                <Link
                  key={video.id}
                  href={`/videos/${video.id}`}
                  className="glass-panel glass-panel-hover p-4 rounded-2xl border border-slate-800 group block space-y-3"
                >
                  <div className="relative aspect-video rounded-xl bg-slate-950 overflow-hidden flex items-center justify-center border border-slate-800/80">
                    <img
                      src={`/api/media/thumbnails/thumb_${video.id}.jpg`}
                      alt={video.filename}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none';
                      }}
                    />
                    <div className="absolute bottom-2 right-2 px-2 py-0.5 rounded bg-black/80 text-[11px] font-mono text-slate-300 backdrop-blur-sm">
                      {formatTime(video.duration)}
                    </div>
                    <div className="absolute top-2 left-2">
                      <span
                        className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full ${
                          video.status === 'indexed'
                            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                            : video.status === 'processing'
                            ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                            : 'bg-slate-700/50 text-slate-300 border border-slate-600'
                        }`}
                      >
                        {video.status}
                      </span>
                    </div>
                  </div>

                  <div>
                    <h4 className="font-semibold text-slate-200 text-sm group-hover:text-blue-400 transition-colors line-clamp-1">
                      {video.filename}
                    </h4>
                    <div className="flex items-center justify-between text-xs text-slate-500 mt-1">
                      <span>{video.sceneCount || 0} scenes indexed</span>
                      <span>{video.clipCount || 0} clips</span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Right 1 Col: Recent Clips & AI Cost Breakdown */}
        <div className="space-y-6">
          <div className="space-y-4">
            <h2 className="text-lg font-bold text-white flex items-center space-x-2">
              <Scissors className="w-5 h-5 text-emerald-400" />
              <span>Recent Video Clips</span>
            </h2>

            {recentClips.length === 0 ? (
              <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 text-center text-xs text-slate-500">
                No clips generated yet. Use the semantic search or video detail player to extract clips.
              </div>
            ) : (
              <div className="space-y-3">
                {recentClips.map((clip) => (
                  <div
                    key={clip.id}
                    className="p-3 rounded-xl bg-slate-900/70 border border-slate-800/80 space-y-2"
                  >
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-mono text-blue-400 font-medium">
                        {formatTime(clip.startTime)} → {formatTime(clip.endTime)}
                      </span>
                      <span className="text-[11px] text-slate-500">({clip.duration}s)</span>
                    </div>
                    {clip.query && (
                      <p className="text-xs text-slate-300 italic line-clamp-1">"{clip.query}"</p>
                    )}
                    <video
                      src={`/api/media/${clip.outputPath}`}
                      controls
                      className="w-full rounded-lg bg-black aspect-video max-h-36 object-contain"
                    />
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* AI Cost breakdown widget */}
          {costsSummary && (
            <div className="p-5 rounded-2xl bg-slate-900/70 border border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">AI Operations Cost</span>
                <span className="text-sm font-mono font-bold text-emerald-400">${costsSummary.totalCost.toFixed(4)}</span>
              </div>
              <div className="space-y-1.5 text-xs">
                <div className="flex items-center justify-between text-slate-400">
                  <span>Scene Analysis:</span>
                  <span className="font-mono text-slate-200">${(costsSummary.byType?.SCENE_ANALYSIS?.cost || 0).toFixed(4)}</span>
                </div>
                <div className="flex items-center justify-between text-slate-400">
                  <span>Embedding Vectors:</span>
                  <span className="font-mono text-slate-200">${(costsSummary.byType?.EMBEDDING?.cost || 0).toFixed(4)}</span>
                </div>
                <div className="flex items-center justify-between text-slate-400">
                  <span>Timestamp Verification:</span>
                  <span className="font-mono text-slate-200">${(costsSummary.byType?.TIMESTAMP_VERIFICATION?.cost || 0).toFixed(4)}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

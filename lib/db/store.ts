import fs from 'fs';
import path from 'path';
import { DatabaseSchema, Video, VideoScene, VideoSearch, VideoClip, ProcessingJob, AiCost, VectorRecord } from './types';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'sheela-store.json');

const defaultData: DatabaseSchema = {
  videos: [],
  scenes: [],
  searches: [],
  clips: [],
  jobs: [],
  costs: [],
  vectors: [],
};

class Store {
  private data: DatabaseSchema;
  private saveTimeout: NodeJS.Timeout | null = null;

  constructor() {
    this.ensureDataDir();
    this.data = this.loadData();
  }

  private ensureDataDir() {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
  }

  private loadData(): DatabaseSchema {
    try {
      if (fs.existsSync(DB_FILE)) {
        const raw = fs.readFileSync(DB_FILE, 'utf-8');
        const parsed = JSON.parse(raw);
        return {
          videos: parsed.videos || [],
          scenes: parsed.scenes || [],
          searches: parsed.searches || [],
          clips: parsed.clips || [],
          jobs: parsed.jobs || [],
          costs: parsed.costs || [],
          vectors: parsed.vectors || [],
        };
      }
    } catch (err) {
      console.error('Error loading database from file, initializing fresh:', err);
    }
    return JSON.parse(JSON.stringify(defaultData));
  }

  public saveSync() {
    this.ensureDataDir();
    const tempFile = `${DB_FILE}.tmp.${Date.now()}`;
    fs.writeFileSync(tempFile, JSON.stringify(this.data, null, 2), 'utf-8');
    fs.renameSync(tempFile, DB_FILE);
  }

  public save() {
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }
    this.saveTimeout = setTimeout(() => {
      this.saveSync();
    }, 100);
  }

  // --- Video CRUD ---
  public getVideos(): Video[] {
    return [...this.data.videos].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  public getVideo(id: string): Video | undefined {
    return this.data.videos.find((v) => v.id === id);
  }

  public upsertVideo(video: Video): Video {
    const idx = this.data.videos.findIndex((v) => v.id === video.id);
    if (idx >= 0) {
      this.data.videos[idx] = { ...video, updatedAt: new Date().toISOString() };
    } else {
      this.data.videos.push(video);
    }
    this.save();
    return video;
  }

  public deleteVideo(id: string): boolean {
    const initialLen = this.data.videos.length;
    this.data.videos = this.data.videos.filter((v) => v.id !== id);
    this.data.scenes = this.data.scenes.filter((s) => s.videoId !== id);
    this.data.clips = this.data.clips.filter((c) => c.videoId !== id);
    this.data.jobs = this.data.jobs.filter((j) => j.videoId !== id);
    this.data.costs = this.data.costs.filter((c) => c.videoId !== id);
    this.data.vectors = this.data.vectors.filter((v) => v.videoId !== id);
    this.save();
    return this.data.videos.length < initialLen;
  }

  // --- Scene CRUD ---
  public getScenes(videoId?: string): VideoScene[] {
    if (videoId) {
      return this.data.scenes
        .filter((s) => s.videoId === videoId)
        .sort((a, b) => a.startTime - b.startTime);
    }
    return [...this.data.scenes].sort((a, b) => a.startTime - b.startTime);
  }

  public getScene(id: string): VideoScene | undefined {
    return this.data.scenes.find((s) => s.id === id);
  }

  public upsertScene(scene: VideoScene): VideoScene {
    const idx = this.data.scenes.findIndex((s) => s.id === scene.id);
    if (idx >= 0) {
      this.data.scenes[idx] = scene;
    } else {
      this.data.scenes.push(scene);
    }
    this.save();
    return scene;
  }

  public replaceScenesForVideo(videoId: string, scenes: VideoScene[]) {
    this.data.scenes = this.data.scenes.filter((s) => s.videoId !== videoId);
    this.data.scenes.push(...scenes);
    this.save();
  }

  public deleteScene(id: string): boolean {
    const initialLen = this.data.scenes.length;
    this.data.scenes = this.data.scenes.filter((s) => s.id !== id);
    this.data.vectors = this.data.vectors.filter((v) => v.sceneId !== id);
    this.save();
    return this.data.scenes.length < initialLen;
  }

  // --- Search CRUD ---
  public recordSearch(search: VideoSearch) {
    this.data.searches.unshift(search);
    if (this.data.searches.length > 500) {
      this.data.searches = this.data.searches.slice(0, 500);
    }
    this.save();
  }

  public getSearches(videoId?: string): VideoSearch[] {
    if (videoId) {
      return this.data.searches.filter((s) => s.videoId === videoId);
    }
    return this.data.searches;
  }

  // --- Clip CRUD ---
  public getClips(videoId?: string): VideoClip[] {
    if (videoId) {
      return this.data.clips
        .filter((c) => c.videoId === videoId)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }
    return [...this.data.clips].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  public getClip(id: string): VideoClip | undefined {
    return this.data.clips.find((c) => c.id === id);
  }

  public upsertClip(clip: VideoClip): VideoClip {
    const idx = this.data.clips.findIndex((c) => c.id === clip.id);
    if (idx >= 0) {
      this.data.clips[idx] = clip;
    } else {
      this.data.clips.push(clip);
    }
    this.save();
    return clip;
  }

  // --- Jobs CRUD ---
  public getJobs(videoId?: string): ProcessingJob[] {
    if (videoId) {
      return this.data.jobs
        .filter((j) => j.videoId === videoId)
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    }
    return [...this.data.jobs].sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
  }

  public getJob(id: string): ProcessingJob | undefined {
    return this.data.jobs.find((j) => j.id === id);
  }

  public upsertJob(job: ProcessingJob): ProcessingJob {
    const idx = this.data.jobs.findIndex((j) => j.id === job.id);
    if (idx >= 0) {
      this.data.jobs[idx] = { ...job, updatedAt: new Date().toISOString() };
    } else {
      this.data.jobs.push(job);
    }
    this.save();
    return job;
  }

  // --- Costs CRUD ---
  public recordCost(cost: AiCost) {
    this.data.costs.push(cost);
    this.save();
  }

  public getCosts(videoId?: string): AiCost[] {
    if (videoId) {
      return this.data.costs.filter((c) => c.videoId === videoId);
    }
    return this.data.costs;
  }

  // --- Vectors CRUD ---
  public upsertVector(record: VectorRecord) {
    const idx = this.data.vectors.findIndex((v) => v.id === record.id);
    if (idx >= 0) {
      this.data.vectors[idx] = record;
    } else {
      this.data.vectors.push(record);
    }
    this.save();
  }

  public getVectors(videoId?: string): VectorRecord[] {
    if (videoId) {
      return this.data.vectors.filter((v) => v.videoId === videoId);
    }
    return this.data.vectors;
  }

  public deleteVector(id: string) {
    this.data.vectors = this.data.vectors.filter((v) => v.id !== id);
    this.save();
  }
}

// Global Singleton for Next.js hot-reloading preservation
const globalForStore = globalThis as unknown as { storeInstance: Store };
export const db = globalForStore.storeInstance || new Store();
if (process.env.NODE_ENV !== 'production') globalForStore.storeInstance = db;

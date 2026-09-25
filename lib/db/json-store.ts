import fs from 'fs';
import path from 'path';
import { DatabaseSchema, Video, VideoGroup, VideoScene, VideoSearch, VideoClip, ProcessingJob, AiCost, VectorRecord, AiModelConfig } from './types';
import { IStore } from './store.interface';

const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(process.cwd(), 'data'));
const DB_FILE = path.join(DATA_DIR, 'scenemind-store.json');

const defaultData: DatabaseSchema = {
  videos: [],
  groups: [],
  scenes: [],
  searches: [],
  clips: [],
  jobs: [],
  costs: [],
  vectors: [],
  configs: [],
};

export class JsonStore implements IStore {
  private data: DatabaseSchema;
  private saveTimeout: NodeJS.Timeout | null = null;
  private lastMtime: number = 0;

  constructor() {
    this.ensureDataDir();
    this.data = this.loadData();
    console.log('[db] Using JSON file store:', DB_FILE);
  }

  private ensureDataDir() {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
  }

  public reloadIfChanged() {
    try {
      if (fs.existsSync(DB_FILE)) {
        const stat = fs.statSync(DB_FILE);
        if (stat.mtimeMs > this.lastMtime) {
          this.data = this.loadData();
        }
      }
    } catch {
      // fallback silently
    }
  }

  private loadData(): DatabaseSchema {
    try {
      // Auto-migrate from any legacy store file if DB_FILE is not present
      if (!fs.existsSync(DB_FILE) && fs.existsSync(DATA_DIR)) {
        const existingStores = fs.readdirSync(DATA_DIR).filter(f => f.endsWith('-store.json') && f !== 'scenemind-store.json');
        if (existingStores.length > 0) {
          try {
            fs.copyFileSync(path.join(DATA_DIR, existingStores[0]), DB_FILE);
          } catch {
            // fallback silently
          }
        }
      }

      if (fs.existsSync(DB_FILE)) {
        const stat = fs.statSync(DB_FILE);
        this.lastMtime = stat.mtimeMs;
        const raw = fs.readFileSync(DB_FILE, 'utf-8');
        const parsed = JSON.parse(raw);
        return {
          videos: parsed.videos || [],
          groups: parsed.groups || [],
          scenes: parsed.scenes || [],
          searches: parsed.searches || [],
          clips: parsed.clips || [],
          jobs: parsed.jobs || [],
          costs: parsed.costs || [],
          vectors: parsed.vectors || [],
          configs: parsed.configs || [],
        };
      }
    } catch (err) {
      console.error('Error loading database from file, initializing fresh:', err);
    }
    return JSON.parse(JSON.stringify(defaultData));
  }

  public saveSync() {
    this.ensureDataDir();
    try {
      fs.writeFileSync(DB_FILE, JSON.stringify(this.data, null, 2), 'utf-8');
      try {
        this.lastMtime = fs.statSync(DB_FILE).mtimeMs;
      } catch { }
    } catch (err) {
      console.error('Error saving database to file:', err);
    }
  }

  public save() {
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }
    this.saveTimeout = setTimeout(() => {
      this.saveSync();
    }, 100);
  }

  // --- Group CRUD ---
  public getGroups(): VideoGroup[] {
    this.reloadIfChanged();
    return [...(this.data.groups || [])].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  public getGroup(id: string): VideoGroup | undefined {
    this.reloadIfChanged();
    return (this.data.groups || []).find((g) => g.id === id);
  }

  public upsertGroup(group: VideoGroup): VideoGroup {
    this.reloadIfChanged();
    if (!this.data.groups) this.data.groups = [];
    const idx = this.data.groups.findIndex((g) => g.id === group.id);
    if (idx >= 0) {
      this.data.groups[idx] = { ...group, updatedAt: new Date().toISOString() };
    } else {
      this.data.groups.push(group);
    }
    this.save();
    return group;
  }

  public deleteGroup(id: string): boolean {
    this.reloadIfChanged();
    if (!this.data.groups) return false;
    const initialLen = this.data.groups.length;
    this.data.groups = this.data.groups.filter((g) => g.id !== id);
    // Unlink group from videos
    for (const v of this.data.videos) {
      if (v.groupId === id) {
        delete v.groupId;
        delete v.groupName;
      }
    }
    this.save();
    return this.data.groups.length < initialLen;
  }

  // --- Video CRUD ---
  public getVideos(groupId?: string): Video[] {
    this.reloadIfChanged();
    let list = [...this.data.videos];
    if (groupId) {
      list = list.filter((v) => v.groupId === groupId);
    }
    return list.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  public getVideo(id: string): Video | undefined {
    this.reloadIfChanged();
    return this.data.videos.find((v) => v.id === id);
  }

  public upsertVideo(video: Video): Video {
    this.reloadIfChanged();
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
    this.reloadIfChanged();
    if (videoId) {
      return this.data.scenes
        .filter((s) => s.videoId === videoId)
        .sort((a, b) => a.startTime - b.startTime);
    }
    return [...this.data.scenes].sort((a, b) => a.startTime - b.startTime);
  }

  public getScene(id: string): VideoScene | undefined {
    this.reloadIfChanged();
    return this.data.scenes.find((s) => s.id === id);
  }

  public upsertScene(scene: VideoScene): VideoScene {
    this.reloadIfChanged();
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
    this.reloadIfChanged();
    this.data.scenes = this.data.scenes.filter((s) => s.videoId !== videoId);
    this.data.scenes.push(...scenes);
    this.save();
  }

  public deleteScene(id: string): boolean {
    this.reloadIfChanged();
    const initialLen = this.data.scenes.length;
    this.data.scenes = this.data.scenes.filter((s) => s.id !== id);
    this.data.vectors = this.data.vectors.filter((v) => v.sceneId !== id);
    this.save();
    return this.data.scenes.length < initialLen;
  }

  // --- Search CRUD ---
  public findCachedSearch(query: string, groupId?: string, videoId?: string): VideoSearch | undefined {
    this.reloadFromDisk();
    const q = query.trim().toLowerCase();
    const g = groupId || 'all';
    const v = videoId || 'all';
    return (this.data.searches || []).find(
      (s) =>
        s.query.trim().toLowerCase() === q &&
        (s.groupId || 'all') === g &&
        (s.videoId || 'all') === v &&
        s.results &&
        s.results.length > 0
    );
  }

  public recordSearch(search: VideoSearch) {
    this.reloadIfChanged();
    if (!this.data.searches) this.data.searches = [];

    const q = search.query.trim().toLowerCase();
    const g = search.groupId || 'all';
    const v = search.videoId || 'all';

    // If an existing search record has the same query, group scope, and video scope, update it so we don't pollute with duplicates
    const existingIdx = this.data.searches.findIndex(
      (s) =>
        s.query.trim().toLowerCase() === q &&
        (s.groupId || 'all') === g &&
        (s.videoId || 'all') === v
    );

    if (existingIdx >= 0) {
      this.data.searches[existingIdx] = {
        ...this.data.searches[existingIdx],
        ...search,
        id: this.data.searches[existingIdx].id || search.id,
        createdAt: new Date().toISOString(),
      };
      // Move updated entry to the front
      const [updated] = this.data.searches.splice(existingIdx, 1);
      this.data.searches.unshift(updated);
    } else {
      this.data.searches.unshift(search);
    }

    if (this.data.searches.length > 500) {
      this.data.searches = this.data.searches.slice(0, 500);
    }
    this.saveSync();
  }

  public reloadFromDisk(): void {
    this.data = this.loadData();
  }

  public getSearches(videoId?: string): VideoSearch[] {
    this.reloadIfChanged();
    let list = [...(this.data.searches || [])];
    if (videoId) {
      list = list.filter((s) => s.videoId === videoId);
    }
    return list.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  public getSearch(id: string): VideoSearch | undefined {
    this.reloadIfChanged();
    return (this.data.searches || []).find((s) => s.id === id);
  }

  public deleteSearch(id: string): boolean {
    this.reloadIfChanged();
    const initialLen = this.data.searches.length;
    this.data.searches = this.data.searches.filter((s) => s.id !== id);
    this.save();
    return this.data.searches.length < initialLen;
  }

  public clearSearches(): void {
    this.reloadIfChanged();
    this.data.searches = [];
    this.save();
  }


  // --- Clip CRUD ---
  public getClips(videoId?: string): VideoClip[] {
    this.reloadIfChanged();
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
    this.reloadIfChanged();
    return this.data.clips.find((c) => c.id === id);
  }

  public upsertClip(clip: VideoClip): VideoClip {
    this.reloadIfChanged();
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
    this.reloadIfChanged();
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
    this.reloadIfChanged();
    return this.data.jobs.find((j) => j.id === id);
  }

  public upsertJob(job: ProcessingJob): ProcessingJob {
    this.reloadIfChanged();
    const idx = this.data.jobs.findIndex((j) => j.id === job.id);
    if (idx >= 0) {
      this.data.jobs[idx] = { ...job, updatedAt: new Date().toISOString() };
    } else {
      this.data.jobs.push(job);
    }
    this.save();
    return job;
  }

  public deleteJob(id: string): boolean {
    this.reloadIfChanged();
    const initialLen = this.data.jobs.length;
    this.data.jobs = this.data.jobs.filter((j) => j.id !== id);
    this.save();
    return this.data.jobs.length < initialLen;
  }

  // --- Costs CRUD ---
  public recordCost(cost: AiCost) {
    this.reloadIfChanged();
    this.data.costs.push(cost);
    this.save();
  }

  public getCosts(videoId?: string): AiCost[] {
    this.reloadIfChanged();
    if (videoId) {
      return this.data.costs.filter((c) => c.videoId === videoId);
    }
    return this.data.costs;
  }

  // --- Vectors CRUD ---
  public upsertVector(record: VectorRecord) {
    this.reloadIfChanged();
    const idx = this.data.vectors.findIndex((v) => v.id === record.id);
    if (idx >= 0) {
      this.data.vectors[idx] = record;
    } else {
      this.data.vectors.push(record);
    }
    this.save();
  }

  public getVectors(videoId?: string | string[]): VectorRecord[] {
    this.reloadIfChanged();
    if (!videoId) {
      return this.data.vectors;
    }
    if (Array.isArray(videoId)) {
      const set = new Set(videoId);
      return this.data.vectors.filter((v) => set.has(v.videoId));
    }
    return this.data.vectors.filter((v) => v.videoId === videoId);
  }

  public deleteVector(id: string) {
    this.reloadIfChanged();
    this.data.vectors = this.data.vectors.filter((v) => v.id !== id);
    this.save();
  }

  // --- AI Configs CRUD ---
  public getAiConfigs(): AiModelConfig[] {
    this.reloadIfChanged();
    return [...(this.data.configs || [])];
  }

  public getAiConfig(id: string): AiModelConfig | undefined {
    this.reloadIfChanged();
    return (this.data.configs || []).find((c) => c.id === id || c.taskType === id);
  }

  public upsertAiConfig(config: AiModelConfig): AiModelConfig {
    this.reloadIfChanged();
    if (!this.data.configs) this.data.configs = [];
    const now = new Date().toISOString();
    const configWithTime = { ...config, updatedAt: now };
    const idx = this.data.configs.findIndex((c) => c.id === config.id);
    if (idx >= 0) {
      this.data.configs[idx] = configWithTime;
    } else {
      this.data.configs.push(configWithTime);
    }
    this.save();
    return configWithTime;
  }

  public deleteAiConfig(id: string): boolean {
    this.reloadIfChanged();
    if (!this.data.configs) return false;
    const initialLen = this.data.configs.length;
    this.data.configs = this.data.configs.filter((c) => c.id !== id);
    this.save();
    return this.data.configs.length < initialLen;
  }
}

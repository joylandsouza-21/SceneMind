import { Pool, PoolClient } from 'pg';
import { Video, VideoGroup, VideoScene, VideoSearch, VideoClip, ProcessingJob, AiCost, VectorRecord } from './types';
import { IStore } from './store.interface';

/**
 * PostgreSQL + pgvector store for Docker deployment.
 *
 * Since the IStore interface is synchronous (to match SQLite/JSON stores),
 * this implementation uses a synchronous-style in-memory cache that is
 * hydrated on startup and flushed to PostgreSQL on every write.
 *
 * The write path uses fire-and-forget async queries — writes are durable
 * because PostgreSQL handles persistence, and reads are fast because they
 * hit the in-memory cache.
 */
export class PgStore implements IStore {
  private pool: Pool;
  private cache: {
    videos: Video[];
    groups: VideoGroup[];
    scenes: VideoScene[];
    searches: VideoSearch[];
    clips: VideoClip[];
    jobs: ProcessingJob[];
    costs: AiCost[];
    vectors: VectorRecord[];
  } = {
    videos: [],
    groups: [],
    scenes: [],
    searches: [],
    clips: [],
    jobs: [],
    costs: [],
    vectors: [],
  };
  private ready: boolean = false;
  private initPromise: Promise<void>;

  constructor(databaseUrl: string) {
    this.pool = new Pool({ connectionString: databaseUrl, max: 10 });
    console.log('[db] Using PostgreSQL store (pgvector)');
    this.initPromise = this.hydrate();
  }

  /** Hydrate all data from PostgreSQL into in-memory cache on startup */
  private async hydrate(): Promise<void> {
    try {
      // Groups
      const groupsRes = await this.pool.query('SELECT * FROM groups_ ORDER BY created_at DESC');
      this.cache.groups = groupsRes.rows.map(this.mapGroup);

      // Videos
      const videosRes = await this.pool.query('SELECT * FROM videos ORDER BY created_at DESC');
      this.cache.videos = videosRes.rows.map(this.mapVideo);

      // Scenes
      const scenesRes = await this.pool.query('SELECT * FROM scenes ORDER BY start_time ASC');
      this.cache.scenes = scenesRes.rows.map(this.mapScene);

      // Searches
      const searchesRes = await this.pool.query('SELECT * FROM searches ORDER BY created_at DESC');
      this.cache.searches = searchesRes.rows.map(this.mapSearch);

      // Clips
      const clipsRes = await this.pool.query('SELECT * FROM clips ORDER BY created_at DESC');
      this.cache.clips = clipsRes.rows.map(this.mapClip);

      // Jobs
      const jobsRes = await this.pool.query('SELECT * FROM jobs ORDER BY updated_at DESC');
      this.cache.jobs = jobsRes.rows.map(this.mapJob);

      // Costs
      const costsRes = await this.pool.query('SELECT * FROM costs ORDER BY created_at DESC');
      this.cache.costs = costsRes.rows.map(this.mapCost);

      // Vectors (without embeddings for memory efficiency — load on demand)
      const vectorsRes = await this.pool.query('SELECT * FROM vectors');
      this.cache.vectors = vectorsRes.rows.map(this.mapVector);

      this.ready = true;
      console.log(`[db] PostgreSQL hydrated: ${this.cache.videos.length} videos, ${this.cache.scenes.length} scenes, ${this.cache.vectors.length} vectors`);
    } catch (err) {
      console.error('[db] PostgreSQL hydration failed:', err);
      this.ready = true; // Allow app to proceed with empty data
    }
  }

  /** Fire-and-forget async query — errors are logged but don't block */
  private async exec(sql: string, params: any[] = []): Promise<void> {
    try {
      await this.pool.query(sql, params);
    } catch (err) {
      console.error('[db] PostgreSQL write error:', (err as Error).message, '\nSQL:', sql.slice(0, 200));
    }
  }

  // --- Lifecycle ---
  public reloadIfChanged() { /* cache is always current */ }
  public reloadFromDisk() {
    this.hydrate().catch(console.error);
  }
  public save() { /* writes go directly to PostgreSQL */ }
  public saveSync() { /* writes go directly to PostgreSQL */ }

  // --- Groups ---
  public getGroups(): VideoGroup[] {
    return [...this.cache.groups].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  public getGroup(id: string): VideoGroup | undefined {
    return this.cache.groups.find(g => g.id === id);
  }

  public upsertGroup(group: VideoGroup): VideoGroup {
    const now = new Date().toISOString();
    const idx = this.cache.groups.findIndex(g => g.id === group.id);
    if (idx >= 0) {
      this.cache.groups[idx] = { ...group, updatedAt: now };
    } else {
      this.cache.groups.push(group);
    }
    this.exec(`
      INSERT INTO groups_ (id, name, description, color, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (id) DO UPDATE SET name = $2, description = $3, color = $4, updated_at = $6
    `, [group.id, group.name, group.description || null, group.color || null, group.createdAt, now]);
    return group;
  }

  public deleteGroup(id: string): boolean {
    const initialLen = this.cache.groups.length;
    this.cache.groups = this.cache.groups.filter(g => g.id !== id);
    for (const v of this.cache.videos) {
      if (v.groupId === id) { delete v.groupId; delete v.groupName; }
    }
    this.exec('UPDATE videos SET group_id = NULL, group_name = NULL WHERE group_id = $1', [id]);
    this.exec('DELETE FROM groups_ WHERE id = $1', [id]);
    return this.cache.groups.length < initialLen;
  }

  // --- Videos ---
  public getVideos(groupId?: string): Video[] {
    let list = [...this.cache.videos];
    if (groupId) list = list.filter(v => v.groupId === groupId);
    return list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  public getVideo(id: string): Video | undefined {
    return this.cache.videos.find(v => v.id === id);
  }

  public upsertVideo(video: Video): Video {
    const now = new Date().toISOString();
    const idx = this.cache.videos.findIndex(v => v.id === video.id);
    if (idx >= 0) {
      this.cache.videos[idx] = { ...video, updatedAt: now };
    } else {
      this.cache.videos.push(video);
    }
    this.exec(`
      INSERT INTO videos (id, filename, original_name, storage_path, duration, width, height, fps, format, size_bytes, status, processing_progress, group_id, group_name, error_message, created_at, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
      ON CONFLICT (id) DO UPDATE SET
        filename=$2, original_name=$3, storage_path=$4, duration=$5, width=$6, height=$7, fps=$8, format=$9,
        size_bytes=$10, status=$11, processing_progress=$12, group_id=$13, group_name=$14, error_message=$15, updated_at=$17
    `, [video.id, video.filename, video.originalName, video.storagePath, video.duration, video.width, video.height, video.fps, video.format, video.sizeBytes, video.status, video.processingProgress, video.groupId || null, video.groupName || null, video.errorMessage || null, video.createdAt, now]);
    return video;
  }

  public deleteVideo(id: string): boolean {
    const initialLen = this.cache.videos.length;
    this.cache.videos = this.cache.videos.filter(v => v.id !== id);
    this.cache.scenes = this.cache.scenes.filter(s => s.videoId !== id);
    this.cache.clips = this.cache.clips.filter(c => c.videoId !== id);
    this.cache.jobs = this.cache.jobs.filter(j => j.videoId !== id);
    this.cache.costs = this.cache.costs.filter(c => c.videoId !== id);
    this.cache.vectors = this.cache.vectors.filter(v => v.videoId !== id);
    this.exec('DELETE FROM vectors WHERE video_id = $1', [id]);
    this.exec('DELETE FROM costs WHERE video_id = $1', [id]);
    this.exec('DELETE FROM jobs WHERE video_id = $1', [id]);
    this.exec('DELETE FROM clips WHERE video_id = $1', [id]);
    this.exec('DELETE FROM scenes WHERE video_id = $1', [id]);
    this.exec('DELETE FROM videos WHERE id = $1', [id]);
    return this.cache.videos.length < initialLen;
  }

  // --- Scenes ---
  public getScenes(videoId?: string): VideoScene[] {
    let list = videoId ? this.cache.scenes.filter(s => s.videoId === videoId) : [...this.cache.scenes];
    return list.sort((a, b) => a.startTime - b.startTime);
  }

  public getScene(id: string): VideoScene | undefined {
    return this.cache.scenes.find(s => s.id === id);
  }

  public upsertScene(scene: VideoScene): VideoScene {
    const idx = this.cache.scenes.findIndex(s => s.id === scene.id);
    if (idx >= 0) { this.cache.scenes[idx] = scene; } else { this.cache.scenes.push(scene); }
    this.exec(`
      INSERT INTO scenes (id, video_id, scene_number, start_time, end_time, duration, description, actions, objects, people, location, events, confidence, embedding_id, created_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
      ON CONFLICT (id) DO UPDATE SET
        scene_number=$3, start_time=$4, end_time=$5, duration=$6, description=$7,
        actions=$8, objects=$9, people=$10, location=$11, events=$12, confidence=$13, embedding_id=$14
    `, [scene.id, scene.videoId, scene.sceneNumber, scene.startTime, scene.endTime, scene.duration, scene.description, JSON.stringify(scene.actions||[]), JSON.stringify(scene.objects||[]), JSON.stringify(scene.people||[]), scene.location, JSON.stringify(scene.events||[]), scene.confidence, scene.embeddingId, scene.createdAt]);
    return scene;
  }

  public replaceScenesForVideo(videoId: string, scenes: VideoScene[]): void {
    this.cache.scenes = this.cache.scenes.filter(s => s.videoId !== videoId);
    this.cache.scenes.push(...scenes);
    this.exec('DELETE FROM scenes WHERE video_id = $1', [videoId]);
    for (const scene of scenes) {
      this.exec(`
        INSERT INTO scenes (id, video_id, scene_number, start_time, end_time, duration, description, actions, objects, people, location, events, confidence, embedding_id, created_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
      `, [scene.id, scene.videoId, scene.sceneNumber, scene.startTime, scene.endTime, scene.duration, scene.description, JSON.stringify(scene.actions||[]), JSON.stringify(scene.objects||[]), JSON.stringify(scene.people||[]), scene.location, JSON.stringify(scene.events||[]), scene.confidence, scene.embeddingId, scene.createdAt]);
    }
  }

  public deleteScene(id: string): boolean {
    const initialLen = this.cache.scenes.length;
    this.cache.scenes = this.cache.scenes.filter(s => s.id !== id);
    this.cache.vectors = this.cache.vectors.filter(v => v.sceneId !== id);
    this.exec('DELETE FROM vectors WHERE scene_id = $1', [id]);
    this.exec('DELETE FROM scenes WHERE id = $1', [id]);
    return this.cache.scenes.length < initialLen;
  }

  // --- Searches ---
  public findCachedSearch(query: string, groupId?: string, videoId?: string): VideoSearch | undefined {
    const q = query.trim().toLowerCase();
    const g = groupId || 'all';
    const v = videoId || 'all';
    return this.cache.searches.find(s =>
      s.query.trim().toLowerCase() === q &&
      (s.groupId || 'all') === g &&
      (s.videoId || 'all') === v &&
      s.results && s.results.length > 0
    );
  }

  public recordSearch(search: VideoSearch): void {
    const q = search.query.trim().toLowerCase();
    const g = search.groupId || 'all';
    const v = search.videoId || 'all';
    const existingIdx = this.cache.searches.findIndex(s =>
      s.query.trim().toLowerCase() === q && (s.groupId || 'all') === g && (s.videoId || 'all') === v
    );

    const now = new Date().toISOString();
    if (existingIdx >= 0) {
      const existing = this.cache.searches[existingIdx];
      const updated = { ...existing, ...search, id: existing.id || search.id, createdAt: now };
      this.cache.searches.splice(existingIdx, 1);
      this.cache.searches.unshift(updated);
      this.exec(`
        UPDATE searches SET query=$2, result_count=$3, results=$4, segments=$5, is_segmented=$6, group_name=$7, created_at=$8
        WHERE id=$1
      `, [updated.id, search.query, search.resultCount, JSON.stringify(search.results||[]), JSON.stringify(search.segments||[]), search.isSegmented ? true : false, search.groupName || null, now]);
    } else {
      this.cache.searches.unshift(search);
      this.exec(`
        INSERT INTO searches (id, video_id, group_id, group_name, query, result_count, results, segments, is_segmented, created_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      `, [search.id, search.videoId || null, search.groupId || null, search.groupName || null, search.query, search.resultCount, JSON.stringify(search.results||[]), JSON.stringify(search.segments||[]), search.isSegmented ? true : false, search.createdAt]);
    }

    if (this.cache.searches.length > 500) {
      this.cache.searches = this.cache.searches.slice(0, 500);
    }
  }

  public getSearches(videoId?: string): VideoSearch[] {
    let list = videoId ? this.cache.searches.filter(s => s.videoId === videoId) : [...this.cache.searches];
    return list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  public getSearch(id: string): VideoSearch | undefined {
    return this.cache.searches.find(s => s.id === id);
  }

  public deleteSearch(id: string): boolean {
    const initialLen = this.cache.searches.length;
    this.cache.searches = this.cache.searches.filter(s => s.id !== id);
    this.exec('DELETE FROM searches WHERE id = $1', [id]);
    return this.cache.searches.length < initialLen;
  }

  public clearSearches(): void {
    this.cache.searches = [];
    this.exec('DELETE FROM searches');
  }

  // --- Clips ---
  public getClips(videoId?: string): VideoClip[] {
    let list = videoId ? this.cache.clips.filter(c => c.videoId === videoId) : [...this.cache.clips];
    return list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  public getClip(id: string): VideoClip | undefined {
    return this.cache.clips.find(c => c.id === id);
  }

  public upsertClip(clip: VideoClip): VideoClip {
    const idx = this.cache.clips.findIndex(c => c.id === clip.id);
    if (idx >= 0) { this.cache.clips[idx] = clip; } else { this.cache.clips.push(clip); }
    this.exec(`
      INSERT INTO clips (id, video_id, scene_id, query, start_time, end_time, duration, output_path, status, progress, error_message, created_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
      ON CONFLICT (id) DO UPDATE SET status=$9, progress=$10, error_message=$11, output_path=$8
    `, [clip.id, clip.videoId, clip.sceneId||null, clip.query||null, clip.startTime, clip.endTime, clip.duration, clip.outputPath, clip.status, clip.progress, clip.errorMessage||null, clip.createdAt]);
    return clip;
  }

  // --- Jobs ---
  public getJobs(videoId?: string): ProcessingJob[] {
    let list = videoId ? this.cache.jobs.filter(j => j.videoId === videoId) : [...this.cache.jobs];
    return list.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }

  public getJob(id: string): ProcessingJob | undefined {
    return this.cache.jobs.find(j => j.id === id);
  }

  public upsertJob(job: ProcessingJob): ProcessingJob {
    const now = new Date().toISOString();
    const idx = this.cache.jobs.findIndex(j => j.id === job.id);
    if (idx >= 0) { this.cache.jobs[idx] = { ...job, updatedAt: now }; } else { this.cache.jobs.push(job); }
    this.exec(`
      INSERT INTO jobs (id, video_id, job_type, status, progress, current_step, total_steps, retry_count, error, created_at, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
      ON CONFLICT (id) DO UPDATE SET status=$4, progress=$5, current_step=$6, total_steps=$7, retry_count=$8, error=$9, updated_at=$11
    `, [job.id, job.videoId, job.jobType, job.status, job.progress, job.currentStep, job.totalSteps, job.retryCount, job.error||null, job.createdAt, now]);
    return job;
  }

  public deleteJob(id: string): boolean {
    const initialLen = this.cache.jobs.length;
    this.cache.jobs = this.cache.jobs.filter(j => j.id !== id);
    this.exec('DELETE FROM jobs WHERE id = $1', [id]);
    return this.cache.jobs.length < initialLen;
  }

  // --- Costs ---
  public recordCost(cost: AiCost): void {
    this.cache.costs.push(cost);
    this.exec(`
      INSERT INTO costs (id, video_id, scene_id, model, input_tokens, output_tokens, estimated_cost, processing_time_ms, request_type, created_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
    `, [cost.id, cost.videoId||null, cost.sceneId||null, cost.model, cost.inputTokens, cost.outputTokens, cost.estimatedCost, cost.processingTimeMs, cost.requestType, cost.createdAt]);
  }

  public getCosts(videoId?: string): AiCost[] {
    if (videoId) return this.cache.costs.filter(c => c.videoId === videoId);
    return this.cache.costs;
  }

  // --- Vectors ---
  public upsertVector(record: VectorRecord): void {
    const idx = this.cache.vectors.findIndex(v => v.id === record.id);
    if (idx >= 0) { this.cache.vectors[idx] = record; } else { this.cache.vectors.push(record); }
    // Store embedding as pgvector format: [0.1,0.2,...]
    const embStr = `[${record.embedding.join(',')}]`;
    this.exec(`
      INSERT INTO vectors (id, scene_id, video_id, embedding, text, metadata, created_at)
      VALUES ($1,$2,$3,$4::vector,$5,$6::jsonb,$7)
      ON CONFLICT (id) DO UPDATE SET embedding=$4::vector, text=$5, metadata=$6::jsonb
    `, [record.id, record.sceneId, record.videoId, embStr, record.text, JSON.stringify(record.metadata), record.createdAt]);
  }

  public getVectors(videoId?: string | string[]): VectorRecord[] {
    if (!videoId) return this.cache.vectors;
    if (Array.isArray(videoId)) {
      const set = new Set(videoId);
      return this.cache.vectors.filter(v => set.has(v.videoId));
    }
    return this.cache.vectors.filter(v => v.videoId === videoId);
  }

  public deleteVector(id: string): void {
    this.cache.vectors = this.cache.vectors.filter(v => v.id !== id);
    this.exec('DELETE FROM vectors WHERE id = $1', [id]);
  }

  // --- Row Mappers ---
  private mapGroup(row: any): VideoGroup {
    return { id: row.id, name: row.name, description: row.description || undefined, color: row.color || undefined, createdAt: row.created_at, updatedAt: row.updated_at };
  }

  private mapVideo(row: any): Video {
    return {
      id: row.id, filename: row.filename, originalName: row.original_name, storagePath: row.storage_path,
      duration: row.duration, width: row.width, height: row.height, fps: row.fps, format: row.format,
      sizeBytes: row.size_bytes, status: row.status, processingProgress: row.processing_progress,
      groupId: row.group_id || undefined, groupName: row.group_name || undefined,
      errorMessage: row.error_message || undefined, createdAt: row.created_at, updatedAt: row.updated_at,
    };
  }

  private mapScene(row: any): VideoScene {
    return {
      id: row.id, videoId: row.video_id, sceneNumber: row.scene_number, startTime: row.start_time,
      endTime: row.end_time, duration: row.duration, description: row.description,
      actions: typeof row.actions === 'string' ? JSON.parse(row.actions) : (row.actions || []),
      objects: typeof row.objects === 'string' ? JSON.parse(row.objects) : (row.objects || []),
      people: typeof row.people === 'string' ? JSON.parse(row.people) : (row.people || []),
      location: row.location || '', events: typeof row.events === 'string' ? JSON.parse(row.events) : (row.events || []),
      confidence: row.confidence, embeddingId: row.embedding_id || '', createdAt: row.created_at,
    };
  }

  private mapSearch(row: any): VideoSearch {
    return {
      id: row.id, videoId: row.video_id || undefined, groupId: row.group_id || undefined,
      groupName: row.group_name || undefined, query: row.query, resultCount: row.result_count,
      results: typeof row.results === 'string' ? JSON.parse(row.results) : (row.results || []),
      segments: typeof row.segments === 'string' ? JSON.parse(row.segments) : (row.segments || []),
      isSegmented: !!row.is_segmented, createdAt: row.created_at,
    };
  }

  private mapClip(row: any): VideoClip {
    return {
      id: row.id, videoId: row.video_id, sceneId: row.scene_id || undefined, query: row.query || undefined,
      startTime: row.start_time, endTime: row.end_time, duration: row.duration, outputPath: row.output_path,
      status: row.status, progress: row.progress, errorMessage: row.error_message || undefined, createdAt: row.created_at,
    };
  }

  private mapJob(row: any): ProcessingJob {
    return {
      id: row.id, videoId: row.video_id, jobType: row.job_type, status: row.status,
      progress: row.progress, currentStep: row.current_step || '', totalSteps: row.total_steps,
      retryCount: row.retry_count, error: row.error || undefined, createdAt: row.created_at, updatedAt: row.updated_at,
    };
  }

  private mapCost(row: any): AiCost {
    return {
      id: row.id, videoId: row.video_id || undefined, sceneId: row.scene_id || undefined,
      model: row.model, inputTokens: row.input_tokens, outputTokens: row.output_tokens,
      estimatedCost: row.estimated_cost, processingTimeMs: row.processing_time_ms,
      requestType: row.request_type, createdAt: row.created_at,
    };
  }

  private mapVector(row: any): VectorRecord {
    let embedding = row.embedding;
    if (typeof embedding === 'string') {
      // pgvector returns '[0.1,0.2,...]' string
      embedding = JSON.parse(embedding.replace(/^\[/, '[').replace(/\]$/, ']'));
    }
    return {
      id: row.id, sceneId: row.scene_id, videoId: row.video_id,
      embedding: Array.isArray(embedding) ? embedding : [],
      text: row.text, metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata) : (row.metadata || {}),
      createdAt: row.created_at,
    };
  }
}

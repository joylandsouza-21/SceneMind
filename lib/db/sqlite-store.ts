import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { Video, VideoGroup, VideoScene, VideoSearch, VideoClip, ProcessingJob, AiCost, VectorRecord, AiModelConfig } from './types';
import { IStore } from './store.interface';

const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(process.cwd(), 'data'));
const DB_PATH = path.join(DATA_DIR, 'scenemind.db');

/**
 * SQLite-backed store for local development.
 * Uses better-sqlite3 (synchronous) so the interface matches exactly.
 */
export class SqliteStore implements IStore {
  private db: Database.Database;

  constructor() {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    this.db = new Database(DB_PATH);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.initSchema();
    console.log('[db] Using SQLite store:', DB_PATH);
  }

  private initSchema() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS groups_ (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        color TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS videos (
        id TEXT PRIMARY KEY,
        filename TEXT NOT NULL,
        original_name TEXT NOT NULL,
        storage_path TEXT NOT NULL,
        duration REAL NOT NULL DEFAULT 0,
        width INTEGER DEFAULT 1920,
        height INTEGER DEFAULT 1080,
        fps REAL DEFAULT 30,
        format TEXT DEFAULT 'mp4',
        size_bytes INTEGER DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'pending',
        processing_progress INTEGER DEFAULT 0,
        group_id TEXT,
        group_name TEXT,
        error_message TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS scenes (
        id TEXT PRIMARY KEY,
        video_id TEXT NOT NULL,
        scene_number INTEGER NOT NULL,
        start_time REAL NOT NULL,
        end_time REAL NOT NULL,
        duration REAL NOT NULL,
        description TEXT NOT NULL,
        actions TEXT DEFAULT '[]',
        objects TEXT DEFAULT '[]',
        people TEXT DEFAULT '[]',
        location TEXT DEFAULT '',
        events TEXT DEFAULT '[]',
        confidence REAL DEFAULT 1.0,
        embedding_id TEXT DEFAULT '',
        created_at TEXT NOT NULL,
        FOREIGN KEY (video_id) REFERENCES videos(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_scenes_video ON scenes(video_id);

      CREATE TABLE IF NOT EXISTS searches (
        id TEXT PRIMARY KEY,
        video_id TEXT,
        group_id TEXT,
        group_name TEXT,
        query TEXT NOT NULL,
        result_count INTEGER DEFAULT 0,
        results TEXT DEFAULT '[]',
        segments TEXT DEFAULT '[]',
        is_segmented INTEGER DEFAULT 0,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_searches_created ON searches(created_at DESC);

      CREATE TABLE IF NOT EXISTS clips (
        id TEXT PRIMARY KEY,
        video_id TEXT NOT NULL,
        scene_id TEXT,
        query TEXT,
        start_time REAL NOT NULL,
        end_time REAL NOT NULL,
        duration REAL NOT NULL,
        output_path TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        progress INTEGER DEFAULT 0,
        error_message TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY (video_id) REFERENCES videos(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_clips_video ON clips(video_id);

      CREATE TABLE IF NOT EXISTS jobs (
        id TEXT PRIMARY KEY,
        video_id TEXT NOT NULL,
        job_type TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        progress INTEGER DEFAULT 0,
        current_step TEXT DEFAULT '',
        total_steps INTEGER DEFAULT 0,
        retry_count INTEGER DEFAULT 0,
        error TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS costs (
        id TEXT PRIMARY KEY,
        video_id TEXT,
        scene_id TEXT,
        model TEXT NOT NULL,
        input_tokens INTEGER DEFAULT 0,
        output_tokens INTEGER DEFAULT 0,
        estimated_cost REAL DEFAULT 0,
        processing_time_ms INTEGER DEFAULT 0,
        request_type TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS vectors (
        id TEXT PRIMARY KEY,
        scene_id TEXT NOT NULL,
        video_id TEXT NOT NULL,
        embedding TEXT NOT NULL,
        text TEXT NOT NULL,
        metadata TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_vectors_video ON vectors(video_id);
      CREATE INDEX IF NOT EXISTS idx_vectors_scene ON vectors(scene_id);

      CREATE TABLE IF NOT EXISTS ai_configs (
        id TEXT PRIMARY KEY,
        task_type TEXT NOT NULL,
        provider TEXT NOT NULL,
        model_name TEXT NOT NULL,
        api_key TEXT,
        base_url TEXT,
        dimensions INTEGER DEFAULT 768,
        temperature REAL DEFAULT 0.2,
        max_tokens INTEGER,
        is_active INTEGER DEFAULT 1,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_ai_configs_task ON ai_configs(task_type);
    `);
  }

  // --- Lifecycle (no-ops for SQLite, kept for interface compat) ---
  public reloadIfChanged() {}
  public reloadFromDisk() {}
  public save() {}
  public saveSync() {}

  // --- Groups ---
  public getGroups(): VideoGroup[] {
    return this.db.prepare('SELECT * FROM groups_ ORDER BY created_at DESC').all().map(this.mapGroup);
  }

  public getGroup(id: string): VideoGroup | undefined {
    const row = this.db.prepare('SELECT * FROM groups_ WHERE id = ?').get(id) as any;
    return row ? this.mapGroup(row) : undefined;
  }

  public upsertGroup(group: VideoGroup): VideoGroup {
    const now = new Date().toISOString();
    this.db.prepare(`
      INSERT INTO groups_ (id, name, description, color, created_at, updated_at)
      VALUES (@id, @name, @description, @color, @createdAt, @updatedAt)
      ON CONFLICT(id) DO UPDATE SET
        name = @name, description = @description, color = @color, updated_at = @updatedAt
    `).run({ ...group, description: group.description || null, color: group.color || null, updatedAt: now });
    return group;
  }

  public deleteGroup(id: string): boolean {
    // Unlink videos from this group
    this.db.prepare('UPDATE videos SET group_id = NULL, group_name = NULL WHERE group_id = ?').run(id);
    const result = this.db.prepare('DELETE FROM groups_ WHERE id = ?').run(id);
    return result.changes > 0;
  }

  // --- Videos ---
  public getVideos(groupId?: string): Video[] {
    if (groupId) {
      return this.db.prepare('SELECT * FROM videos WHERE group_id = ? ORDER BY created_at DESC').all(groupId).map(this.mapVideo);
    }
    return this.db.prepare('SELECT * FROM videos ORDER BY created_at DESC').all().map(this.mapVideo);
  }

  public getVideo(id: string): Video | undefined {
    const row = this.db.prepare('SELECT * FROM videos WHERE id = ?').get(id) as any;
    return row ? this.mapVideo(row) : undefined;
  }

  public upsertVideo(video: Video): Video {
    const now = new Date().toISOString();
    this.db.prepare(`
      INSERT INTO videos (id, filename, original_name, storage_path, duration, width, height, fps, format, size_bytes, status, processing_progress, group_id, group_name, error_message, created_at, updated_at)
      VALUES (@id, @filename, @originalName, @storagePath, @duration, @width, @height, @fps, @format, @sizeBytes, @status, @processingProgress, @groupId, @groupName, @errorMessage, @createdAt, @updatedAt)
      ON CONFLICT(id) DO UPDATE SET
        filename = @filename, original_name = @originalName, storage_path = @storagePath,
        duration = @duration, width = @width, height = @height, fps = @fps, format = @format,
        size_bytes = @sizeBytes, status = @status, processing_progress = @processingProgress,
        group_id = @groupId, group_name = @groupName, error_message = @errorMessage, updated_at = @updatedAt
    `).run({
      ...video,
      groupId: video.groupId || null,
      groupName: video.groupName || null,
      errorMessage: video.errorMessage || null,
      updatedAt: now,
    });
    return video;
  }

  public deleteVideo(id: string): boolean {
    // CASCADE handles scenes, clips, jobs; manually delete costs & vectors
    this.db.prepare('DELETE FROM costs WHERE video_id = ?').run(id);
    this.db.prepare('DELETE FROM vectors WHERE video_id = ?').run(id);
    this.db.prepare('DELETE FROM jobs WHERE video_id = ?').run(id);
    this.db.prepare('DELETE FROM clips WHERE video_id = ?').run(id);
    this.db.prepare('DELETE FROM scenes WHERE video_id = ?').run(id);
    const result = this.db.prepare('DELETE FROM videos WHERE id = ?').run(id);
    return result.changes > 0;
  }

  // --- Scenes ---
  public getScenes(videoId?: string): VideoScene[] {
    if (videoId) {
      return this.db.prepare('SELECT * FROM scenes WHERE video_id = ? ORDER BY start_time ASC').all(videoId).map(this.mapScene);
    }
    return this.db.prepare('SELECT * FROM scenes ORDER BY start_time ASC').all().map(this.mapScene);
  }

  public getScene(id: string): VideoScene | undefined {
    const row = this.db.prepare('SELECT * FROM scenes WHERE id = ?').get(id) as any;
    return row ? this.mapScene(row) : undefined;
  }

  public upsertScene(scene: VideoScene): VideoScene {
    this.db.prepare(`
      INSERT INTO scenes (id, video_id, scene_number, start_time, end_time, duration, description, actions, objects, people, location, events, confidence, embedding_id, created_at)
      VALUES (@id, @videoId, @sceneNumber, @startTime, @endTime, @duration, @description, @actions, @objects, @people, @location, @events, @confidence, @embeddingId, @createdAt)
      ON CONFLICT(id) DO UPDATE SET
        scene_number = @sceneNumber, start_time = @startTime, end_time = @endTime, duration = @duration,
        description = @description, actions = @actions, objects = @objects, people = @people,
        location = @location, events = @events, confidence = @confidence, embedding_id = @embeddingId
    `).run({
      ...scene,
      actions: JSON.stringify(scene.actions || []),
      objects: JSON.stringify(scene.objects || []),
      people: JSON.stringify(scene.people || []),
      events: JSON.stringify(scene.events || []),
    });
    return scene;
  }

  public replaceScenesForVideo(videoId: string, scenes: VideoScene[]): void {
    const txn = this.db.transaction(() => {
      this.db.prepare('DELETE FROM scenes WHERE video_id = ?').run(videoId);
      const insert = this.db.prepare(`
        INSERT INTO scenes (id, video_id, scene_number, start_time, end_time, duration, description, actions, objects, people, location, events, confidence, embedding_id, created_at)
        VALUES (@id, @videoId, @sceneNumber, @startTime, @endTime, @duration, @description, @actions, @objects, @people, @location, @events, @confidence, @embeddingId, @createdAt)
      `);
      for (const scene of scenes) {
        insert.run({
          ...scene,
          actions: JSON.stringify(scene.actions || []),
          objects: JSON.stringify(scene.objects || []),
          people: JSON.stringify(scene.people || []),
          events: JSON.stringify(scene.events || []),
        });
      }
    });
    txn();
  }

  public deleteScene(id: string): boolean {
    this.db.prepare('DELETE FROM vectors WHERE scene_id = ?').run(id);
    const result = this.db.prepare('DELETE FROM scenes WHERE id = ?').run(id);
    return result.changes > 0;
  }

  // --- Searches ---
  public findCachedSearch(query: string, groupId?: string, videoId?: string): VideoSearch | undefined {
    const q = query.trim().toLowerCase();
    const g = groupId || null;
    const v = videoId || null;
    const rows = this.db.prepare(`
      SELECT * FROM searches WHERE LOWER(TRIM(query)) = ? AND
        (CASE WHEN ? IS NULL THEN group_id IS NULL ELSE group_id = ? END) AND
        (CASE WHEN ? IS NULL THEN video_id IS NULL ELSE video_id = ? END) AND
        result_count > 0
      ORDER BY created_at DESC LIMIT 1
    `).all(q, g, g, v, v) as any[];
    return rows.length > 0 ? this.mapSearch(rows[0]) : undefined;
  }

  public recordSearch(search: VideoSearch): void {
    const q = search.query.trim().toLowerCase();
    const g = search.groupId || null;
    const v = search.videoId || null;

    // Check for existing with same query+scope
    const existing = this.db.prepare(`
      SELECT id FROM searches WHERE LOWER(TRIM(query)) = ? AND
        (CASE WHEN ? IS NULL THEN group_id IS NULL ELSE group_id = ? END) AND
        (CASE WHEN ? IS NULL THEN video_id IS NULL ELSE video_id = ? END)
      LIMIT 1
    `).get(q, g, g, v, v) as any;

    if (existing) {
      this.db.prepare(`
        UPDATE searches SET query = @query, result_count = @resultCount, results = @results,
          segments = @segments, is_segmented = @isSegmented, group_name = @groupName, created_at = @createdAt
        WHERE id = @existingId
      `).run({
        existingId: existing.id,
        query: search.query,
        resultCount: search.resultCount,
        results: JSON.stringify(search.results || []),
        segments: JSON.stringify(search.segments || []),
        isSegmented: search.isSegmented ? 1 : 0,
        groupName: search.groupName || null,
        createdAt: new Date().toISOString(),
      });
    } else {
      this.db.prepare(`
        INSERT INTO searches (id, video_id, group_id, group_name, query, result_count, results, segments, is_segmented, created_at)
        VALUES (@id, @videoId, @groupId, @groupName, @query, @resultCount, @results, @segments, @isSegmented, @createdAt)
      `).run({
        ...search,
        videoId: search.videoId || null,
        groupId: search.groupId || null,
        groupName: search.groupName || null,
        results: JSON.stringify(search.results || []),
        segments: JSON.stringify(search.segments || []),
        isSegmented: search.isSegmented ? 1 : 0,
      });
    }

    // Cap at 500 entries
    this.db.prepare(`
      DELETE FROM searches WHERE id NOT IN (SELECT id FROM searches ORDER BY created_at DESC LIMIT 500)
    `).run();
  }

  public getSearches(videoId?: string): VideoSearch[] {
    if (videoId) {
      return this.db.prepare('SELECT * FROM searches WHERE video_id = ? ORDER BY created_at DESC').all(videoId).map(this.mapSearch);
    }
    return this.db.prepare('SELECT * FROM searches ORDER BY created_at DESC').all().map(this.mapSearch);
  }

  public getSearch(id: string): VideoSearch | undefined {
    const row = this.db.prepare('SELECT * FROM searches WHERE id = ?').get(id) as any;
    return row ? this.mapSearch(row) : undefined;
  }

  public deleteSearch(id: string): boolean {
    return this.db.prepare('DELETE FROM searches WHERE id = ?').run(id).changes > 0;
  }

  public clearSearches(): void {
    this.db.prepare('DELETE FROM searches').run();
  }

  // --- Clips ---
  public getClips(videoId?: string): VideoClip[] {
    if (videoId) {
      return this.db.prepare('SELECT * FROM clips WHERE video_id = ? ORDER BY created_at DESC').all(videoId).map(this.mapClip);
    }
    return this.db.prepare('SELECT * FROM clips ORDER BY created_at DESC').all().map(this.mapClip);
  }

  public getClip(id: string): VideoClip | undefined {
    const row = this.db.prepare('SELECT * FROM clips WHERE id = ?').get(id) as any;
    return row ? this.mapClip(row) : undefined;
  }

  public upsertClip(clip: VideoClip): VideoClip {
    this.db.prepare(`
      INSERT INTO clips (id, video_id, scene_id, query, start_time, end_time, duration, output_path, status, progress, error_message, created_at)
      VALUES (@id, @videoId, @sceneId, @query, @startTime, @endTime, @duration, @outputPath, @status, @progress, @errorMessage, @createdAt)
      ON CONFLICT(id) DO UPDATE SET
        status = @status, progress = @progress, error_message = @errorMessage, output_path = @outputPath
    `).run({
      ...clip,
      sceneId: clip.sceneId || null,
      query: clip.query || null,
      errorMessage: clip.errorMessage || null,
    });
    return clip;
  }

  // --- Jobs ---
  public getJobs(videoId?: string): ProcessingJob[] {
    if (videoId) {
      return this.db.prepare('SELECT * FROM jobs WHERE video_id = ? ORDER BY updated_at DESC').all(videoId).map(this.mapJob);
    }
    return this.db.prepare('SELECT * FROM jobs ORDER BY updated_at DESC').all().map(this.mapJob);
  }

  public getJob(id: string): ProcessingJob | undefined {
    const row = this.db.prepare('SELECT * FROM jobs WHERE id = ?').get(id) as any;
    return row ? this.mapJob(row) : undefined;
  }

  public upsertJob(job: ProcessingJob): ProcessingJob {
    const now = new Date().toISOString();
    this.db.prepare(`
      INSERT INTO jobs (id, video_id, job_type, status, progress, current_step, total_steps, retry_count, error, created_at, updated_at)
      VALUES (@id, @videoId, @jobType, @status, @progress, @currentStep, @totalSteps, @retryCount, @error, @createdAt, @updatedAt)
      ON CONFLICT(id) DO UPDATE SET
        status = @status, progress = @progress, current_step = @currentStep, total_steps = @totalSteps,
        retry_count = @retryCount, error = @error, updated_at = @updatedAt
    `).run({
      ...job,
      error: job.error || null,
      updatedAt: now,
    });
    return job;
  }

  public deleteJob(id: string): boolean {
    return this.db.prepare('DELETE FROM jobs WHERE id = ?').run(id).changes > 0;
  }

  // --- Costs ---
  public recordCost(cost: AiCost): void {
    this.db.prepare(`
      INSERT INTO costs (id, video_id, scene_id, model, input_tokens, output_tokens, estimated_cost, processing_time_ms, request_type, created_at)
      VALUES (@id, @videoId, @sceneId, @model, @inputTokens, @outputTokens, @estimatedCost, @processingTimeMs, @requestType, @createdAt)
    `).run({
      ...cost,
      videoId: cost.videoId || null,
      sceneId: cost.sceneId || null,
    });
  }

  public getCosts(videoId?: string): AiCost[] {
    if (videoId) {
      return this.db.prepare('SELECT * FROM costs WHERE video_id = ?').all(videoId).map(this.mapCost);
    }
    return this.db.prepare('SELECT * FROM costs').all().map(this.mapCost);
  }

  // --- Vectors ---
  public upsertVector(record: VectorRecord): void {
    this.db.prepare(`
      INSERT INTO vectors (id, scene_id, video_id, embedding, text, metadata, created_at)
      VALUES (@id, @sceneId, @videoId, @embedding, @text, @metadata, @createdAt)
      ON CONFLICT(id) DO UPDATE SET
        embedding = @embedding, text = @text, metadata = @metadata
    `).run({
      ...record,
      embedding: JSON.stringify(record.embedding),
      metadata: JSON.stringify(record.metadata),
    });
  }

  public getVectors(videoId?: string | string[]): VectorRecord[] {
    if (!videoId) {
      return this.db.prepare('SELECT * FROM vectors').all().map(this.mapVector);
    }
    if (Array.isArray(videoId)) {
      if (videoId.length === 0) return [];
      const placeholders = videoId.map(() => '?').join(',');
      return this.db.prepare(`SELECT * FROM vectors WHERE video_id IN (${placeholders})`).all(...videoId).map(this.mapVector);
    }
    return this.db.prepare('SELECT * FROM vectors WHERE video_id = ?').all(videoId).map(this.mapVector);
  }

  public deleteVector(id: string): void {
    this.db.prepare('DELETE FROM vectors WHERE id = ?').run(id);
  }

  // --- AI Model & API Configs ---
  public getAiConfigs(): AiModelConfig[] {
    return this.db.prepare('SELECT * FROM ai_configs ORDER BY updated_at DESC').all().map(this.mapConfig);
  }

  public getAiConfig(id: string): AiModelConfig | undefined {
    const row = this.db.prepare('SELECT * FROM ai_configs WHERE id = ? OR task_type = ?').get(id, id);
    return row ? this.mapConfig(row) : undefined;
  }

  public upsertAiConfig(config: AiModelConfig): AiModelConfig {
    const now = new Date().toISOString();
    const configWithTime = { ...config, updatedAt: now };
    this.db.prepare(`
      INSERT INTO ai_configs (id, task_type, provider, model_name, api_key, base_url, dimensions, temperature, max_tokens, is_active, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        task_type = excluded.task_type,
        provider = excluded.provider,
        model_name = excluded.model_name,
        api_key = excluded.api_key,
        base_url = excluded.base_url,
        dimensions = excluded.dimensions,
        temperature = excluded.temperature,
        max_tokens = excluded.max_tokens,
        is_active = excluded.is_active,
        updated_at = excluded.updated_at
    `).run(
      config.id,
      config.taskType,
      config.provider,
      config.modelName,
      config.apiKey || null,
      config.baseUrl || null,
      config.dimensions || 768,
      config.temperature ?? 0.2,
      config.maxTokens || null,
      config.isActive ? 1 : 0,
      now
    );
    return configWithTime;
  }

  public deleteAiConfig(id: string): boolean {
    const res = this.db.prepare('DELETE FROM ai_configs WHERE id = ?').run(id);
    return res.changes > 0;
  }

  // --- Row Mappers (SQLite snake_case → TypeScript camelCase) ---
  private mapGroup(row: any): VideoGroup {
    return {
      id: row.id,
      name: row.name,
      description: row.description || undefined,
      color: row.color || undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private mapVideo(row: any): Video {
    return {
      id: row.id,
      filename: row.filename,
      originalName: row.original_name,
      storagePath: row.storage_path,
      duration: row.duration,
      width: row.width,
      height: row.height,
      fps: row.fps,
      format: row.format,
      sizeBytes: row.size_bytes,
      status: row.status,
      processingProgress: row.processing_progress,
      groupId: row.group_id || undefined,
      groupName: row.group_name || undefined,
      errorMessage: row.error_message || undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private mapScene(row: any): VideoScene {
    return {
      id: row.id,
      videoId: row.video_id,
      sceneNumber: row.scene_number,
      startTime: row.start_time,
      endTime: row.end_time,
      duration: row.duration,
      description: row.description,
      actions: JSON.parse(row.actions || '[]'),
      objects: JSON.parse(row.objects || '[]'),
      people: JSON.parse(row.people || '[]'),
      location: row.location || '',
      events: JSON.parse(row.events || '[]'),
      confidence: row.confidence,
      embeddingId: row.embedding_id || '',
      createdAt: row.created_at,
    };
  }

  private mapSearch(row: any): VideoSearch {
    return {
      id: row.id,
      videoId: row.video_id || undefined,
      groupId: row.group_id || undefined,
      groupName: row.group_name || undefined,
      query: row.query,
      resultCount: row.result_count,
      results: JSON.parse(row.results || '[]'),
      segments: JSON.parse(row.segments || '[]'),
      isSegmented: !!row.is_segmented,
      createdAt: row.created_at,
    };
  }

  private mapClip(row: any): VideoClip {
    return {
      id: row.id,
      videoId: row.video_id,
      sceneId: row.scene_id || undefined,
      query: row.query || undefined,
      startTime: row.start_time,
      endTime: row.end_time,
      duration: row.duration,
      outputPath: row.output_path,
      status: row.status,
      progress: row.progress,
      errorMessage: row.error_message || undefined,
      createdAt: row.created_at,
    };
  }

  private mapJob(row: any): ProcessingJob {
    return {
      id: row.id,
      videoId: row.video_id,
      jobType: row.job_type,
      status: row.status,
      progress: row.progress,
      currentStep: row.current_step || '',
      totalSteps: row.total_steps,
      retryCount: row.retry_count,
      error: row.error || undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private mapCost(row: any): AiCost {
    return {
      id: row.id,
      videoId: row.video_id || undefined,
      sceneId: row.scene_id || undefined,
      model: row.model,
      inputTokens: row.input_tokens,
      outputTokens: row.output_tokens,
      estimatedCost: row.estimated_cost,
      processingTimeMs: row.processing_time_ms,
      requestType: row.request_type,
      createdAt: row.created_at,
    };
  }

  private mapVector(row: any): VectorRecord {
    return {
      id: row.id,
      sceneId: row.scene_id,
      videoId: row.video_id,
      embedding: JSON.parse(row.embedding || '[]'),
      text: row.text,
      metadata: JSON.parse(row.metadata || '{}'),
      createdAt: row.created_at,
    };
  }

  private mapConfig(row: any): AiModelConfig {
    return {
      id: row.id,
      taskType: row.task_type,
      provider: row.provider,
      modelName: row.model_name,
      apiKey: row.api_key || undefined,
      baseUrl: row.base_url || undefined,
      dimensions: row.dimensions || 768,
      temperature: row.temperature != null ? parseFloat(row.temperature) : 0.2,
      maxTokens: row.max_tokens ? parseInt(row.max_tokens, 10) : undefined,
      isActive: row.is_active === 1 || row.is_active === true,
      updatedAt: row.updated_at,
    };
  }
}

import { Video, VideoGroup, VideoScene, VideoSearch, VideoClip, ProcessingJob, AiCost, VectorRecord } from './types';

/**
 * IStore — Unified database interface.
 *
 * Both JsonStore (local file) and PgStore (PostgreSQL) implement this,
 * so the rest of the app doesn't care which backend is active.
 */
export interface IStore {
  // --- Lifecycle ---
  reloadIfChanged(): void;
  reloadFromDisk(): void;
  save(): void;
  saveSync(): void;

  // --- Groups ---
  getGroups(): VideoGroup[];
  getGroup(id: string): VideoGroup | undefined;
  upsertGroup(group: VideoGroup): VideoGroup;
  deleteGroup(id: string): boolean;

  // --- Videos ---
  getVideos(groupId?: string): Video[];
  getVideo(id: string): Video | undefined;
  upsertVideo(video: Video): Video;
  deleteVideo(id: string): boolean;

  // --- Scenes ---
  getScenes(videoId?: string): VideoScene[];
  getScene(id: string): VideoScene | undefined;
  upsertScene(scene: VideoScene): VideoScene;
  replaceScenesForVideo(videoId: string, scenes: VideoScene[]): void;
  deleteScene(id: string): boolean;

  // --- Searches ---
  findCachedSearch(query: string, groupId?: string, videoId?: string): VideoSearch | undefined;
  recordSearch(search: VideoSearch): void;
  getSearches(videoId?: string): VideoSearch[];
  getSearch(id: string): VideoSearch | undefined;
  deleteSearch(id: string): boolean;
  clearSearches(): void;

  // --- Clips ---
  getClips(videoId?: string): VideoClip[];
  getClip(id: string): VideoClip | undefined;
  upsertClip(clip: VideoClip): VideoClip;

  // --- Jobs ---
  getJobs(videoId?: string): ProcessingJob[];
  getJob(id: string): ProcessingJob | undefined;
  upsertJob(job: ProcessingJob): ProcessingJob;
  deleteJob(id: string): boolean;

  // --- Costs ---
  recordCost(cost: AiCost): void;
  getCosts(videoId?: string): AiCost[];

  // --- Vectors ---
  upsertVector(record: VectorRecord): void;
  getVectors(videoId?: string | string[]): VectorRecord[];
  deleteVector(id: string): void;
}

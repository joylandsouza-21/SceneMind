import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/store';
import { JobType, JobStatus, ProcessingJob, VideoScene, Video } from '../db/types';
import { ffmpegService } from './ffmpeg.service';
import { storageService } from './storage.service';
import { videoAnalysisService } from './video-analysis.service';
import { embeddingService } from './embedding.service';
import { vectorService } from './vector.service';

export interface JobEventPayload {
  jobId: string;
  videoId: string;
  jobType: JobType;
  status: JobStatus;
  progress: number;
  currentStep: string;
  error?: string;
  timestamp: string;
}

class JobQueueService extends EventEmitter {
  private activeJobs: Set<string> = new Set();

  constructor() {
    super();
    this.setMaxListeners(100);
  }

  public createJob(videoId: string, jobType: JobType, totalSteps = 100): ProcessingJob {
    const job: ProcessingJob = {
      id: uuidv4(),
      videoId,
      jobType,
      status: 'pending',
      progress: 0,
      currentStep: 'Job queued',
      totalSteps,
      retryCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    db.upsertJob(job);
    this.emitEvent(job);
    return job;
  }

  public updateJob(jobId: string, updates: Partial<ProcessingJob>): ProcessingJob | undefined {
    const job = db.getJob(jobId);
    if (!job) return undefined;

    const updated = {
      ...job,
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    db.upsertJob(updated);
    this.emitEvent(updated);
    return updated;
  }

  private emitEvent(job: ProcessingJob) {
    const payload: JobEventPayload = {
      jobId: job.id,
      videoId: job.videoId,
      jobType: job.jobType,
      status: job.status,
      progress: job.progress,
      currentStep: job.currentStep,
      error: job.error,
      timestamp: new Date().toISOString(),
    };
    this.emit('job-progress', payload);
  }

  /**
   * Complete End-to-End Pipeline Execution with Idempotency & Resumption
   */
  public async processVideoPipeline(videoId: string, options?: { forceReindex?: boolean }): Promise<void> {
    if (this.activeJobs.has(videoId)) {
      console.log(`[JOB_QUEUE] Video ${videoId} is already being processed.`);
      return;
    }

    this.activeJobs.add(videoId);
    const video = db.getVideo(videoId);
    if (!video) {
      this.activeJobs.delete(videoId);
      throw new Error(`Video not found: ${videoId}`);
    }

    const job = this.createJob(videoId, 'VIDEO_ANALYSIS', 100);

    try {
      console.log(`[VIDEO_ANALYSIS] Starting pipeline for video: ${video.filename} (${video.id})`);
      video.status = 'processing';
      video.processingProgress = 5;
      db.upsertVideo(video);

      // --- STEP 1: Metadata Extraction (if missing or duration <= 0) ---
      this.updateJob(job.id, { status: 'processing', progress: 10, currentStep: 'Extracting video metadata' });
      const absPath = storageService.getAbsolutePath(video.storagePath);

      if (video.duration <= 0 || !video.width) {
        console.log(`[VIDEO_METADATA] Probing ${absPath}`);
        const meta = await ffmpegService.getMetadata(absPath);
        video.duration = meta.duration;
        video.width = meta.width;
        video.height = meta.height;
        video.fps = meta.fps;
        video.format = meta.format;
        video.sizeBytes = meta.sizeBytes;
        db.upsertVideo(video);
      }

      // --- STEP 2: Scene Segmentation & Multimodal Analysis ---
      this.updateJob(job.id, { progress: 30, currentStep: 'Analyzing visual scenes with Gemini Video AI' });
      console.log(`[SCENE_DETECTION] Analyzing video duration: ${video.duration}s`);

      let scenes = db.getScenes(videoId);
      if (scenes.length === 0 || options?.forceReindex) {
        const analysis = await videoAnalysisService.analyzeVideo(absPath, video.duration, {
          videoId,
          videoTitle: video.filename || video.originalName,
          minDuration: 6,
          maxDuration: 120,
        });

        // Convert raw detected scenes to VideoScene records
        const newScenes: VideoScene[] = analysis.scenes.map((raw, idx) => ({
          id: `scene_${uuidv4()}`,
          videoId,
          sceneNumber: idx + 1,
          startTime: raw.startTime,
          endTime: raw.endTime,
          duration: Math.round((raw.endTime - raw.startTime) * 10) / 10,
          description: raw.description,
          actions: raw.actions,
          objects: raw.objects,
          people: raw.people,
          location: raw.location,
          events: raw.events,
          confidence: raw.confidence,
          embeddingId: '',
          createdAt: new Date().toISOString(),
        }));

        db.replaceScenesForVideo(videoId, newScenes);
        scenes = newScenes;
      }

      this.updateJob(job.id, { progress: 55, currentStep: `Identified ${scenes.length} scenes. Generating embeddings` });

      // --- STEP 3: Idempotent Vector Embedding Generation ---
      const totalScenes = scenes.length;
      for (let i = 0; i < totalScenes; i++) {
        const scene = scenes[i];

        // Idempotency: Skip embedding generation if valid embedding already exists and not forcing
        if (scene.embeddingId && !options?.forceReindex) {
          continue;
        }

        const canonicalText = embeddingService.buildCanonicalText({
          description: scene.description,
          actions: scene.actions,
          objects: scene.objects,
          people: scene.people,
          location: scene.location,
          events: scene.events,
        });

        console.log(`[EMBEDDING] Generating vector for Scene #${scene.sceneNumber} (${scene.startTime}s - ${scene.endTime}s)`);
        const { embedding } = await embeddingService.generateEmbedding(canonicalText, {
          videoId,
          sceneId: scene.id,
        });

        const vectorId = await vectorService.upsert({
          sceneId: scene.id,
          videoId,
          embedding,
          text: canonicalText,
          metadata: {
            startTime: scene.startTime,
            endTime: scene.endTime,
            description: scene.description,
            actions: scene.actions,
            objects: scene.objects,
            people: scene.people,
            location: scene.location,
            confidence: scene.confidence,
          },
        });

        scene.embeddingId = vectorId;
        db.upsertScene(scene);

        const currentPct = 55 + Math.round(((i + 1) / totalScenes) * 35);
        this.updateJob(job.id, {
          progress: currentPct,
          currentStep: `Embedded scene ${i + 1} of ${totalScenes}`,
        });

        video.processingProgress = currentPct;
        db.upsertVideo(video);
      }

      // --- STEP 4: Index Finalization ---
      this.updateJob(job.id, {
        progress: 95,
        currentStep: 'Finalizing vector search index and poster thumbnails',
      });

      // Extract a thumbnail from the first scene if possible
      try {
        const thumbName = `thumb_${video.id}.jpg`;
        const thumbPath = storageService.getAbsolutePath(`thumbnails/${thumbName}`);
        await ffmpegService.extractThumbnail(absPath, Math.min(2, video.duration * 0.1), thumbPath);
      } catch (e) {
        console.warn('Thumbnail generation skipped or failed:', e);
      }

      video.status = 'indexed';
      video.processingProgress = 100;
      video.errorMessage = undefined;
      db.upsertVideo(video);

      this.updateJob(job.id, {
        status: 'completed',
        progress: 100,
        currentStep: 'Indexing complete and ready for semantic search',
      });

      console.log(`[INDEX_FINALIZATION] Completed successfully for video ${video.id}`);
    } catch (err: any) {
      console.error(`[JOB_QUEUE] Pipeline failed for video ${videoId}:`, err);
      video.status = 'failed';
      video.errorMessage = err.message || 'Unknown processing error';
      db.upsertVideo(video);

      this.updateJob(job.id, {
        status: 'failed',
        error: err.message,
        currentStep: `Failed: ${err.message}`,
      });
    } finally {
      this.activeJobs.delete(videoId);
    }
  }

  /**
   * Async Clip Generation Job
   */
  public async processClipJob(clipId: string): Promise<void> {
    const clip = db.getClip(clipId);
    if (!clip) throw new Error(`Clip not found: ${clipId}`);

    const video = db.getVideo(clip.videoId);
    if (!video) throw new Error(`Video not found: ${clip.videoId}`);

    const job = this.createJob(clip.videoId, 'CLIP_GENERATION', 100);
    this.updateJob(job.id, { status: 'processing', progress: 5, currentStep: 'Initiating FFmpeg clip cut' });

    clip.status = 'processing';
    clip.progress = 5;
    db.upsertClip(clip);

    const inputPath = storageService.getAbsolutePath(video.storagePath);
    const outputPath = storageService.getAbsolutePath(clip.outputPath);

    try {
      console.log(`[FFMPEG] Clipping ${inputPath} from ${clip.startTime}s to ${clip.endTime}s -> ${outputPath}`);
      await ffmpegService.createClip(
        inputPath,
        clip.startTime,
        clip.endTime,
        outputPath,
        (progressPct) => {
          clip.progress = progressPct;
          db.upsertClip(clip);
          this.updateJob(job.id, {
            progress: progressPct,
            currentStep: `Trimming video clip: ${progressPct}%`,
          });
        }
      );

      clip.status = 'completed';
      clip.progress = 100;
      clip.duration = Math.round((clip.endTime - clip.startTime) * 100) / 100;
      db.upsertClip(clip);

      this.updateJob(job.id, {
        status: 'completed',
        progress: 100,
        currentStep: 'Clip rendered successfully',
      });
      console.log(`[FFMPEG] Clip ${clipId} generated successfully.`);
    } catch (err: any) {
      console.error(`[FFMPEG] Clip generation failed:`, err);
      clip.status = 'failed';
      clip.errorMessage = err.message;
      db.upsertClip(clip);

      this.updateJob(job.id, {
        status: 'failed',
        error: err.message,
        currentStep: `Clip generation failed: ${err.message}`,
      });
    }
  }
}

// Global Singleton for Next.js hot-reloading preservation
const globalForQueue = globalThis as unknown as { jobQueueInstance: JobQueueService };
export const jobQueueService = globalForQueue.jobQueueInstance || new JobQueueService();
if (process.env.NODE_ENV !== 'production') globalForQueue.jobQueueInstance = jobQueueService;

import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db';
import { JobType, JobStatus, ProcessingJob, VideoScene, Video } from '../db/types';
import { ffmpegService } from './ffmpeg.service';
import { storageService } from './storage.service';
import { videoAnalysisService } from './video-analysis.service';
import { embeddingService } from './embedding.service';
import { vectorService } from './vector.service';
import { aiConfigService } from './ai-config.service';

export interface JobEventPayload {
  jobId: string;
  videoId: string;
  jobType: JobType;
  status: JobStatus;
  progress: number;
  currentStep: string;
  error?: string;
  logs?: string[];
  timestamp: string;
}

class JobQueueService extends EventEmitter {
  private activeJobs: Set<string> = new Set();
  private cancelledVideoIds: Set<string> = new Set();

  constructor() {
    super();
    this.setMaxListeners(100);
  }

  public cancelJob(jobIdOrVideoId: string): boolean {
    let job = db.getJob(jobIdOrVideoId);
    let videoId = job?.videoId;

    if (!job) {
      const videoJobs = db.getJobs(jobIdOrVideoId);
      if (videoJobs.length > 0) {
        job = videoJobs[0];
        videoId = jobIdOrVideoId;
      } else {
        videoId = jobIdOrVideoId;
      }
    }

    if (videoId) {
      this.cancelledVideoIds.add(videoId);
      this.activeJobs.delete(videoId);
    }

    if (job) {
      this.appendJobLog(job.id, '⛔ Processing was cancelled by user.', {
        status: 'cancelled',
        currentStep: 'Processing cancelled by user',
      });
    }

    if (videoId) {
      const video = db.getVideo(videoId);
      if (video && video.status !== 'indexed') {
        video.status = 'cancelled';
        video.errorMessage = 'Processing cancelled by user';
        db.upsertVideo(video);
      }
    }

    return true;
  }

  public isCancelled(videoId: string): boolean {
    return this.cancelledVideoIds.has(videoId);
  }

  public createJob(videoId: string, jobType: JobType, totalSteps = 100): ProcessingJob {
    const timeStr = new Date().toTimeString().split(' ')[0];
    const initialLog = `[${timeStr}] 🚀 Processing pipeline queued for video analysis.`;

    const job: ProcessingJob = {
      id: uuidv4(),
      videoId,
      jobType,
      status: 'pending',
      progress: 0,
      currentStep: 'Job queued',
      totalSteps,
      retryCount: 0,
      logs: [initialLog],
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

  public appendJobLog(jobId: string, message: string, updates?: Partial<ProcessingJob>): ProcessingJob | undefined {
    const job = db.getJob(jobId);
    if (!job) return undefined;

    const timeStr = new Date().toTimeString().split(' ')[0];
    const formattedLog = `[${timeStr}] ${message}`;
    const logs = [...(job.logs || []), formattedLog];

    const updated: ProcessingJob = {
      ...job,
      ...updates,
      logs,
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
      logs: job.logs || [],
      timestamp: new Date().toISOString(),
    };
    this.emit('job-progress', payload);
  }

  /**
   * Complete End-to-End Pipeline Execution with Idempotency & Resumption
   */
  public async processVideoPipeline(videoId: string, options?: { forceReindex?: boolean }): Promise<void> {
    if (this.isCancelled(videoId)) {
      console.log(`[JOB_QUEUE] Video ${videoId} processing was cancelled.`);
      return;
    }

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
      if (this.isCancelled(videoId)) return;

      console.log(`[VIDEO_ANALYSIS] Starting pipeline for video: ${video.filename} (${video.id})`);
      video.status = 'processing';
      video.processingProgress = 5;
      db.upsertVideo(video);

      this.appendJobLog(job.id, `🎬 Initializing processing pipeline for "${video.filename}"...`, {
        status: 'processing',
        progress: 5,
        currentStep: 'Initializing video analysis pipeline',
      });

      const absPath = storageService.getAbsolutePath(video.storagePath);

      // --- STEP 1: Codec Compatibility Check & Automatic Web-Transcoding ---
      this.appendJobLog(job.id, '🔍 [1/6] Inspecting video stream codecs & container compatibility (FFmpeg)...', {
        progress: 8,
        currentStep: 'Inspecting video codecs',
      });

      const codecCheck = await ffmpegService.inspectCodecCompatibility(absPath);

      if (!codecCheck.isWebReady) {
        const transcodeStartTime = Date.now();
        this.appendJobLog(
          job.id,
          `⚠️ [1/6] Incompatible format detected: ${codecCheck.reason}. Converting to universal web format (H.264 8-bit / stereo AAC)...`,
          {
            progress: 10,
            currentStep: 'Converting video to web-compatible H.264',
          }
        );

        const tempWebPath = absPath.replace(/\.[^/.]+$/, '') + `_web_${Date.now()}.mp4`;

        await ffmpegService.transcodeToWebH264(absPath, tempWebPath, (pct, statusMsg) => {
          if (this.isCancelled(videoId)) return;
          const overallPct = 10 + Math.round((pct / 100) * 15);
          const liveMsg = `Converting video (${pct}%): ${statusMsg}`;
          this.updateJob(job.id, {
            progress: overallPct,
            currentStep: liveMsg,
          });
          video.processingProgress = overallPct;
          db.upsertVideo(video);
        });

        if (this.isCancelled(videoId)) return;

        const transcodeElapsedSec = Math.round((Date.now() - transcodeStartTime) / 1000);

        // Replace original file with the transcoded web version
        try {
          const fs = await import('fs');
          if (fs.existsSync(absPath)) fs.unlinkSync(absPath);
          fs.renameSync(tempWebPath, absPath);
          this.appendJobLog(
            job.id,
            `✅ [1/6] Transcode completed in ${transcodeElapsedSec}s! Video is now 100% web-compatible (H.264 8-bit, stereo AAC, faststart streaming enabled).`,
            {
              progress: 25,
              currentStep: 'Transcoding complete',
            }
          );
        } catch (replaceErr: any) {
          console.warn(`[TRANSCODE] Replace notice: ${replaceErr.message}`);
        }
      } else {
        this.appendJobLog(
          job.id,
          `✅ [1/6] Video is already web-ready (${codecCheck.videoCodec.toUpperCase()} 8-bit, ${codecCheck.audioCodec.toUpperCase() || 'AAC'}). Skipping transcode.`,
          {
            progress: 25,
            currentStep: 'Video codec verified',
          }
        );
      }

      if (this.isCancelled(videoId)) return;

      // --- STEP 2: Metadata Extraction & Poster Frame ---
      this.appendJobLog(job.id, '📊 [2/6] Extracting video metadata (resolution, frame rate, exact duration)...', {
        progress: 28,
        currentStep: 'Extracting video metadata',
      });

      const meta = await ffmpegService.getMetadata(absPath);
      video.duration = meta.duration;
      video.width = meta.width;
      video.height = meta.height;
      video.fps = meta.fps;
      video.format = meta.format;
      video.sizeBytes = meta.sizeBytes;
      db.upsertVideo(video);

      this.appendJobLog(
        job.id,
        `📐 [2/6] Video specs: ${meta.width}x${meta.height} @ ${meta.fps} FPS, duration ${Math.round(meta.duration)}s (${(meta.sizeBytes / (1024 * 1024)).toFixed(1)} MB).`,
        { progress: 30 }
      );

      // Generate initial thumbnail
      try {
        const thumbName = `thumb_${video.id}.jpg`;
        const thumbPath = storageService.getAbsolutePath(`thumbnails/${thumbName}`);
        await ffmpegService.extractThumbnail(absPath, Math.min(2, video.duration * 0.1), thumbPath);
        this.appendJobLog(job.id, '🖼️ [2/6] Generated poster thumbnail.', { progress: 32 });
      } catch (e) {
        console.warn('Initial thumbnail skipped:', e);
      }

      if (this.isCancelled(videoId)) return;

      // --- STEP 3: Multimodal Scene Analysis via Gemini Video AI ---
      this.appendJobLog(job.id, '🧠 [3/6] Requesting AI multimodal vision scene breakdown from Gemini...', {
        progress: 35,
        currentStep: 'Analyzing scenes with Gemini AI',
      });

      let scenes = db.getScenes(videoId);
      if (scenes.length === 0 || options?.forceReindex) {
        const analysis = await videoAnalysisService.analyzeVideo(absPath, video.duration, {
          videoId,
          videoTitle: video.filename || video.originalName,
          minDuration: 6,
          maxDuration: 120,
          onProgress: (stepMsg, pct) => {
            if (this.isCancelled(videoId)) return;
            this.appendJobLog(job.id, `🤖 [Gemini AI] ${stepMsg}`, {
              progress: pct || 45,
              currentStep: stepMsg,
            });
            if (pct) {
              video.processingProgress = pct;
              db.upsertVideo(video);
            }
          },
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

        this.appendJobLog(
          job.id,
          `✨ [3/6] Successfully detected and structured ${scenes.length} distinct scenes with timestamps, actions, and character tags.`,
          {
            progress: 60,
            currentStep: `Extracted ${scenes.length} scenes`,
          }
        );
      } else {
        this.appendJobLog(job.id, `⚡ [3/6] Found ${scenes.length} existing scenes in database. Re-using cached breakdown.`, {
          progress: 60,
          currentStep: `Loaded ${scenes.length} scenes`,
        });
      }

      if (this.isCancelled(videoId)) return;

      // --- STEP 4: Vector Embeddings Generation ---
      const totalScenes = scenes.length;
      const embedConfig = aiConfigService.getEffectiveConfig('embedding');
      const embedProviderLabel =
        embedConfig.provider === 'anthropic' ? 'Anthropic Claude'
        : embedConfig.provider === 'voyage' ? 'Voyage AI'
        : embedConfig.provider === 'openai' ? 'OpenAI'
        : embedConfig.provider === 'cohere' ? 'Cohere'
        : embedConfig.provider === 'mistral' ? 'Mistral'
        : embedConfig.provider === 'ollama' ? 'Ollama'
        : 'Google Gemini';

      this.appendJobLog(
        job.id,
        `⚡ [4/6] Generating text & visual vector embeddings for ${totalScenes} scenes using ${embedProviderLabel} (${embedConfig.modelName || embedConfig.provider})...`,
        {
          progress: 65,
          currentStep: `Generating vector embeddings via ${embedProviderLabel} (0/${totalScenes})`,
        }
      );

      for (let i = 0; i < totalScenes; i++) {
        if (this.isCancelled(videoId)) {
          console.log(`[JOB_QUEUE] Pipeline cancelled during embedding for video ${videoId}`);
          return;
        }

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

        const { embedding } = await embeddingService.generateEmbedding(canonicalText, {
          videoId,
          sceneId: scene.id,
        });

        if (this.isCancelled(videoId)) return;

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

        const currentPct = 65 + Math.round(((i + 1) / totalScenes) * 30);

        if ((i + 1) % 5 === 0 || i === 0 || i === totalScenes - 1) {
          this.appendJobLog(
            job.id,
            `📌 [5/6] Indexed vector for Scene #${scene.sceneNumber} [${scene.startTime}s - ${scene.endTime}s]: "${scene.description.slice(0, 50)}..."`,
            {
              progress: currentPct,
              currentStep: `Embedded scene ${i + 1} of ${totalScenes}`,
            }
          );
        } else {
          this.updateJob(job.id, {
            progress: currentPct,
            currentStep: `Embedded scene ${i + 1} of ${totalScenes}`,
          });
        }

        video.processingProgress = currentPct;
        db.upsertVideo(video);
      }

      if (this.isCancelled(videoId)) return;

      // --- STEP 5: Index Finalization ---
      this.appendJobLog(job.id, '🎯 [6/6] Finalizing vector search indexes and search capabilities...', {
        progress: 98,
        currentStep: 'Finalizing index',
      });

      video.status = 'indexed';
      video.processingProgress = 100;
      video.errorMessage = undefined;
      db.upsertVideo(video);

      this.appendJobLog(
        job.id,
        `🎉 Pipeline complete! ${scenes.length} scenes indexed and fully ready for multi-modal semantic search & clipping.`,
        {
          status: 'completed',
          progress: 100,
          currentStep: 'Indexing complete and ready for search',
        }
      );

      console.log(`[INDEX_FINALIZATION] Completed successfully for video ${video.id}`);
    } catch (err: any) {
      if (this.isCancelled(videoId)) {
        console.log(`[JOB_QUEUE] Pipeline aborted for video ${videoId} due to user cancellation.`);
        return;
      }

      console.error(`[JOB_QUEUE] Pipeline failed for video ${videoId}:`, err);
      video.status = 'failed';
      video.errorMessage = err.message || 'Unknown processing error';
      db.upsertVideo(video);

      this.appendJobLog(job.id, `❌ Processing failed: ${err.message}`, {
        status: 'failed',
        error: err.message,
        currentStep: `Failed: ${err.message}`,
      });
    } finally {
      this.activeJobs.delete(videoId);
      this.cancelledVideoIds.delete(videoId);
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

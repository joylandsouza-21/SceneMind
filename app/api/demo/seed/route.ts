import { NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs';
import { db } from '@/lib/db/store';
import { Video } from '@/lib/db/types';
import { storageService } from '@/lib/services/storage.service';
import { ffmpegService } from '@/lib/services/ffmpeg.service';
import { jobQueueService } from '@/lib/services/job-queue.service';

export async function POST() {
  try {
    const filename = `demo_semantic_video_${Date.now()}.mp4`;
    const videosDir = storageService.getVideosDir();
    const fullPath = path.join(videosDir, filename);

    console.log(`[DEMO_SEED] Generating synthetic 60-second multi-scene test video at ${fullPath}`);
    await ffmpegService.generateSyntheticDemoVideo(fullPath);

    const stats = fs.statSync(fullPath);
    const meta = await ffmpegService.getMetadata(fullPath);

    const videoId = `vid_demo_${uuidv4().slice(0, 8)}`;
    const video: Video = {
      id: videoId,
      filename: 'Sample Action & Dialogue Demo Video.mp4',
      originalName: 'Sample Action & Dialogue Demo Video.mp4',
      storagePath: `videos/${filename}`,
      duration: meta.duration || 60,
      width: meta.width || 1280,
      height: meta.height || 720,
      fps: meta.fps || 30,
      format: 'mp4',
      sizeBytes: stats.size,
      status: 'pending',
      processingProgress: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    db.upsertVideo(video);

    // Process pipeline immediately in background
    setTimeout(() => {
      jobQueueService.processVideoPipeline(videoId).catch(console.error);
    }, 50);

    return NextResponse.json({
      success: true,
      message: 'Demo video generated and indexing initiated!',
      video,
    });
  } catch (err: any) {
    console.error('Demo seed error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

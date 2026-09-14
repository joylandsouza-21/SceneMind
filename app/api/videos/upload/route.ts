import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { db } from '@/lib/db/store';
import { Video } from '@/lib/db/types';
import { storageService } from '@/lib/services/storage.service';
import { ffmpegService } from '@/lib/services/ffmpeg.service';
import { jobQueueService } from '@/lib/services/job-queue.service';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No video file provided' }, { status: 400 });
    }

    // Validate video file extension and MIME type
    const originalName = file.name || 'uploaded_video.mp4';
    const ext = originalName.split('.').pop()?.toLowerCase();
    const allowed = ['mp4', 'mkv', 'mov', 'webm', 'avi'];
    if (!ext || !allowed.includes(ext)) {
      return NextResponse.json(
        { error: `Unsupported file format .${ext}. Supported formats: ${allowed.join(', ')}` },
        { status: 400 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Save video to storage
    const { storageKey, absolutePath } = await storageService.saveVideo(originalName, buffer);

    // Extract preliminary metadata via ffprobe
    const metadata = await ffmpegService.getMetadata(absolutePath);

    const videoId = `vid_${uuidv4()}`;
    const video: Video = {
      id: videoId,
      filename: originalName,
      originalName,
      storagePath: storageKey,
      duration: metadata.duration,
      width: metadata.width,
      height: metadata.height,
      fps: metadata.fps,
      format: metadata.format,
      sizeBytes: metadata.sizeBytes,
      status: 'pending',
      processingProgress: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    db.upsertVideo(video);

    // Launch background pipeline asynchronously (do not block the upload response)
    const autoIndex = formData.get('autoIndex') !== 'false';
    if (autoIndex) {
      setTimeout(() => {
        jobQueueService.processVideoPipeline(videoId).catch((err) => {
          console.error(`Background pipeline failed for ${videoId}:`, err);
        });
      }, 50);
    }

    return NextResponse.json({
      success: true,
      video,
      message: 'Video uploaded successfully and queued for indexing.',
    });
  } catch (err: any) {
    console.error('Upload route error:', err);
    return NextResponse.json({ error: err.message || 'Failed to upload video' }, { status: 500 });
  }
}

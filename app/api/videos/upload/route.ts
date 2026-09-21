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

    // Google Gemini File API maximum file size: 2 GB (2048 MB)
    const MAX_FILE_SIZE = 2 * 1024 * 1024 * 1024;
    if (file.size > MAX_FILE_SIZE) {
      const sizeGB = (file.size / (1024 * 1024 * 1024)).toFixed(2);
      return NextResponse.json(
        { error: `File size (${sizeGB} GB) exceeds Google File API limit of 2 GB.` },
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

    // Handle group association
    let groupId = (formData.get('groupId') as string) || undefined;
    let groupName = (formData.get('groupName') as string) || undefined;

    if (groupId) {
      const existingGroup = db.getGroup(groupId);
      if (existingGroup) {
        groupName = existingGroup.name;
      }
    } else if (groupName && groupName.trim()) {
      groupName = groupName.trim();
      const existingGroup = db.getGroups().find((g) => g.name.toLowerCase() === groupName!.toLowerCase());
      if (existingGroup) {
        groupId = existingGroup.id;
        groupName = existingGroup.name;
      } else {
        const newGroup = {
          id: `grp_${uuidv4()}`,
          name: groupName,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        db.upsertGroup(newGroup);
        groupId = newGroup.id;
      }
    }

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
      groupId,
      groupName,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    db.upsertVideo(video);

    const isAsync = formData.get('async') === 'true' || req.nextUrl.searchParams.get('async') === 'true';
    const autoIndex = formData.get('autoIndex') !== 'false';

    if (isAsync) {
      if (autoIndex) {
        // Fire asynchronously in background
        jobQueueService.processVideoPipeline(videoId).catch((err) => {
          console.error(`[ASYNC_UPLOAD_PIPELINE] Error processing video ${videoId}:`, err);
        });
      }
      return NextResponse.json({
        success: true,
        video,
        message: 'Video uploaded and processing queued.',
      });
    }

    // Run the indexing pipeline synchronously so we can roll back on failure
    if (autoIndex) {
      try {
        await jobQueueService.processVideoPipeline(videoId);

        // Confirm it finished successfully (pipeline catches its own errors internally)
        const finalVideo = db.getVideo(videoId);
        if (finalVideo?.status === 'failed') {
          // Clean up — delete file and DB record
          await storageService.deleteFile(storageKey);
          db.deleteVideo(videoId);
          const errMsg = finalVideo.errorMessage || 'AI analysis failed. Check your Gemini API key or try again later.';
          return NextResponse.json({ error: errMsg }, { status: 500 });
        }
      } catch (pipelineErr: any) {
        // Clean up — delete file and DB record
        await storageService.deleteFile(storageKey).catch(() => {});
        db.deleteVideo(videoId);
        console.error(`[UPLOAD] Pipeline failed for ${videoId}:`, pipelineErr);
        return NextResponse.json(
          { error: pipelineErr.message || 'Video processing failed. Please try again.' },
          { status: 500 }
        );
      }
    }

    const finalVideo = db.getVideo(videoId) || video;
    return NextResponse.json({
      success: true,
      video: finalVideo,
      message: 'Video uploaded and indexed successfully.',
    });
  } catch (err: any) {
    console.error('Upload route error:', err);
    return NextResponse.json({ error: err.message || 'Failed to upload video' }, { status: 500 });
  }
}

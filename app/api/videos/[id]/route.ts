import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { storageService } from '@/lib/services/storage.service';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const video = db.getVideo(params.id);
    if (!video) {
      return NextResponse.json({ error: 'Video not found' }, { status: 404 });
    }

    const scenes = db.getScenes(params.id);
    const clips = db.getClips(params.id);
    const jobs = db.getJobs(params.id);

    const augmentedScenes = scenes.map((s) => ({
      ...s,
      videoStoragePath: video.storagePath,
      videoName: video.filename,
      groupName: video.groupName,
    }));

    return NextResponse.json({
      video: {
        ...video,
        sceneCount: scenes.length,
        clipCount: clips.length,
      },
      scenes: augmentedScenes,
      clips,
      jobs,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

import path from 'path';
import fs from 'fs';
import { jobQueueService } from '@/lib/services/job-queue.service';

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const video = db.getVideo(params.id);

    // 1. Immediately abort active pipeline, kill FFmpeg processes, and delete queue jobs
    jobQueueService.abortAndPurgeVideo(params.id);

    if (!video) {
      return NextResponse.json({ error: 'Video not found' }, { status: 404 });
    }

    // 2. Delete all scene thumbnails from disk
    const scenes = db.getScenes(params.id);
    for (const scene of scenes) {
      try {
        await storageService.deleteFile(`thumbnails/scene_${scene.id}.jpg`);
      } catch {}
    }

    // 3. Delete all clips physical files
    const clips = db.getClips(params.id);
    for (const clip of clips) {
      if (clip.outputPath) {
        try {
          await storageService.deleteFile(clip.outputPath);
        } catch {}
      }
    }

    // 4. Delete physical video file(s)
    try {
      await storageService.deleteFile(video.storagePath);
    } catch (e) {
      console.warn('Physical video file deletion skipped or failed:', e);
    }

    // Also check if an .mp4 transcode exists with a different path
    const mp4Path = video.storagePath.replace(/\.[^/.]+$/, '') + '.mp4';
    if (mp4Path !== video.storagePath) {
      try {
        await storageService.deleteFile(mp4Path);
      } catch {}
    }

    // Clean up poster thumbnail
    try {
      await storageService.deleteFile(`thumbnails/thumb_${video.id}.jpg`);
    } catch {}

    // Clean up any remaining .tmp_* files for this video
    try {
      const absPath = storageService.getAbsolutePath(video.storagePath);
      const videoDir = path.dirname(absPath);
      if (fs.existsSync(videoDir)) {
        const files = fs.readdirSync(videoDir);
        for (const f of files) {
          if (f.includes(video.id) || f.includes('.tmp_')) {
            try {
              fs.unlinkSync(path.join(videoDir, f));
            } catch {}
          }
        }
      }
    } catch {}

    // 5. Delete video record from DB
    db.deleteVideo(params.id);

    return NextResponse.json({ success: true, message: `Video ${params.id} deleted.` });
  } catch (err: any) {
    console.error(`[DELETE_VIDEO] Error deleting video ${params.id}:`, err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

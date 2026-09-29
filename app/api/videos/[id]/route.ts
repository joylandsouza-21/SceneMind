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
import { v4 as uuidv4 } from 'uuid';
import { jobQueueService } from '@/lib/services/job-queue.service';

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const video = db.getVideo(params.id);
    if (!video) {
      return NextResponse.json({ error: 'Video not found' }, { status: 404 });
    }

    const body = await req.json();
    const { groupId, newGroupName } = body;

    if (newGroupName && typeof newGroupName === 'string' && newGroupName.trim()) {
      const trimmed = newGroupName.trim();
      let targetGroup = db.getGroups().find((g) => g.name.toLowerCase() === trimmed.toLowerCase());
      if (!targetGroup) {
        targetGroup = {
          id: `grp_${uuidv4()}`,
          name: trimmed,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        db.upsertGroup(targetGroup);
      }
      video.groupId = targetGroup.id;
      video.groupName = targetGroup.name;
    } else if (groupId === null || groupId === '' || groupId === 'none' || groupId === 'all') {
      // Remove from group: unlinks and moves video to all / no group
      video.groupId = undefined;
      video.groupName = undefined;
    } else if (groupId !== undefined) {
      const existingGroup = db.getGroup(groupId);
      if (existingGroup) {
        video.groupId = existingGroup.id;
        video.groupName = existingGroup.name;
      } else {
        video.groupId = undefined;
        video.groupName = undefined;
      }
    }

    video.updatedAt = new Date().toISOString();
    db.upsertVideo(video);

    return NextResponse.json({
      success: true,
      video,
      message: video.groupId ? `Video assigned to "${video.groupName}"` : 'Video removed from group (moved to all / no group)',
    });
  } catch (err: any) {
    console.error(`[PATCH_VIDEO] Error updating video ${params.id}:`, err);
    return NextResponse.json({ error: err.message || 'Failed to update video' }, { status: 500 });
  }
}

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

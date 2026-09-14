import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/store';
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

    return NextResponse.json({
      video: {
        ...video,
        sceneCount: scenes.length,
        clipCount: clips.length,
      },
      scenes,
      clips,
      jobs,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const video = db.getVideo(params.id);
    if (!video) {
      return NextResponse.json({ error: 'Video not found' }, { status: 404 });
    }

    // Attempt to delete physical video file
    try {
      await storageService.deleteFile(video.storagePath);
    } catch (e) {
      console.warn('Physical video file deletion skipped or failed:', e);
    }

    db.deleteVideo(params.id);
    return NextResponse.json({ success: true, message: `Video ${params.id} deleted.` });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

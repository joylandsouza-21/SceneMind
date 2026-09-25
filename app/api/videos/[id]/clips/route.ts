import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { db } from '@/lib/db';
import { VideoClip } from '@/lib/db/types';
import { jobQueueService } from '@/lib/services/job-queue.service';

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { startTime, endTime, sceneId, query } = await req.json();

    if (typeof startTime !== 'number' || typeof endTime !== 'number') {
      return NextResponse.json({ error: 'startTime and endTime must be numbers' }, { status: 400 });
    }

    if (startTime >= endTime) {
      return NextResponse.json({ error: 'startTime must be strictly less than endTime' }, { status: 400 });
    }

    const video = db.getVideo(params.id);
    if (!video) {
      return NextResponse.json({ error: 'Video not found' }, { status: 404 });
    }

    const clipId = `clip_${uuidv4()}`;
    const outputFilename = `clip_${clipId}_${Math.round(startTime)}s_${Math.round(endTime)}s.mp4`;
    const outputPath = `clips/${outputFilename}`;

    const clip: VideoClip = {
      id: clipId,
      videoId: params.id,
      sceneId,
      query,
      startTime: Math.max(0, startTime),
      endTime: Math.min(video.duration || 999999, endTime),
      duration: Math.round((endTime - startTime) * 10) / 10,
      outputPath,
      status: 'pending',
      progress: 0,
      createdAt: new Date().toISOString(),
    };

    db.upsertClip(clip);

    // Launch FFmpeg clipping asynchronously in the background
    setTimeout(() => {
      jobQueueService.processClipJob(clipId).catch(console.error);
    }, 50);

    return NextResponse.json({
      success: true,
      clip,
      message: 'Clip generation queued successfully.',
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const clips = db.getClips(params.id);
    return NextResponse.json({ clips });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

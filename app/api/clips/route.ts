import { NextResponse } from 'next/server';
import { db } from '@/lib/db/store';

export async function GET() {
  try {
    const clips = db.getClips();
    const videos = db.getVideos();
    const videoMap = new Map(videos.map((v) => [v.id, v]));

    const enriched = clips.map((c) => ({
      ...c,
      videoName: videoMap.get(c.videoId)?.filename || 'Unknown Video',
      mediaUrl: `/api/media/${c.outputPath}`,
    }));

    return NextResponse.json({ clips: enriched });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

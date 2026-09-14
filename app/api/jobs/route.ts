import { NextResponse } from 'next/server';
import { db } from '@/lib/db/store';

export async function GET() {
  try {
    const jobs = db.getJobs();
    const videos = db.getVideos();
    const videoMap = new Map(videos.map((v) => [v.id, v]));

    const enriched = jobs.map((j) => ({
      ...j,
      videoName: videoMap.get(j.videoId)?.filename || 'Unknown Video',
    }));

    return NextResponse.json({ jobs: enriched });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

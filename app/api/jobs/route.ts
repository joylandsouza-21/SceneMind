import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { jobQueueService } from '@/lib/services/job-queue.service';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

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

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    if (body.action === 'cancel-all' || body.cancelAll || !body.action) {
      jobQueueService.cancelAllJobs();
      return NextResponse.json({
        success: true,
        message: 'All active video indexing and pipelines cancelled successfully.',
      });
    }
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

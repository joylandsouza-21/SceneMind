import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { jobQueueService } from '@/lib/services/job-queue.service';

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const video = db.getVideo(params.id);
    if (!video) {
      return NextResponse.json({ error: 'Video not found' }, { status: 404 });
    }

    setTimeout(() => {
      jobQueueService.processVideoPipeline(params.id, { forceReindex: true }).catch(console.error);
    }, 50);

    return NextResponse.json({
      success: true,
      message: `Force re-indexing started for video ${params.id}`,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

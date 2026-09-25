import { NextRequest, NextResponse } from 'next/server';
import { jobQueueService } from '@/lib/services/job-queue.service';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const targetId = params.id;
    jobQueueService.cancelJob(targetId);

    const job = db.getJob(targetId) || db.getJobs(targetId)[0];
    const video = db.getVideo(targetId) || (job ? db.getVideo(job.videoId) : undefined);

    return NextResponse.json({
      success: true,
      message: 'Processing cancelled',
      job,
      video,
    });
  } catch (err: any) {
    console.error('Cancel job error:', err);
    return NextResponse.json({ error: err.message || 'Failed to cancel job' }, { status: 500 });
  }
}

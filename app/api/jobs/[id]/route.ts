import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/store';
import { jobQueueService } from '@/lib/services/job-queue.service';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const job = db.getJob(params.id);
    if (!job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }
    const video = db.getVideo(job.videoId);
    return NextResponse.json({ job: { ...job, videoName: video?.filename || 'Unknown' } });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const targetId = params.id;
    // Cancel first if it was running
    jobQueueService.cancelJob(targetId);

    const deleted = db.deleteJob(targetId);
    return NextResponse.json({
      success: deleted,
      message: 'Job removed from queue',
    });
  } catch (err: any) {
    console.error('Delete job error:', err);
    return NextResponse.json({ error: err.message || 'Failed to delete job' }, { status: 500 });
  }
}

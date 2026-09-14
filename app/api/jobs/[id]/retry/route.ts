import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/store';
import { jobQueueService } from '@/lib/services/job-queue.service';

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const job = db.getJob(params.id);
    if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 });

    job.status = 'retrying';
    job.retryCount += 1;
    job.error = undefined;
    db.upsertJob(job);

    if (job.jobType === 'CLIP_GENERATION') {
      const clip = db.getClips(job.videoId).find((c) => c.status === 'failed' || c.status === 'pending');
      if (clip) {
        setTimeout(() => jobQueueService.processClipJob(clip.id).catch(console.error), 50);
      }
    } else {
      setTimeout(() => jobQueueService.processVideoPipeline(job.videoId, { forceReindex: false }).catch(console.error), 50);
    }

    return NextResponse.json({
      success: true,
      message: `Job ${params.id} retry initiated.`,
      job,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

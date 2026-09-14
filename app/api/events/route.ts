import { NextRequest } from 'next/server';
import { jobQueueService, JobEventPayload } from '@/lib/services/job-queue.service';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const encoder = new TextEncoder();

  let cleanupListener: (() => void) | null = null;

  const stream = new ReadableStream({
    start(controller) {
      // Send initial keepalive
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'CONNECTED', timestamp: new Date().toISOString() })}\n\n`));

      const onProgress = (payload: JobEventPayload) => {
        try {
          const message = `data: ${JSON.stringify(payload)}\n\n`;
          controller.enqueue(encoder.encode(message));
        } catch (e) {
          // Stream might have closed
        }
      };

      jobQueueService.on('job-progress', onProgress);

      const interval = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: ping\n\n`));
        } catch (e) {
          clearInterval(interval);
        }
      }, 15000);

      cleanupListener = () => {
        jobQueueService.off('job-progress', onProgress);
        clearInterval(interval);
      };
    },
    cancel() {
      if (cleanupListener) cleanupListener();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/store';
import { timestampVerificationService } from '@/lib/services/timestamp-verification.service';

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { query, startTime, endTime, sceneId } = await req.json();

    if (!query || typeof startTime !== 'number' || typeof endTime !== 'number') {
      return NextResponse.json(
        { error: 'query, startTime (number), and endTime (number) are required' },
        { status: 400 }
      );
    }

    const video = db.getVideo(params.id);
    if (!video) {
      return NextResponse.json({ error: 'Video not found' }, { status: 404 });
    }

    const scene = sceneId ? db.getScene(sceneId) : undefined;

    const result = await timestampVerificationService.verifyTimestamps({
      query,
      candidateStart: startTime,
      candidateEnd: endTime,
      sceneDescription: scene?.description,
      videoId: params.id,
      sceneId,
    });

    return NextResponse.json({
      success: true,
      query,
      candidate: { startTime, endTime },
      verified: result,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

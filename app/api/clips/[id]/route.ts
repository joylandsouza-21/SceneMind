import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const clip = db.getClip(params.id);
  if (!clip) return NextResponse.json({ error: 'Clip not found' }, { status: 404 });

  const video = db.getVideo(clip.videoId);

  return NextResponse.json({
    clip: {
      ...clip,
      videoName: video?.filename,
      mediaUrl: `/api/media/${clip.outputPath}`,
    },
  });
}

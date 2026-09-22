import { NextResponse } from 'next/server';
import { db } from '@/lib/db/store';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  try {
    const videos = db.getVideos();
    const scenes = db.getScenes();
    const clips = db.getClips();

    // Enrich videos with scene count and clip count
    const enriched = videos.map((v) => {
      const videoScenes = scenes.filter((s) => s.videoId === v.id);
      const videoClips = clips.filter((c) => c.videoId === v.id);
      return {
        ...v,
        sceneCount: videoScenes.length,
        clipCount: videoClips.length,
      };
    });

    return NextResponse.json({ videos: enriched });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

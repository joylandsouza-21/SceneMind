import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const resolvedParams = await Promise.resolve(params);
    const searchId = resolvedParams?.id;
    if (!searchId) {
      return NextResponse.json({ error: 'Search ID is required' }, { status: 400 });
    }

    const search = db.getSearch(searchId);
    if (!search) {
      return NextResponse.json({ error: 'Search record not found' }, { status: 404 });
    }

    // Hydrate any missing media paths on older search result snapshots safely
    if (search.results && Array.isArray(search.results)) {
      search.results = search.results.map((res: any) => {
        if (res && !res.videoStoragePath && res.videoId) {
          const video = db.getVideo(res.videoId);
          if (video) {
            return {
              ...res,
              videoStoragePath: video.storagePath,
              thumbnailUrl: `/api/media/thumbnails/thumb_${video.id}.jpg`,
            };
          }
        }
        return res;
      });
    }

    return NextResponse.json({ search });
  } catch (err: any) {
    console.error('Error fetching search record:', err);
    return NextResponse.json({ error: err?.message || 'Internal error' }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const resolvedParams = await Promise.resolve(params);
    const searchId = resolvedParams?.id;
    if (!searchId) {
      return NextResponse.json({ error: 'Search ID is required' }, { status: 400 });
    }

    const deleted = db.deleteSearch(searchId);
    if (!deleted) {
      return NextResponse.json({ error: 'Search record not found or already deleted' }, { status: 404 });
    }

    return NextResponse.json({ success: true, message: 'Search history item deleted' });
  } catch (err: any) {
    console.error('Error deleting search record:', err);
    return NextResponse.json({ error: err?.message || 'Internal error' }, { status: 500 });
  }
}

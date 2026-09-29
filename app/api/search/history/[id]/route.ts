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

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const resolvedParams = await Promise.resolve(params);
    const searchId = resolvedParams?.id;
    if (!searchId) {
      return NextResponse.json({ error: 'Search ID is required' }, { status: 400 });
    }

    const body = await req.json();
    const { name, partSavedPrompts } = body;
    let updated = false;

    if (name !== undefined) {
      if (typeof db.updateSearchName === 'function') {
        updated = db.updateSearchName(searchId, name) || updated;
      } else {
        const s = db.getSearch(searchId);
        if (s) {
          s.name = typeof name === 'string' ? (name.trim() || undefined) : undefined;
          db.recordSearch(s);
          updated = true;
        }
      }
    }

    if (partSavedPrompts !== undefined) {
      if (typeof db.updateSearchPartPrompts === 'function') {
        updated = db.updateSearchPartPrompts(searchId, partSavedPrompts || {}) || updated;
      } else {
        const s = db.getSearch(searchId);
        if (s) {
          s.partSavedPrompts = partSavedPrompts;
          db.recordSearch(s);
          updated = true;
        }
      }
    }

    return NextResponse.json({ success: updated });
  } catch (err: any) {
    console.error('Error updating search history record:', err);
    return NextResponse.json({ error: err?.message || 'Internal error' }, { status: 500 });
  }
}

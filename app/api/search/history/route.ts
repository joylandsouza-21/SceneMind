import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const videoId = searchParams.get('videoId') || undefined;

    const searches = db.getSearches(videoId);

    // Return summaries with result count and segment counts
    const history = searches.map((s) => {
      let videoTitle: string | undefined = undefined;
      if (s.videoId) {
        const v = db.getVideo(s.videoId);
        if (v) videoTitle = v.filename;
      }
      return {
        id: s.id,
        query: s.query,
        groupId: s.groupId,
        groupName: s.groupName,
        videoId: s.videoId,
        videoTitle,
        resultCount: s.resultCount,
        hasResults: !!(s.results && s.results.length > 0),
        isSegmented: s.isSegmented || (s.segments && s.segments.length > 1),
        segmentCount: s.segments?.length || 1,
        createdAt: s.createdAt,
      };
    });

    return NextResponse.json({ history });
  } catch (err: any) {
    console.error('Error fetching search history:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    db.clearSearches();
    return NextResponse.json({ success: true, message: 'Search history cleared' });
  } catch (err: any) {
    console.error('Error clearing search history:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

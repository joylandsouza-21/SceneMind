import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { db } from '@/lib/db';
import { VideoSearch } from '@/lib/db/types';
import { searchService } from '@/lib/services/search.service';
import { runWithCostContext } from '@/lib/services/cost-context';

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { query, autoVerify = true, limit = 8 } = await req.json();

    if (!query || typeof query !== 'string' || query.trim() === '') {
      return NextResponse.json({ error: 'Search query is required' }, { status: 400 });
    }

    const video = db.getVideo(params.id);
    if (!video) {
      return NextResponse.json({ error: 'Video not found' }, { status: 404 });
    }

    const searchId = `search_${uuidv4()}`;
    return await runWithCostContext({ searchId, searchQuery: query.trim(), scopeVideoId: params.id }, async () => {
    // Step 1: AI Query Expansion (Synonyms, Visual Actions, & Entity Extraction)
    const expansion = await searchService.expandQuery(query);

    // Step 2: Broad Hybrid Retrieval (Multi-Query Vector Embeddings + Lexical Boost)
    const candidates = await searchService.retrieveCandidates({
      expansion,
      videoIdFilter: params.id,
      candidateLimit: Math.max(16, limit * 2),
    });

    // Step 3: AI Scene Re-Ranking & Exclusion Filter (LLM-as-a-Judge)
    const results = await searchService.rerankAndFilter({
      query,
      candidates,
      videoId: params.id,
      minConfidenceThreshold: 35,
    });

    // Record search in database
    const searchRecord: VideoSearch = {
      id: searchId,
      videoId: params.id,
      query,
      resultCount: results.length,
      createdAt: new Date().toISOString(),
    };
    db.recordSearch(searchRecord);

    return NextResponse.json({
      query,
      videoId: params.id,
      count: results.length,
      results,
    });
    });
  } catch (err: any) {
    console.error('Search error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

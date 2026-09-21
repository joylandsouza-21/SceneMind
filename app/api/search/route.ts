import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { db } from '@/lib/db/store';
import { VideoSearch } from '@/lib/db/types';
import { embeddingService } from '@/lib/services/embedding.service';
import { vectorService } from '@/lib/services/vector.service';
import { timestampVerificationService } from '@/lib/services/timestamp-verification.service';

export async function POST(req: NextRequest) {
  try {
    const { query, autoVerify = true, limit = 15, groupId } = await req.json();

    if (!query || typeof query !== 'string' || query.trim() === '') {
      return NextResponse.json({ error: 'Search query is required' }, { status: 400 });
    }

    const trimmedQuery = query.trim();

    // Google Gemini text-embedding-004 limit is 2,048 tokens (~8,192 chars)
    const estimatedTokens = Math.ceil(trimmedQuery.length / 4);
    if (estimatedTokens > 2048) {
      return NextResponse.json({
        error: `Search prompt exceeds Google Gemini embedding limit of 2,048 tokens (your query is ~${estimatedTokens} tokens / ${trimmedQuery.length} characters). Please shorten your search prompt.`
      }, { status: 400 });
    }

    let videoIdFilter: string[] | undefined = undefined;
    if (groupId && groupId !== 'all') {
      const groupVideos = db.getVideos(groupId);
      videoIdFilter = groupVideos.map((v) => v.id);
      if (videoIdFilter.length === 0) {
        return NextResponse.json({
          query,
          count: 0,
          results: [],
        });
      }
    }

    const videos = db.getVideos();
    const videoMap = new Map(videos.map((v) => [v.id, v]));

    // Generate query embedding
    const { embedding: queryEmbedding } = await embeddingService.generateEmbedding(query);

    // Vector search with optional videoIdFilter (single, array, or undefined for global)
    const matches = await vectorService.search(queryEmbedding, limit, videoIdFilter, 0.05);

    const maxRawSim = matches.length > 0 ? Math.max(...matches.map((m) => m.similarity)) : 1.0;
    const isLocalScale = maxRawSim < 0.4;

    const results = await Promise.all(
      matches.map(async (match) => {
        const video = videoMap.get(match.videoId);
        let verifiedStart = match.metadata.startTime;
        let verifiedEnd = match.metadata.endTime;
        let isVerified = false;

        const similarityScore = isLocalScale
          ? Math.min(98, Math.round((match.similarity / Math.max(0.08, maxRawSim)) * 92))
          : Math.min(99, Math.round(match.similarity * 100));

        let verifiedConfidence = similarityScore;
        let verificationReason = 'Candidate retrieved from vector similarity.';

        if (autoVerify) {
          try {
            const verification = await timestampVerificationService.verifyTimestamps({
              query,
              candidateStart: match.metadata.startTime,
              candidateEnd: match.metadata.endTime,
              sceneDescription: match.metadata.description,
              videoId: match.videoId,
              sceneId: match.sceneId,
            });

            if (verification.match) {
              verifiedStart = verification.startTime;
              verifiedEnd = verification.endTime;
              verifiedConfidence = verification.confidence;
              verificationReason = verification.reason;
              isVerified = true;
            }
          } catch (e) {
            console.warn('AI timestamp verification skipped for global search candidate:', e);
          }
        }

        return {
          sceneId: match.sceneId,
          videoId: match.videoId,
          videoName: video?.filename || 'Unknown Video',
          videoDuration: video?.duration || 0,
          similarityScore,
          confidenceScore: Math.round(isVerified ? verifiedConfidence * 100 : similarityScore),
          startTime: match.metadata.startTime,
          endTime: match.metadata.endTime,
          verifiedStartTime: verifiedStart,
          verifiedEndTime: verifiedEnd,
          duration: Math.round((verifiedEnd - verifiedStart) * 10) / 10,
          description: match.metadata.description,
          actions: match.metadata.actions,
          objects: match.metadata.objects,
          people: match.metadata.people,
          location: match.metadata.location,
          isVerified,
          verificationReason,
          groupId: video?.groupId,
          groupName: video?.groupName,
        };
      })
    );

    const searchRecord: VideoSearch = {
      id: `search_${uuidv4()}`,
      query,
      groupId: groupId && groupId !== 'all' ? groupId : undefined,
      resultCount: results.length,
      createdAt: new Date().toISOString(),
    };
    db.recordSearch(searchRecord);

    return NextResponse.json({
      query,
      count: results.length,
      results,
    });
  } catch (err: any) {
    console.error('Global search error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

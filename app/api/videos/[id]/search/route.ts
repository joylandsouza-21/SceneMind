import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { db } from '@/lib/db';
import { VideoSearch } from '@/lib/db/types';
import { embeddingService } from '@/lib/services/embedding.service';
import { vectorService } from '@/lib/services/vector.service';
import { timestampVerificationService } from '@/lib/services/timestamp-verification.service';

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

    // Step 1: Generate embedding for natural language query
    const { embedding: queryEmbedding } = await embeddingService.generateEmbedding(query, {
      videoId: params.id,
    });

    // Step 2: Vector similarity search (filtered to this video)
    const matches = await vectorService.search(queryEmbedding, limit, params.id, 0.05);

    // Compute highest raw similarity for adaptive calibration
    const maxRawSim = matches.length > 0 ? Math.max(...matches.map((m) => m.similarity)) : 1.0;
    const isLocalScale = maxRawSim < 0.4;

    // Step 3: Second-pass AI timestamp boundary verification for top candidates
    const results = await Promise.all(
      matches.map(async (match) => {
        let verifiedStart = match.metadata.startTime;
        let verifiedEnd = match.metadata.endTime;
        let isVerified = false;

        // Calibrated similarity percentage
        const similarityScore = isLocalScale
          ? Math.min(98, Math.round((match.similarity / Math.max(0.08, maxRawSim)) * 92))
          : Math.min(99, Math.round(match.similarity * 100));

        let verifiedConfidence = similarityScore;
        let verificationReason = 'Candidate identified from vector semantic similarity.';

        if (autoVerify) {
          try {
            const verification = await timestampVerificationService.verifyTimestamps({
              query,
              candidateStart: match.metadata.startTime,
              candidateEnd: match.metadata.endTime,
              sceneDescription: match.metadata.description,
              videoId: params.id,
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
            console.warn('AI timestamp verification skipped:', e);
          }
        }

        return {
          sceneId: match.sceneId,
          videoId: match.videoId,
          videoName: video.filename,
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
        };
      })
    );

    // Record search in database
    const searchRecord: VideoSearch = {
      id: `search_${uuidv4()}`,
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
  } catch (err: any) {
    console.error('Search error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

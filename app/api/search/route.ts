import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { db } from '@/lib/db';
import { VideoSearch } from '@/lib/db/types';
import { embeddingService, segmentPrompt, PromptSegment } from '@/lib/services/embedding.service';
import { vectorService } from '@/lib/services/vector.service';
import { timestampVerificationService } from '@/lib/services/timestamp-verification.service';

export async function POST(req: NextRequest) {
  try {
    const { query, autoVerify = true, limit = 15, groupId, videoId, forceLive = false } = await req.json();

    if (!query || typeof query !== 'string' || query.trim() === '') {
      return NextResponse.json({ error: 'Search query is required' }, { status: 400 });
    }

    const trimmedQuery = query.trim();

    // Allow long multi-scene recap prompts up to 8,192 tokens (~32,768 chars)
    const estimatedTokens = Math.ceil(trimmedQuery.length / 4);
    if (estimatedTokens > 8192) {
      return NextResponse.json({
        error: `Search prompt exceeds maximum script limit of 8,192 tokens (~${estimatedTokens} tokens / ${trimmedQuery.length} characters). Please shorten your prompt.`
      }, { status: 400 });
    }

    // Check if we already have cached results for this exact query, group, and video scope
    if (!forceLive) {
      const cachedSearch = db.findCachedSearch(
        trimmedQuery,
        groupId && groupId !== 'all' ? groupId : undefined,
        videoId && videoId !== 'all' ? videoId : undefined
      );
      if (cachedSearch && cachedSearch.results && cachedSearch.results.length > 0) {
        const hydratedResults = cachedSearch.results.map((res: any) => {
          if (!res.videoStoragePath && res.videoId) {
            const video = db.getVideo(res.videoId);
            if (video) {
              res.videoStoragePath = video.storagePath;
              res.thumbnailUrl = `/api/media/thumbnails/thumb_${video.id}.jpg`;
            }
          }
          return res;
        });

        return NextResponse.json({
          query: cachedSearch.query,
          count: cachedSearch.resultCount,
          results: hydratedResults,
          segments: cachedSearch.segments || [],
          isSegmented: cachedSearch.isSegmented || false,
          fromCache: true,
          searchId: cachedSearch.id,
        });
      }
    }

    let videoIdFilter: string[] | undefined = undefined;
    if (videoId && videoId !== 'all') {
      videoIdFilter = [videoId];
    } else if (groupId && groupId !== 'all') {
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

    // Segment the prompt into semantic parts
    const rawSegments: PromptSegment[] = segmentPrompt(trimmedQuery);
    const isMultiSegment = rawSegments.length > 1;

    // Track segment match mappings: sceneId -> SegmentMatch[]
    interface SceneSegmentMatch {
      segmentId: string;
      segmentIndex: number;
      segmentLabel: string;
      segmentText: string;
      similarity: number;
    }

    const sceneSegmentMap = new Map<string, SceneSegmentMatch[]>();
    const sceneMatchMap = new Map<string, any>();

    // 1. Generate embedding for the full query (capped to 5 matches if single part)
    const { embedding: globalEmbedding } = await embeddingService.generateEmbedding(trimmedQuery.slice(0, 2000));
    const globalMatches = await vectorService.search(globalEmbedding, isMultiSegment ? limit : 5, videoIdFilter, 0.05);

    for (const m of globalMatches) {
      sceneMatchMap.set(m.sceneId, m);
    }

    // 2. If multi-segment, generate embeddings for each segment and search (strictly 5 matches per segment)
    let segmentSummaries: (PromptSegment & { matchedClipCount: number; matchedClipIds: string[] })[] = [];

    if (isMultiSegment) {
      const segmentResults = await Promise.all(
        rawSegments.map(async (seg: PromptSegment) => {
          const { embedding: segEmbedding } = await embeddingService.generateEmbedding(seg.text);
          // Exactly 5 matches per segment part
          const segMatches = await vectorService.search(segEmbedding, 5, videoIdFilter, 0.05);
          return { segment: seg, matches: segMatches };
        })
      );

      segmentSummaries = segmentResults.map(({ segment, matches: segMatches }: { segment: PromptSegment; matches: any[] }) => {
        const top5Matches = segMatches.slice(0, 5);
        const matchedClipIds: string[] = [];
        for (const sm of top5Matches) {
          matchedClipIds.push(sm.sceneId);

          if (!sceneMatchMap.has(sm.sceneId)) {
            sceneMatchMap.set(sm.sceneId, sm);
          }

          const existing = sceneSegmentMap.get(sm.sceneId) || [];
          existing.push({
            segmentId: segment.id,
            segmentIndex: segment.index,
            segmentLabel: segment.label,
            segmentText: segment.text,
            similarity: sm.similarity,
          });
          sceneSegmentMap.set(sm.sceneId, existing);
        }

        return {
          ...segment,
          matchedClipCount: matchedClipIds.length,
          matchedClipIds,
        };
      });
    } else {
      const top5Global = globalMatches.slice(0, 5);
      segmentSummaries = rawSegments.map((seg: PromptSegment) => ({
        ...seg,
        matchedClipCount: top5Global.length,
        matchedClipIds: top5Global.map((m) => m.sceneId),
      }));

      for (const gm of top5Global) {
        sceneSegmentMap.set(gm.sceneId, [
          {
            segmentId: rawSegments[0]?.id || 'seg_0',
            segmentIndex: 1,
            segmentLabel: 'Part 1',
            segmentText: rawSegments[0]?.text || trimmedQuery,
            similarity: gm.similarity,
          },
        ]);
      }
    }

    // Combine candidate matches
    const allCandidateMatches = Array.from(sceneMatchMap.values());
    const maxRawSim = allCandidateMatches.length > 0
      ? Math.max(...allCandidateMatches.map((m) => m.similarity))
      : 1.0;
    const isLocalScale = maxRawSim < 0.4;

    const results = await Promise.all(
      allCandidateMatches.map(async (match) => {
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
              query: trimmedQuery,
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

        // Extract and sort segment associations for this clip
        const segmentMatches = (sceneSegmentMap.get(match.sceneId) || []).sort(
          (a, b) => b.similarity - a.similarity
        );
        const primarySegment = segmentMatches[0];

        return {
          sceneId: match.sceneId,
          videoId: match.videoId,
          videoName: video?.filename || 'Unknown Video',
          videoDuration: video?.duration || 0,
          videoStoragePath: video?.storagePath || '',
          thumbnailUrl: `/api/media/thumbnails/thumb_${video?.id}.jpg`,
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
          // Segment alignment attributes
          matchedSegmentIds: segmentMatches.map((s) => s.segmentId),
          segmentMatches,
          primarySegmentId: primarySegment?.segmentId || null,
          primarySegmentLabel: primarySegment?.segmentLabel || null,
          primarySegmentText: primarySegment?.segmentText || null,
        };
      })
    );

    // Sort results by confidence / similarity
    results.sort((a, b) => b.confidenceScore - a.confidenceScore);

    const targetGroup = groupId && groupId !== 'all' ? db.getGroup(groupId) : undefined;
    const searchRecord: VideoSearch = {
      id: `search_${uuidv4()}`,
      query: trimmedQuery,
      groupId: groupId && groupId !== 'all' ? groupId : undefined,
      groupName: targetGroup?.name,
      videoId: videoId && videoId !== 'all' ? videoId : undefined,
      resultCount: results.length,
      results,
      segments: segmentSummaries,
      isSegmented: isMultiSegment,
      createdAt: new Date().toISOString(),
    };
    db.recordSearch(searchRecord);

    return NextResponse.json({
      query: trimmedQuery,
      count: results.length,
      results,
      segments: segmentSummaries,
      isSegmented: isMultiSegment,
    });
  } catch (err: any) {
    console.error('Global search error:', err);
    return NextResponse.json({
      error: err?.message || 'Global search failed. Please verify API configuration or try again.'
    }, { status: 500 });
  }
}

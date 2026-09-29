import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { db } from '@/lib/db';
import { VideoSearch } from '@/lib/db/types';
import { segmentPrompt, PromptSegment } from '@/lib/services/embedding.service';
import { searchService, RerankedSceneResult } from '@/lib/services/search.service';

export async function POST(req: NextRequest) {
  try {
    const { query, autoVerify = true, limit = 15, groupId, videoId, forceLive = false, saveHistory = true } = await req.json();

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
    if (!forceLive && saveHistory) {
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
    const sceneMatchMap = new Map<string, RerankedSceneResult>();
    let segmentSummaries: (PromptSegment & { matchedClipCount: number; matchedClipIds: string[] })[] = [];
    const warnings: string[] = [];

    if (isMultiSegment) {
      const segmentResults = await Promise.all(
        rawSegments.map(async (seg: PromptSegment) => {
          const expansion = await searchService.expandQuery(seg.text);
          if (expansion.warning) warnings.push(expansion.warning);
          const candidates = await searchService.retrieveCandidates({
            expansion,
            videoIdFilter,
            candidateLimit: 12,
          });

          const reranked = autoVerify
            ? await searchService.rerankAndFilter({
                query: seg.text,
                candidates,
                minConfidenceThreshold: 35,
                onWarning: (w) => warnings.push(w),
              })
            : candidates.map((c) => ({
                sceneId: c.sceneId,
                videoId: c.videoId,
                videoName: videoMap.get(c.videoId)?.filename || 'Unknown Video',
                videoDuration: videoMap.get(c.videoId)?.duration || 0,
                videoStoragePath: videoMap.get(c.videoId)?.storagePath || '',
                thumbnailUrl: `/api/media/thumbnails/thumb_${c.videoId}.jpg`,
                similarityScore: Math.round(c.similarity * 100),
                confidenceScore: Math.round(c.similarity * 100),
                startTime: c.metadata.startTime,
                endTime: c.metadata.endTime,
                verifiedStartTime: c.metadata.startTime,
                verifiedEndTime: c.metadata.endTime,
                duration: Math.round((c.metadata.endTime - c.metadata.startTime) * 10) / 10,
                description: c.metadata.description,
                actions: c.metadata.actions || [],
                objects: c.metadata.objects || [],
                people: c.metadata.people || [],
                location: c.metadata.location || '',
                isVerified: false,
                verificationReason: 'Retrieved via semantic matching',
                groupId: videoMap.get(c.videoId)?.groupId,
                groupName: videoMap.get(c.videoId)?.groupName,
              }));

          return { segment: seg, matches: reranked.slice(0, 5) };
        })
      );

      segmentSummaries = segmentResults.map(({ segment, matches }: { segment: PromptSegment; matches: RerankedSceneResult[] }) => {
        const matchedClipIds: string[] = [];
        for (const sm of matches) {
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
            similarity: sm.similarityScore / 100,
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
      // 1. Stage 1: AI Query Expansion (Synonyms, Visual Actions, & Entity Extraction)
      const expansion = await searchService.expandQuery(trimmedQuery);
      if (expansion.warning) warnings.push(expansion.warning);

      // 2. Stage 2: Broad Hybrid Candidate Retrieval (Multi-Query Vector + Lexical Boost)
      const candidates = await searchService.retrieveCandidates({
        expansion,
        videoIdFilter,
        candidateLimit: Math.max(16, limit * 2),
      });

      // 3. Stage 3: AI Scene Re-Ranking & Exclusion Filter (LLM-as-a-Judge)
      const reranked = autoVerify
        ? await searchService.rerankAndFilter({
            query: trimmedQuery,
            candidates,
            minConfidenceThreshold: 35,
            onWarning: (w) => warnings.push(w),
          })
        : candidates.map((c) => ({
            sceneId: c.sceneId,
            videoId: c.videoId,
            videoName: videoMap.get(c.videoId)?.filename || 'Unknown Video',
            videoDuration: videoMap.get(c.videoId)?.duration || 0,
            videoStoragePath: videoMap.get(c.videoId)?.storagePath || '',
            thumbnailUrl: `/api/media/thumbnails/thumb_${c.videoId}.jpg`,
            similarityScore: Math.round(c.similarity * 100),
            confidenceScore: Math.round(c.similarity * 100),
            startTime: c.metadata.startTime,
            endTime: c.metadata.endTime,
            verifiedStartTime: c.metadata.startTime,
            verifiedEndTime: c.metadata.endTime,
            duration: Math.round((c.metadata.endTime - c.metadata.startTime) * 10) / 10,
            description: c.metadata.description,
            actions: c.metadata.actions || [],
            objects: c.metadata.objects || [],
            people: c.metadata.people || [],
            location: c.metadata.location || '',
            isVerified: false,
            verificationReason: 'Retrieved via semantic matching',
            groupId: videoMap.get(c.videoId)?.groupId,
            groupName: videoMap.get(c.videoId)?.groupName,
          }));

      const topResults = reranked.slice(0, limit);
      for (const res of topResults) {
        sceneMatchMap.set(res.sceneId, res);
      }

      segmentSummaries = rawSegments.map((seg: PromptSegment) => ({
        ...seg,
        matchedClipCount: topResults.length,
        matchedClipIds: topResults.map((m) => m.sceneId),
      }));

      for (const res of topResults) {
        sceneSegmentMap.set(res.sceneId, [
          {
            segmentId: rawSegments[0]?.id || 'seg_0',
            segmentIndex: 1,
            segmentLabel: 'Part 1',
            segmentText: rawSegments[0]?.text || trimmedQuery,
            similarity: res.similarityScore / 100,
          },
        ]);
      }
    }

    // Combine candidate matches into final response format
    const results = Array.from(sceneMatchMap.values()).map((item) => {
      const segmentMatches = (sceneSegmentMap.get(item.sceneId) || []).sort(
        (a, b) => b.similarity - a.similarity
      );
      const primarySegment = segmentMatches[0];

      return {
        ...item,
        matchedSegmentIds: segmentMatches.map((s) => s.segmentId),
        segmentMatches,
        primarySegmentId: primarySegment?.segmentId || null,
        primarySegmentLabel: primarySegment?.segmentLabel || null,
        primarySegmentText: primarySegment?.segmentText || null,
      };
    });

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
    if (saveHistory) {
      db.recordSearch(searchRecord);
    }

    const uniqueWarnings = Array.from(new Set(warnings.filter(Boolean)));

    return NextResponse.json({
      searchId: saveHistory ? searchRecord.id : undefined,
      query: trimmedQuery,
      count: results.length,
      results,
      segments: segmentSummaries,
      isSegmented: isMultiSegment,
      warning: uniqueWarnings.length > 0 ? uniqueWarnings.join(' • ') : undefined,
    });
  } catch (err: any) {
    console.error('Global search error:', err);
    return NextResponse.json({
      error: err?.message || 'Global search failed. Please verify API configuration or try again.'
    }, { status: 500 });
  }
}

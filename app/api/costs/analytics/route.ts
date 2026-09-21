import { NextResponse } from 'next/server';
import { db } from '@/lib/db/store';
import { AiCost, Video } from '@/lib/db/types';

export async function GET() {
  try {
    const allCosts = db.getCosts();
    const allVideos = db.getVideos();

    // --- Overall Summary ---
    let totalCost = 0;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let totalProcessingTimeMs = 0;

    for (const c of allCosts) {
      totalCost += c.estimatedCost;
      totalInputTokens += c.inputTokens;
      totalOutputTokens += c.outputTokens;
      totalProcessingTimeMs += c.processingTimeMs;
    }

    const overallSummary = {
      totalCost: parseFloat(totalCost.toFixed(6)),
      totalInputTokens,
      totalOutputTokens,
      totalTokens: totalInputTokens + totalOutputTokens,
      totalProcessingTimeMs,
      totalOperations: allCosts.length,
      averageCostPerOperation: allCosts.length > 0 ? parseFloat((totalCost / allCosts.length).toFixed(6)) : 0,
    };

    // --- Per-Video Breakdown ---
    const videoMap = new Map<string, Video>();
    for (const v of allVideos) {
      videoMap.set(v.id, v);
    }

    const costsByVideo: Record<string, {
      videoId: string;
      videoName: string;
      totalCost: number;
      operationCount: number;
      inputTokens: number;
      outputTokens: number;
      processingTimeMs: number;
      byType: Record<string, { count: number; cost: number }>;
    }> = {};

    for (const c of allCosts) {
      const vid = c.videoId || '_unlinked';
      if (!costsByVideo[vid]) {
        const video = c.videoId ? videoMap.get(c.videoId) : null;
        costsByVideo[vid] = {
          videoId: vid,
          videoName: video ? (video.originalName || video.filename) : 'Unlinked Operations',
          totalCost: 0,
          operationCount: 0,
          inputTokens: 0,
          outputTokens: 0,
          processingTimeMs: 0,
          byType: {},
        };
      }
      const entry = costsByVideo[vid];
      entry.totalCost += c.estimatedCost;
      entry.operationCount += 1;
      entry.inputTokens += c.inputTokens;
      entry.outputTokens += c.outputTokens;
      entry.processingTimeMs += c.processingTimeMs;

      if (!entry.byType[c.requestType]) {
        entry.byType[c.requestType] = { count: 0, cost: 0 };
      }
      entry.byType[c.requestType].count += 1;
      entry.byType[c.requestType].cost += c.estimatedCost;
    }

    const perVideo = Object.values(costsByVideo)
      .map((v) => ({
        ...v,
        totalCost: parseFloat(v.totalCost.toFixed(6)),
        byType: Object.fromEntries(
          Object.entries(v.byType).map(([k, val]) => [k, { ...val, cost: parseFloat(val.cost.toFixed(6)) }])
        ),
      }))
      .sort((a, b) => b.totalCost - a.totalCost);

    // --- Per Request Type Breakdown ---
    const byRequestType: Record<string, { count: number; cost: number; inputTokens: number; outputTokens: number }> = {};
    for (const c of allCosts) {
      if (!byRequestType[c.requestType]) {
        byRequestType[c.requestType] = { count: 0, cost: 0, inputTokens: 0, outputTokens: 0 };
      }
      byRequestType[c.requestType].count += 1;
      byRequestType[c.requestType].cost += c.estimatedCost;
      byRequestType[c.requestType].inputTokens += c.inputTokens;
      byRequestType[c.requestType].outputTokens += c.outputTokens;
    }

    const perRequestType = Object.entries(byRequestType).map(([type, data]) => ({
      type,
      ...data,
      cost: parseFloat(data.cost.toFixed(6)),
    })).sort((a, b) => b.cost - a.cost);

    // --- Per Model Breakdown ---
    const byModel: Record<string, { count: number; cost: number; inputTokens: number; outputTokens: number }> = {};
    for (const c of allCosts) {
      if (!byModel[c.model]) {
        byModel[c.model] = { count: 0, cost: 0, inputTokens: 0, outputTokens: 0 };
      }
      byModel[c.model].count += 1;
      byModel[c.model].cost += c.estimatedCost;
      byModel[c.model].inputTokens += c.inputTokens;
      byModel[c.model].outputTokens += c.outputTokens;
    }

    const perModel = Object.entries(byModel).map(([model, data]) => ({
      model,
      ...data,
      cost: parseFloat(data.cost.toFixed(6)),
    })).sort((a, b) => b.cost - a.cost);

    // --- Timeline (hourly buckets) ---
    const timeline: Record<string, { hour: string; cost: number; operations: number }> = {};
    for (const c of allCosts) {
      const d = new Date(c.createdAt);
      const hourKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T${String(d.getHours()).padStart(2, '0')}:00`;
      if (!timeline[hourKey]) {
        timeline[hourKey] = { hour: hourKey, cost: 0, operations: 0 };
      }
      timeline[hourKey].cost += c.estimatedCost;
      timeline[hourKey].operations += 1;
    }

    const timelineSorted = Object.values(timeline)
      .map((t) => ({ ...t, cost: parseFloat(t.cost.toFixed(6)) }))
      .sort((a, b) => a.hour.localeCompare(b.hour));

    // --- Recent Operations (last 500) ---
    const recentOps = [...allCosts]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 500)
      .map((c) => ({
        ...c,
        videoName: c.videoId ? (videoMap.get(c.videoId)?.originalName || videoMap.get(c.videoId)?.filename || c.videoId) : 'N/A',
      }));

    return NextResponse.json({
      summary: overallSummary,
      perVideo,
      perRequestType,
      perModel,
      timeline: timelineSorted,
      recentOperations: recentOps,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

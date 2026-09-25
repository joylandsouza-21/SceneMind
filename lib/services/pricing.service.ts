import { db } from '../db';
import { AiCost } from '../db/types';
import { v4 as uuidv4 } from 'uuid';

export interface PricingRates {
  geminiFlashInputPerMillion: number;
  geminiFlashOutputPerMillion: number;
  geminiEmbeddingPerMillion: number;
  videoMultimodalPerSecond: number;
  ffmpegComputePerMinute: number;
}

export const DEFAULT_PRICING: PricingRates = {
  geminiFlashInputPerMillion: 0.075,
  geminiFlashOutputPerMillion: 0.30,
  geminiEmbeddingPerMillion: 0.02,
  videoMultimodalPerSecond: 0.00003, // ~$0.0018 per minute of processed video
  ffmpegComputePerMinute: 0.0004,
};

export class PricingService {
  private rates: PricingRates;

  constructor(rates: PricingRates = DEFAULT_PRICING) {
    this.rates = rates;
  }

  public calculateTextAiCost(model: string, inputTokens: number, outputTokens: number): number {
    const inputCost = (inputTokens / 1_000_000) * this.rates.geminiFlashInputPerMillion;
    const outputCost = (outputTokens / 1_000_000) * this.rates.geminiFlashOutputPerMillion;
    return parseFloat((inputCost + outputCost).toFixed(6));
  }

  public calculateEmbeddingCost(tokenCount: number): number {
    const cost = (tokenCount / 1_000_000) * this.rates.geminiEmbeddingPerMillion;
    return parseFloat(cost.toFixed(6));
  }

  public calculateVideoAnalysisCost(durationSeconds: number, inputTokens = 0, outputTokens = 0): number {
    const baseDurationCost = durationSeconds * this.rates.videoMultimodalPerSecond;
    const textCost = this.calculateTextAiCost('gemini-flash', inputTokens, outputTokens);
    return parseFloat((baseDurationCost + textCost).toFixed(6));
  }

  public recordOperationCost(params: {
    videoId?: string;
    sceneId?: string;
    model: string;
    inputTokens: number;
    outputTokens: number;
    estimatedCost: number;
    processingTimeMs: number;
    requestType: 'SCENE_ANALYSIS' | 'EMBEDDING' | 'TIMESTAMP_VERIFICATION' | 'RERANKING';
  }): AiCost {
    const record: AiCost = {
      id: uuidv4(),
      videoId: params.videoId,
      sceneId: params.sceneId,
      model: params.model,
      inputTokens: params.inputTokens,
      outputTokens: params.outputTokens,
      estimatedCost: params.estimatedCost,
      processingTimeMs: params.processingTimeMs,
      requestType: params.requestType,
      createdAt: new Date().toISOString(),
    };
    db.recordCost(record);
    return record;
  }

  public getAggregatedCosts(videoId?: string) {
    const records = db.getCosts(videoId);
    let totalCost = 0;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let totalProcessingTimeMs = 0;

    const byType: Record<string, { count: number; cost: number }> = {
      SCENE_ANALYSIS: { count: 0, cost: 0 },
      EMBEDDING: { count: 0, cost: 0 },
      TIMESTAMP_VERIFICATION: { count: 0, cost: 0 },
      RERANKING: { count: 0, cost: 0 },
    };

    for (const r of records) {
      totalCost += r.estimatedCost;
      totalInputTokens += r.inputTokens;
      totalOutputTokens += r.outputTokens;
      totalProcessingTimeMs += r.processingTimeMs;

      if (!byType[r.requestType]) {
        byType[r.requestType] = { count: 0, cost: 0 };
      }
      byType[r.requestType].count += 1;
      byType[r.requestType].cost = parseFloat((byType[r.requestType].cost + r.estimatedCost).toFixed(6));
    }

    return {
      totalCost: parseFloat(totalCost.toFixed(4)),
      totalInputTokens,
      totalOutputTokens,
      totalProcessingTimeMs,
      recordCount: records.length,
      byType,
    };
  }

  public formatCurrency(amount: number): string {
    if (amount < 0.001 && amount > 0) {
      return `$${amount.toFixed(5)}`;
    }
    return `$${amount.toFixed(3)}`;
  }
}

export const pricingService = new PricingService();

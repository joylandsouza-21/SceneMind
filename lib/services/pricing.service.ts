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

export const MODEL_PRICING_RATES: Record<string, { inputPerMillion: number; outputPerMillion: number }> = {
  // Anthropic Claude
  'claude-3-5-sonnet-20241022': { inputPerMillion: 3.0, outputPerMillion: 15.0 },
  'claude-3-5-sonnet-20240620': { inputPerMillion: 3.0, outputPerMillion: 15.0 },
  'claude-3-5-haiku-20241022': { inputPerMillion: 0.8, outputPerMillion: 4.0 },
  'claude-3-haiku-20240307': { inputPerMillion: 0.25, outputPerMillion: 1.25 },
  'claude-3-opus-20240229': { inputPerMillion: 15.0, outputPerMillion: 75.0 },
  // OpenAI
  'gpt-4o': { inputPerMillion: 2.5, outputPerMillion: 10.0 },
  'gpt-4o-mini': { inputPerMillion: 0.15, outputPerMillion: 0.60 },
  'o1-mini': { inputPerMillion: 3.0, outputPerMillion: 12.0 },
  'o3-mini': { inputPerMillion: 1.1, outputPerMillion: 4.4 },
  // Google Gemini
  'gemini-2.0-flash': { inputPerMillion: 0.10, outputPerMillion: 0.40 },
  'gemini-2.0-flash-exp': { inputPerMillion: 0.0, outputPerMillion: 0.0 },
  'gemini-1.5-flash': { inputPerMillion: 0.075, outputPerMillion: 0.30 },
  'gemini-1.5-flash-8b': { inputPerMillion: 0.0375, outputPerMillion: 0.15 },
  'gemini-1.5-pro': { inputPerMillion: 1.25, outputPerMillion: 5.00 },
  // Groq / Open Source
  'llama-3.3-70b-versatile': { inputPerMillion: 0.59, outputPerMillion: 0.79 },
  'llama-3.1-8b-instant': { inputPerMillion: 0.05, outputPerMillion: 0.08 },
};

export const EMBEDDING_PRICING_RATES: Record<string, number> = {
  'gemini-embedding-001': 0.02,
  'text-embedding-004': 0.02,
  'text-embedding-3-small': 0.02,
  'text-embedding-3-large': 0.13,
  'voyage-3': 0.12,
  'voyage-3-lite': 0.06,
  'voyage-code-3': 0.12,
  'claude-3-5-haiku': 0.80,
  'claude-3-5-sonnet': 3.00,
};

export class PricingService {
  private rates: PricingRates;

  constructor(rates: PricingRates = DEFAULT_PRICING) {
    this.rates = rates;
  }

  public calculateTextAiCost(model: string = '', inputTokens: number = 0, outputTokens: number = 0): number {
    const normalizedModel = (model || '').toLowerCase().trim();
    
    // Find matching rate or fallback
    let rate = MODEL_PRICING_RATES[normalizedModel];
    if (!rate) {
      if (normalizedModel.includes('sonnet')) {
        rate = { inputPerMillion: 3.0, outputPerMillion: 15.0 };
      } else if (normalizedModel.includes('haiku')) {
        rate = { inputPerMillion: 0.8, outputPerMillion: 4.0 };
      } else if (normalizedModel.includes('opus')) {
        rate = { inputPerMillion: 15.0, outputPerMillion: 75.0 };
      } else if (normalizedModel.includes('gpt-4o-mini')) {
        rate = { inputPerMillion: 0.15, outputPerMillion: 0.60 };
      } else if (normalizedModel.includes('gpt-4o')) {
        rate = { inputPerMillion: 2.5, outputPerMillion: 10.0 };
      } else if (normalizedModel.includes('1.5-pro') || normalizedModel.includes('2.0-pro')) {
        rate = { inputPerMillion: 1.25, outputPerMillion: 5.00 };
      } else if (normalizedModel.includes('llama')) {
        rate = { inputPerMillion: 0.59, outputPerMillion: 0.79 };
      } else if (normalizedModel.includes('ollama') || normalizedModel.includes('local')) {
        rate = { inputPerMillion: 0.0, outputPerMillion: 0.0 };
      } else {
        rate = {
          inputPerMillion: this.rates.geminiFlashInputPerMillion,
          outputPerMillion: this.rates.geminiFlashOutputPerMillion,
        };
      }
    }

    const inputCost = (inputTokens / 1_000_000) * rate.inputPerMillion;
    const outputCost = (outputTokens / 1_000_000) * rate.outputPerMillion;
    return parseFloat((inputCost + outputCost).toFixed(6));
  }

  public calculateEmbeddingCost(tokenCount: number, model: string = 'gemini-embedding-001'): number {
    const normalized = (model || '').toLowerCase().trim();
    let perMillion = EMBEDDING_PRICING_RATES[normalized];
    if (perMillion === undefined) {
      if (normalized.includes('voyage')) perMillion = 0.12;
      else if (normalized.includes('haiku')) perMillion = 0.80;
      else if (normalized.includes('sonnet')) perMillion = 3.00;
      else if (normalized.includes('3-large')) perMillion = 0.13;
      else perMillion = this.rates.geminiEmbeddingPerMillion;
    }
    const cost = (tokenCount / 1_000_000) * perMillion;
    return parseFloat(cost.toFixed(6));
  }

  public calculateVideoAnalysisCost(durationSeconds: number, inputTokens = 0, outputTokens = 0, model: string = 'gemini-2.0-flash'): number {
    const baseDurationCost = durationSeconds * this.rates.videoMultimodalPerSecond;
    const textCost = this.calculateTextAiCost(model, inputTokens, outputTokens);
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

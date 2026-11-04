import { db } from '../db';
import { AiCost, CostOperation } from '../db/types';
import { v4 as uuidv4 } from 'uuid';
import { getCostContext } from './cost-context';

export interface PricingRates {
  geminiFlashInputPerMillion: number;
  geminiFlashOutputPerMillion: number;
  geminiFlashLongContextInputPerMillion: number;
  geminiFlashLongContextOutputPerMillion: number;
  geminiProInputPerMillion: number;
  geminiProOutputPerMillion: number;
  geminiProLongContextInputPerMillion: number;
  geminiProLongContextOutputPerMillion: number;
  geminiEmbeddingPerMillion: number;
  videoTokensPerSecond: number;
  ffmpegComputePerMinute: number;
}

export const DEFAULT_PRICING: PricingRates = {
  geminiFlashInputPerMillion: 0.075,
  geminiFlashOutputPerMillion: 0.30,
  geminiFlashLongContextInputPerMillion: 0.15,
  geminiFlashLongContextOutputPerMillion: 0.60,
  geminiProInputPerMillion: 1.25,
  geminiProOutputPerMillion: 5.00,
  geminiProLongContextInputPerMillion: 2.50,
  geminiProLongContextOutputPerMillion: 10.00,
  geminiEmbeddingPerMillion: 0.02,
  videoTokensPerSecond: 290, // ~258 video frame tokens (1fps) + ~32 audio tokens
  ffmpegComputePerMinute: 0.0004,
};

export const MODEL_PRICING_RATES: Record<string, { 
  inputPerMillion: number; 
  outputPerMillion: number;
  longContextInputPerMillion?: number;
  longContextOutputPerMillion?: number;
}> = {
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
  // Google Gemini (with official >128k long-context tiers)
  'gemini-3.8-flash': { 
    inputPerMillion: 0.10, 
    outputPerMillion: 0.40,
    longContextInputPerMillion: 0.15,
    longContextOutputPerMillion: 0.60
  },
  'gemini-3.6-flash': { 
    inputPerMillion: 0.10, 
    outputPerMillion: 0.40,
    longContextInputPerMillion: 0.15,
    longContextOutputPerMillion: 0.60
  },
  'gemini-2.5-flash': { 
    inputPerMillion: 0.10, 
    outputPerMillion: 0.40,
    longContextInputPerMillion: 0.15,
    longContextOutputPerMillion: 0.60
  },
  'gemini-2.0-flash': { 
    inputPerMillion: 0.10, 
    outputPerMillion: 0.40,
    longContextInputPerMillion: 0.15,
    longContextOutputPerMillion: 0.60
  },
  'gemini-2.0-flash-exp': { inputPerMillion: 0.0, outputPerMillion: 0.0 },
  'gemini-1.5-flash': { 
    inputPerMillion: 0.075, 
    outputPerMillion: 0.30,
    longContextInputPerMillion: 0.15,
    longContextOutputPerMillion: 0.60
  },
  'gemini-1.5-flash-8b': { 
    inputPerMillion: 0.0375, 
    outputPerMillion: 0.15,
    longContextInputPerMillion: 0.075,
    longContextOutputPerMillion: 0.30
  },
  'gemini-1.5-pro': { 
    inputPerMillion: 1.25, 
    outputPerMillion: 5.00,
    longContextInputPerMillion: 2.50,
    longContextOutputPerMillion: 10.00
  },
  'gemini-2.0-pro': { 
    inputPerMillion: 1.25, 
    outputPerMillion: 5.00,
    longContextInputPerMillion: 2.50,
    longContextOutputPerMillion: 10.00
  },
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
    const isLongContext = inputTokens > 128_000;
    
    // Find matching rate or fallback
    let rate = MODEL_PRICING_RATES[normalizedModel];
    let inRate = rate?.inputPerMillion;
    let outRate = rate?.outputPerMillion;

    if (rate && isLongContext && rate.longContextInputPerMillion !== undefined) {
      inRate = rate.longContextInputPerMillion;
      outRate = rate.longContextOutputPerMillion ?? rate.outputPerMillion;
    }

    if (inRate === undefined || outRate === undefined) {
      if (normalizedModel.includes('sonnet')) {
        inRate = 3.0;
        outRate = 15.0;
      } else if (normalizedModel.includes('haiku')) {
        inRate = 0.8;
        outRate = 4.0;
      } else if (normalizedModel.includes('opus')) {
        inRate = 15.0;
        outRate = 75.0;
      } else if (normalizedModel.includes('gpt-4o-mini')) {
        inRate = 0.15;
        outRate = 0.60;
      } else if (normalizedModel.includes('gpt-4o')) {
        inRate = 2.5;
        outRate = 10.0;
      } else if (normalizedModel.includes('1.5-pro') || normalizedModel.includes('2.0-pro') || normalizedModel.includes('pro')) {
        inRate = isLongContext ? this.rates.geminiProLongContextInputPerMillion : this.rates.geminiProInputPerMillion;
        outRate = isLongContext ? this.rates.geminiProLongContextOutputPerMillion : this.rates.geminiProOutputPerMillion;
      } else if (normalizedModel.includes('llama')) {
        inRate = 0.59;
        outRate = 0.79;
      } else if (normalizedModel.includes('ollama') || normalizedModel.includes('local')) {
        inRate = 0.0;
        outRate = 0.0;
      } else {
        inRate = isLongContext ? this.rates.geminiFlashLongContextInputPerMillion : this.rates.geminiFlashInputPerMillion;
        outRate = isLongContext ? this.rates.geminiFlashLongContextOutputPerMillion : this.rates.geminiFlashOutputPerMillion;
      }
    }

    const inputCost = (inputTokens / 1_000_000) * inRate;
    const outputCost = (outputTokens / 1_000_000) * outRate;
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

  public calculateVideoAnalysisCost(
    durationSeconds: number,
    inputTokens = 0,
    outputTokens = 0,
    model: string = 'gemini-3.8-flash'
  ): number {
    // If inputTokens is provided (from Gemini usageMetadata or estimator), use it directly.
    // If not provided, calculate multimodal tokens: 258 video frames/sec + 32 audio tokens/sec = 290 tokens/sec
    const effectiveInputTokens = inputTokens > 0
      ? inputTokens
      : Math.round(durationSeconds * this.rates.videoTokensPerSecond) + 500;

    return this.calculateTextAiCost(model, effectiveInputTokens, outputTokens);
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
    operation?: CostOperation;
  }): AiCost {
    // Attach the active search (if this cost was incurred while serving a search request)
    const ctx = getCostContext();
    let operation = params.operation;
    if (!operation && ctx?.searchId && params.requestType === 'EMBEDDING') {
      operation = 'QUERY_EMBEDDING';
    }

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
      operation,
      searchId: ctx?.searchId,
      searchQuery: ctx?.searchQuery,
      scopeVideoId: ctx?.scopeVideoId,
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

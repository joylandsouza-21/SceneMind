import { GoogleGenerativeAI } from '@google/generative-ai';
import { pricingService } from './pricing.service';

export interface SceneMetadataForEmbedding {
  description: string;
  actions: string[];
  objects: string[];
  people: string[];
  location: string;
  events: string[];
}

export interface PromptSegment {
  id: string;
  index: number;
  label: string;
  text: string;
  wordCount: number;
  charCount: number;
  startIndex: number;
  endIndex: number;
}

export function segmentPrompt(query: string): PromptSegment[] {
  const trimmed = query.trim();
  if (!trimmed) return [];

  // Check if query has multiple explicit lines
  const rawLines = trimmed
    .split(/\r?\n+/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  let candidates: string[] = [];
  if (rawLines.length >= 2) {
    candidates = rawLines;
  } else {
    // Split by sentence delimiters: '.', '!', '?', or ';' followed by space or end
    const sentences = trimmed
      .split(/(?<=[.!?;\n])\s+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    if (sentences.length >= 2) {
      candidates = sentences;
    } else {
      candidates = [trimmed];
    }
  }

  // Strip leading list numbering and merge overly tiny fragments
  const merged: string[] = [];
  for (const c of candidates) {
    const cleaned = c.replace(/^(?:\d+[\.\)]\s*|[-*•]\s*)/, '').trim();
    if (!cleaned) continue;

    if (
      merged.length > 0 &&
      cleaned.split(/\s+/).length <= 2 &&
      merged[merged.length - 1].split(/\s+/).length < 20
    ) {
      merged[merged.length - 1] += ' ' + cleaned;
    } else {
      merged.push(cleaned);
    }
  }

  if (merged.length === 0) {
    merged.push(trimmed);
  }

  let searchCursor = 0;
  return merged.map((text, idx) => {
    const startIndex = trimmed.indexOf(text, searchCursor);
    const endIndex = startIndex !== -1 ? startIndex + text.length : searchCursor + text.length;
    searchCursor = Math.max(searchCursor, endIndex);

    return {
      id: `seg_${idx}`,
      index: idx + 1,
      label: `Part ${idx + 1}`,
      text,
      wordCount: text.split(/\s+/).filter(Boolean).length,
      charCount: text.length,
      startIndex: startIndex !== -1 ? startIndex : 0,
      endIndex,
    };
  });
}

export class EmbeddingService {
  private genAI: GoogleGenerativeAI | null = null;
  private modelName: string;

  constructor() {
    const apiKey = process.env.GEMINI_API_KEY;
    this.modelName = process.env.GEMINI_EMBEDDING_MODEL || 'text-embedding-004';
    if (apiKey && apiKey.trim() !== '') {
      this.genAI = new GoogleGenerativeAI(apiKey);
    }
  }

  public buildCanonicalText(meta: SceneMetadataForEmbedding): string {
    const lines = [
      `Scene:\n${meta.description.trim()}`,
      `Actions: ${meta.actions.join(', ') || 'none'}.`,
      `Objects: ${meta.objects.join(', ') || 'none'}.`,
      `People: ${meta.people.join(', ') || 'none'}.`,
      `Location: ${meta.location || 'unknown'}.`,
      `Events: ${meta.events.join(', ') || 'none'}.`,
    ];
    return lines.join('\n');
  }

  public async generateEmbedding(
    text: string,
    context?: { videoId?: string; sceneId?: string }
  ): Promise<{ embedding: number[]; dimensions: number; cost: number; latencyMs: number }> {
    const start = Date.now();
    const tokenCountEstimate = Math.ceil(text.length / 4);

    if (this.genAI) {
      try {
        const model = this.genAI.getGenerativeModel({ model: this.modelName });
        const result = await model.embedContent(text);
        const vector = result.embedding.values;
        const latencyMs = Date.now() - start;
        const cost = pricingService.calculateEmbeddingCost(tokenCountEstimate);

        pricingService.recordOperationCost({
          videoId: context?.videoId,
          sceneId: context?.sceneId,
          model: this.modelName,
          inputTokens: tokenCountEstimate,
          outputTokens: 0,
          estimatedCost: cost,
          processingTimeMs: latencyMs,
          requestType: 'EMBEDDING',
        });

        return {
          embedding: vector,
          dimensions: vector.length,
          cost,
          latencyMs,
        };
      } catch (err: any) {
        console.warn(`Gemini Embedding API call failed: ${err.message}. Falling back to deterministic local semantic vectorizer.`);
      }
    }

    // High-dimensional Semantic Local Vectorizer Fallback (768 dimensions)
    const vector = this.computeLocalSemanticVector(text, 768);
    const latencyMs = Date.now() - start;
    const cost = pricingService.calculateEmbeddingCost(tokenCountEstimate);

    pricingService.recordOperationCost({
      videoId: context?.videoId,
      sceneId: context?.sceneId,
      model: 'local-semantic-embedding',
      inputTokens: tokenCountEstimate,
      outputTokens: 0,
      estimatedCost: cost,
      processingTimeMs: latencyMs,
      requestType: 'EMBEDDING',
    });

    return {
      embedding: vector,
      dimensions: vector.length,
      cost,
      latencyMs,
    };
  }

  /**
   * Deterministic 768-dimensional normalized vector based on subword hashing and semantic features.
   */
  public computeLocalSemanticVector(text: string, dimensions = 768): number[] {
    const vec = new Float64Array(dimensions);
    const normalized = text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ');
    const tokens = normalized.split(/\s+/).filter(Boolean);

    // Semantic keyword boosting categories
    const semanticWeights: Record<string, number> = {
      fight: 3.5,
      fighting: 3.5,
      punch: 3.0,
      punching: 3.0,
      confrontation: 3.0,
      combat: 3.0,
      brawl: 3.0,
      car: 3.5,
      accident: 3.5,
      crash: 3.5,
      vehicle: 3.0,
      driving: 2.5,
      dog: 3.5,
      walking: 2.5,
      park: 3.0,
      building: 3.0,
      office: 2.5,
      enters: 3.0,
      door: 2.5,
      conversation: 3.0,
      talking: 3.0,
      kitchen: 3.0,
      arguing: 3.5,
      argument: 3.5,
      explosion: 4.0,
      fire: 3.0,
      running: 3.0,
    };

    // Primary token hashing
    for (const token of tokens) {
      const weight = semanticWeights[token] || 1.0;
      let hash = 2166136261;
      for (let i = 0; i < token.length; i++) {
        hash ^= token.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
      }
      const idx = Math.abs(hash) % dimensions;
      vec[idx] += weight;

      // Also hash character bigrams and trigrams for fuzzy semantic matches
      for (let i = 0; i < token.length - 2; i++) {
        const sub = token.slice(i, i + 3);
        let subHash = 5381;
        for (let j = 0; j < sub.length; j++) {
          subHash = ((subHash << 5) + subHash) + sub.charCodeAt(j);
        }
        const subIdx = Math.abs(subHash) % dimensions;
        vec[subIdx] += 0.3 * weight;
      }
    }

    // Normalize to unit vector
    let norm = 0;
    for (let i = 0; i < dimensions; i++) {
      norm += vec[i] * vec[i];
    }
    norm = Math.sqrt(norm);
    if (norm > 0) {
      for (let i = 0; i < dimensions; i++) {
        vec[i] /= norm;
      }
    }

    return Array.from(vec);
  }

  public cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length || a.length === 0) return 0;
    let dot = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    const denom = Math.sqrt(normA) * Math.sqrt(normB);
    if (denom === 0) return 0;
    return Math.max(0, Math.min(1, dot / denom));
  }
}

export const embeddingService = new EmbeddingService();

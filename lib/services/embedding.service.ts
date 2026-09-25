import { GoogleGenerativeAI } from '@google/generative-ai';
import { pricingService } from './pricing.service';
import { aiConfigService, normalizeAnthropicModel } from './ai-config.service';

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

  // Step 1: Split into raw lines / paragraphs / list items
  const rawBlocks = trimmed
    .split(/\r?\n+/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const sentences: string[] = [];

  for (const block of rawBlocks) {
    // Strip bullet points or leading numbering: "1.", "1)", "- ", "* ", "Step 1:"
    const cleanedBlock = block.replace(/^(?:\d+[\.\)]\s*|[-*•]\s*|(?:part|scene|step)\s*\d+[:\.\s-]*)/i, '').trim();
    if (!cleanedBlock) continue;

    // Split block into individual sentences by punctuation (. ! ? ; or em-dash)
    const blockSentences = cleanedBlock
      .split(/(?<=[.!?;\n])\s+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    if (blockSentences.length > 0) {
      sentences.push(...blockSentences);
    } else {
      sentences.push(cleanedBlock);
    }
  }

  // Step 2: Group sentences into ideal scene-sized chunks (1-2 sentences, ~15-35 words per part)
  const sceneChunks: string[] = [];
  let currentChunk = '';

  for (const sentence of sentences) {
    const cleaned = sentence.replace(/^(?:\d+[\.\)]\s*|[-*•]\s*)/, '').trim();
    if (!cleaned) continue;

    const sentenceWordCount = cleaned.split(/\s+/).filter(Boolean).length;
    const currentWordCount = currentChunk ? currentChunk.split(/\s+/).filter(Boolean).length : 0;

    // If current chunk is empty, start with this sentence
    if (!currentChunk) {
      currentChunk = cleaned;
    } else if (currentWordCount + sentenceWordCount <= 35 && currentWordCount < 20) {
      // Merge into 2-sentence scene beat if word count is compact (<35 words total)
      currentChunk += ' ' + cleaned;
    } else {
      // Otherwise push current chunk as a discrete scene beat and start new chunk
      sceneChunks.push(currentChunk);
      currentChunk = cleaned;
    }
  }

  if (currentChunk) {
    sceneChunks.push(currentChunk);
  }

  // Fallback if empty
  if (sceneChunks.length === 0) {
    sceneChunks.push(trimmed);
  }

  let searchCursor = 0;
  return sceneChunks.map((text, idx) => {
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
    const config = aiConfigService.getEffectiveConfig('embedding');

    // 1. Google Gemini Embeddings
    if (config.provider === 'gemini' && config.apiKey) {
      try {
        const genAI = new GoogleGenerativeAI(config.apiKey);
        const model = genAI.getGenerativeModel({ model: config.modelName || 'gemini-embedding-001' });
        let vector: number[];
        try {
          const result = await model.embedContent({
            content: { role: 'user', parts: [{ text }] },
            outputDimensionality: 768,
          } as any);
          vector = result.embedding.values;
        } catch {
          const result = await model.embedContent(text);
          vector = result.embedding.values;
        }

        if (vector.length > 768) {
          vector = this.normalizeVector(vector.slice(0, 768));
        }

        const latencyMs = Date.now() - start;
        const cost = pricingService.calculateEmbeddingCost(tokenCountEstimate);

        pricingService.recordOperationCost({
          videoId: context?.videoId,
          sceneId: context?.sceneId,
          model: config.modelName,
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

    // 2. Anthropic Claude Semantic Embedding (Deep semantic extraction to 768d unit vector)
    if (config.provider === 'anthropic' && config.apiKey) {
      try {
        const url = config.baseUrl ? `${config.baseUrl.replace(/\/+$/, '')}/v1/messages` : 'https://api.anthropic.com/v1/messages';
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': config.apiKey,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: normalizeAnthropicModel(config.modelName, 'claude-3-5-haiku-20241022'),
            max_tokens: 300,
            system: 'You are an AI semantic embedding encoder. Return a JSON object with top semantic weighted terms, actions, objects, and concepts.',
            messages: [
              {
                role: 'user',
                content: `Analyze the following text for video vector search and extract the top weighted semantic concepts and keywords (nouns, verbs, themes, visual elements):\n"${text}"\n\nRespond ONLY with valid JSON in this exact structure:\n{"terms": [{"term": "action_or_keyword", "weight": 3.0}]}`,
              },
            ],
          }),
        });

        if (res.ok) {
          const data = await res.json();
          const responseText = data.content?.[0]?.text || '{}';
          const cleanJson = responseText.replace(/```json\s*|\s*```/g, '').trim();
          let parsed: { terms?: Array<{ term: string; weight: number }> } = {};
          try {
            parsed = JSON.parse(cleanJson);
          } catch {
            // ignore json parse error
          }

          const weightedTerms: Record<string, number> = {};
          if (Array.isArray(parsed.terms)) {
            for (const item of parsed.terms) {
              if (item.term && typeof item.weight === 'number') {
                weightedTerms[item.term.toLowerCase()] = Math.max(0.5, Math.min(5.0, item.weight));
              }
            }
          }

          const vector = this.computeLocalSemanticVector(text, 768, weightedTerms);
          const latencyMs = Date.now() - start;
          const activeModel = config.modelName || 'claude-3-5-haiku-20241022';
          const cost = pricingService.calculateTextAiCost(activeModel, tokenCountEstimate, 50);

          pricingService.recordOperationCost({
            videoId: context?.videoId,
            sceneId: context?.sceneId,
            model: activeModel,
            inputTokens: tokenCountEstimate,
            outputTokens: 50,
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
      } catch (err: any) {
        console.warn(`Claude Semantic Embedding call failed: ${err.message}.`);
      }
    }

    // 3. Voyage AI Embeddings (Anthropic official embedding partner)
    if (config.provider === 'voyage' && config.apiKey) {
      try {
        const url = config.baseUrl ? `${config.baseUrl.replace(/\/+$/, '')}/embeddings` : 'https://api.voyageai.com/v1/embeddings';
        const modelName = config.modelName || 'voyage-3';
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${config.apiKey}`,
          },
          body: JSON.stringify({
            model: modelName,
            input: text,
            output_dimension: 768,
          }),
        });

        if (res.ok) {
          const data = await res.json();
          let vector: number[] = data.data?.[0]?.embedding || [];
          if (vector.length > 768) vector = this.normalizeVector(vector.slice(0, 768));
          else if (vector.length < 768 && vector.length > 0) {
            const padded = new Array(768).fill(0);
            for (let i = 0; i < vector.length; i++) padded[i] = vector[i];
            vector = this.normalizeVector(padded);
          }

          const latencyMs = Date.now() - start;
          const cost = pricingService.calculateEmbeddingCost(tokenCountEstimate, modelName);
          pricingService.recordOperationCost({
            videoId: context?.videoId,
            sceneId: context?.sceneId,
            model: modelName,
            inputTokens: tokenCountEstimate,
            outputTokens: 0,
            estimatedCost: cost,
            processingTimeMs: latencyMs,
            requestType: 'EMBEDDING',
          });
          return { embedding: vector, dimensions: vector.length, cost, latencyMs };
        }
      } catch (err: any) {
        console.warn(`Voyage AI Embedding call failed: ${err.message}.`);
      }
    }

    // 4. Cohere Embeddings
    if (config.provider === 'cohere' && config.apiKey) {
      try {
        const url = config.baseUrl ? `${config.baseUrl.replace(/\/+$/, '')}/embed` : 'https://api.cohere.com/v1/embed';
        const modelName = config.modelName || 'embed-english-v3.0';
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${config.apiKey}`,
          },
          body: JSON.stringify({
            model: modelName,
            texts: [text],
            input_type: 'search_document',
          }),
        });

        if (res.ok) {
          const data = await res.json();
          let vector: number[] = data.embeddings?.[0] || [];
          if (vector.length > 768) vector = this.normalizeVector(vector.slice(0, 768));
          else if (vector.length < 768 && vector.length > 0) {
            const padded = new Array(768).fill(0);
            for (let i = 0; i < vector.length; i++) padded[i] = vector[i];
            vector = this.normalizeVector(padded);
          }

          const latencyMs = Date.now() - start;
          const cost = pricingService.calculateEmbeddingCost(tokenCountEstimate, modelName);
          pricingService.recordOperationCost({
            videoId: context?.videoId,
            sceneId: context?.sceneId,
            model: modelName,
            inputTokens: tokenCountEstimate,
            outputTokens: 0,
            estimatedCost: cost,
            processingTimeMs: latencyMs,
            requestType: 'EMBEDDING',
          });
          return { embedding: vector, dimensions: vector.length, cost, latencyMs };
        }
      } catch (err: any) {
        console.warn(`Cohere Embedding call failed: ${err.message}.`);
      }
    }

    // 5. Mistral Embeddings
    if (config.provider === 'mistral' && config.apiKey) {
      try {
        const url = config.baseUrl ? `${config.baseUrl.replace(/\/+$/, '')}/embeddings` : 'https://api.mistral.ai/v1/embeddings';
        const modelName = config.modelName || 'mistral-embed';
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${config.apiKey}`,
          },
          body: JSON.stringify({
            model: modelName,
            input: [text],
          }),
        });

        if (res.ok) {
          const data = await res.json();
          let vector: number[] = data.data?.[0]?.embedding || [];
          if (vector.length > 768) vector = this.normalizeVector(vector.slice(0, 768));
          else if (vector.length < 768 && vector.length > 0) {
            const padded = new Array(768).fill(0);
            for (let i = 0; i < vector.length; i++) padded[i] = vector[i];
            vector = this.normalizeVector(padded);
          }

          const latencyMs = Date.now() - start;
          const cost = pricingService.calculateEmbeddingCost(tokenCountEstimate, modelName);
          pricingService.recordOperationCost({
            videoId: context?.videoId,
            sceneId: context?.sceneId,
            model: modelName,
            inputTokens: tokenCountEstimate,
            outputTokens: 0,
            estimatedCost: cost,
            processingTimeMs: latencyMs,
            requestType: 'EMBEDDING',
          });
          return { embedding: vector, dimensions: vector.length, cost, latencyMs };
        }
      } catch (err: any) {
        console.warn(`Mistral Embedding call failed: ${err.message}.`);
      }
    }

    // 6. OpenAI / Ollama / Custom Embeddings
    if ((config.provider === 'openai' || config.provider === 'groq' || config.provider === 'ollama' || config.provider === 'custom') && (config.apiKey || config.provider === 'ollama')) {
      try {
        const url = config.baseUrl
          ? `${config.baseUrl.replace(/\/+$/, '')}/embeddings`
          : config.provider === 'ollama'
          ? 'http://localhost:11434/api/embeddings'
          : 'https://api.openai.com/v1/embeddings';

        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (config.apiKey && config.provider !== 'ollama') {
          headers['Authorization'] = `Bearer ${config.apiKey}`;
        }

        const modelName = config.modelName || (config.provider === 'ollama' ? 'nomic-embed-text' : 'text-embedding-3-small');
        const body = config.provider === 'ollama'
          ? { model: modelName, prompt: text }
          : { model: modelName, input: text, dimensions: 768 };

        const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
        if (res.ok) {
          const data = await res.json();
          let vector: number[] = data.data?.[0]?.embedding || data.embedding || [];
          if (vector.length > 768) {
            vector = this.normalizeVector(vector.slice(0, 768));
          } else if (vector.length < 768 && vector.length > 0) {
            // Pad to 768 if needed
            const padded = new Array(768).fill(0);
            for (let i = 0; i < vector.length; i++) padded[i] = vector[i];
            vector = this.normalizeVector(padded);
          }

          const latencyMs = Date.now() - start;
          const cost = pricingService.calculateEmbeddingCost(tokenCountEstimate, modelName);
          pricingService.recordOperationCost({
            videoId: context?.videoId,
            sceneId: context?.sceneId,
            model: modelName,
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
      } catch (err: any) {
        console.warn(`${config.provider.toUpperCase()} Embedding call failed: ${err.message}.`);
      }
    }

    // High-dimensional Semantic Local Vectorizer Fallback (768 dimensions)
    const vector = this.computeLocalSemanticVector(text, 768);
    const latencyMs = Date.now() - start;
    const cost = pricingService.calculateEmbeddingCost(tokenCountEstimate, 'local-semantic-embedding');

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
  public computeLocalSemanticVector(
    text: string,
    dimensions = 768,
    customWeights?: Record<string, number>
  ): number[] {
    const vec = new Float64Array(dimensions);
    const normalized = text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ');
    const tokens = normalized.split(/\s+/).filter(Boolean);

    // Base semantic keyword boosting categories
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
      ...(customWeights || {}),
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

  public normalizeVector(vec: number[]): number[] {
    let norm = 0;
    for (let i = 0; i < vec.length; i++) {
      norm += vec[i] * vec[i];
    }
    norm = Math.sqrt(norm);
    if (norm > 0) {
      return vec.map((v) => v / norm);
    }
    return vec;
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

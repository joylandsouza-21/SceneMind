import { GoogleGenerativeAI } from '@google/generative-ai';
import { db } from '../db';
import { VectorRecord } from '../db/types';
import { embeddingService } from './embedding.service';
import { vectorService, VectorSearchResult } from './vector.service';
import { aiConfigService, normalizeAnthropicModel } from './ai-config.service';
import { pricingService } from './pricing.service';

export function formatTime(seconds: number): string {
  if (isNaN(seconds) || seconds < 0) return '00:00:00';
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const hh = hrs.toString().padStart(2, '0');
  const mm = mins.toString().padStart(2, '0');
  const ss = secs.toString().padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

export interface QueryExpansionResult {
  originalQuery: string;
  expandedQueries: string[];
  keyEntities: string[];
  keyActions: string[];
  suggestedFocus?: string;
  warning?: string;
}

export interface CandidateSceneWithScore extends VectorSearchResult {
  rrfScore: number;
  lexicalScore: number;
  combinedCandidateScore: number;
}

export interface RerankedSceneResult {
  sceneId: string;
  videoId: string;
  videoName: string;
  videoDuration: number;
  videoStoragePath: string;
  thumbnailUrl: string;
  similarityScore: number;
  confidenceScore: number;
  startTime: number;
  endTime: number;
  verifiedStartTime: number;
  verifiedEndTime: number;
  duration: number;
  description: string;
  actions: string[];
  objects: string[];
  people: string[];
  location: string;
  isVerified: boolean;
  verificationReason: string;
  groupId?: string;
  groupName?: string;
}

async function withAiRetry<T>(fn: () => Promise<T>, maxRetries = 1, delayMs = 1200): Promise<T> {
  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (err: any) {
      attempt++;
      const isTransient =
        err?.message?.includes('503') ||
        err?.message?.includes('429') ||
        err?.message?.includes('high demand') ||
        err?.message?.includes('Resource has been exhausted') ||
        err?.message?.includes('Service Unavailable');
      if (attempt <= maxRetries && isTransient) {
        console.warn(`[AI_RETRY] Attempt ${attempt} hit transient error (${err.message}). Retrying in ${delayMs}ms...`);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        continue;
      }
      throw err;
    }
  }
}

export class SearchService {
  /**
   * Stage 1: AI Query Expansion (Synonyms, Visual Actions, & Entity Extraction)
   */
  public async expandQuery(query: string): Promise<QueryExpansionResult> {
    const trimmed = query.trim();
    if (!trimmed) {
      return {
        originalQuery: '',
        expandedQueries: [],
        keyEntities: [],
        keyActions: [],
      };
    }

    const config = aiConfigService.getEffectiveConfig('semantic_search');
    const startMs = Date.now();

    // 1. Try AI-powered query expansion if API key is configured
    if (config.apiKey) {
      const prompt = `You are a video retrieval and semantic search query expansion engine.
Analyze the user's video search query.
Generate:
1. "expandedQueries": 3-4 distinct search variations capturing the visual scene, actions, synonyms, and descriptive details that an AI video captioner would have written.
2. "keyEntities": Key character names, objects, items, props, or costumes (e.g. ["loki", "tesseract", "cosmic cube", "blue glowing cube"]).
3. "keyActions": Key action verbs and synonyms (e.g. ["holding", "carrying", "gripping", "holding up", "possessing", "clutching"]).
4. "suggestedFocus": Brief 1-sentence description of the visual essence.

User Query: "${trimmed}"

Respond ONLY with valid JSON in this exact structure:
{
  "expandedQueries": ["string", "string", "string"],
  "keyEntities": ["string", "string"],
  "keyActions": ["string", "string"],
  "suggestedFocus": "string"
}`;

      try {
        let textResult = '';
        let inputTokens = 0;
        let outputTokens = 0;

        if (config.provider === 'gemini') {
          const genAI = new GoogleGenerativeAI(config.apiKey);
          const model = genAI.getGenerativeModel({
            model: config.modelName || 'gemini-3.8-flash',
            generationConfig: {
              responseMimeType: 'application/json',
              temperature: 0.2,
            },
          });
          const res = await withAiRetry(() => model.generateContent(prompt));
          textResult = res.response.text();
          const usage = (res.response as any)?.usageMetadata;
          inputTokens = usage?.promptTokenCount ?? Math.ceil(prompt.length / 4);
          outputTokens = usage?.candidatesTokenCount ?? Math.ceil(textResult.length / 4);
        } else if (config.provider === 'anthropic') {
          const url = config.baseUrl ? `${config.baseUrl.replace(/\/+$/, '')}/v1/messages` : 'https://api.anthropic.com/v1/messages';
          const modelId = normalizeAnthropicModel(config.modelName, 'claude-3-5-haiku-20241022');
          const res = await fetch(url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-api-key': config.apiKey,
              'anthropic-version': '2023-06-01',
            },
            body: JSON.stringify({
              model: modelId,
              messages: [{ role: 'user', content: prompt }],
              max_tokens: 400,
              temperature: 0.2,
            }),
          });
          if (res.ok) {
            const data = await res.json();
            textResult = data.content?.[0]?.text || '';
            inputTokens = data.usage?.input_tokens ?? Math.ceil(prompt.length / 4);
            outputTokens = data.usage?.output_tokens ?? Math.ceil(textResult.length / 4);
          }
        }

        if (textResult) {
          const cleaned = textResult.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
          const parsed = JSON.parse(cleaned);

          const expandedList = Array.isArray(parsed.expandedQueries)
            ? [trimmed, ...parsed.expandedQueries.filter((q: string) => q && q.toLowerCase() !== trimmed.toLowerCase())]
            : [trimmed];

          const latencyMs = Date.now() - startMs;
          const modelUsed = config.modelName || config.provider;
          const estimatedCost = pricingService.calculateTextAiCost(modelUsed, inputTokens, outputTokens);

          pricingService.recordOperationCost({
            model: modelUsed,
            inputTokens,
            outputTokens,
            estimatedCost,
            processingTimeMs: latencyMs,
            requestType: 'RERANKING',
          });

          return {
            originalQuery: trimmed,
            expandedQueries: expandedList.slice(0, 4),
            keyEntities: Array.isArray(parsed.keyEntities) ? parsed.keyEntities : [],
            keyActions: Array.isArray(parsed.keyActions) ? parsed.keyActions : [],
            suggestedFocus: parsed.suggestedFocus || trimmed,
          };
        }
      } catch (err: any) {
        console.warn(`[SEARCH_EXPANSION] AI expansion fallback: ${err.message}`);
        const fallback = this.fallbackQueryExpansion(trimmed);
        fallback.warning = `AI expansion warning: ${err.message}`;
        return fallback;
      }
    }

    // 2. Deterministic smart fallback expansion (no API key required)
    return this.fallbackQueryExpansion(trimmed);
  }

  /**
   * Deterministic entity and synonym expansion fallback
   */
  private fallbackQueryExpansion(query: string): QueryExpansionResult {
    const lower = query.toLowerCase();
    const tokens = lower.split(/\s+/).filter((t) => t.length > 2);

    const synonymMap: Record<string, string[]> = {
      holding: ['holding', 'carrying', 'gripping', 'clutching', 'in hands', 'possessing'],
      holds: ['holds', 'carries', 'grips', 'clutches', 'has in hand'],
      tesseract: ['tesseract', 'cosmic cube', 'blue cube', 'glowing cube', 'space stone'],
      fight: ['fighting', 'combat', 'brawling', 'punching', 'attacking', 'battle'],
      fighting: ['fighting', 'combat', 'brawling', 'punching', 'attacking', 'battle'],
      running: ['running', 'sprinting', 'fleeing', 'escaping', 'chasing'],
      talking: ['talking', 'speaking', 'conversation', 'discussing', 'dialogue'],
      driving: ['driving', 'car', 'vehicle', 'cruising', 'automobile'],
      crying: ['crying', 'weeping', 'tears', 'emotional', 'mourning'],
    };

    const expandedPhrases: string[] = [query];
    const keyEntities: string[] = [];
    const keyActions: string[] = [];

    for (const token of tokens) {
      if (synonymMap[token]) {
        if (['holding', 'holds', 'fight', 'fighting', 'running', 'talking', 'driving', 'crying'].includes(token)) {
          keyActions.push(...synonymMap[token]);
        } else {
          keyEntities.push(...synonymMap[token]);
        }
      } else {
        keyEntities.push(token);
      }
    }

    // Generate 2 variations using detected synonyms
    if (lower.includes('tesseract')) {
      expandedPhrases.push(lower.replace('tesseract', 'glowing blue cosmic cube'));
      expandedPhrases.push(lower.replace('tesseract', 'cosmic cube'));
    }
    if (lower.includes('holding')) {
      expandedPhrases.push(lower.replace('holding', 'carrying'));
      expandedPhrases.push(lower.replace('holding', 'clutching'));
    }

    return {
      originalQuery: query,
      expandedQueries: Array.from(new Set(expandedPhrases)).slice(0, 4),
      keyEntities: Array.from(new Set(keyEntities)),
      keyActions: Array.from(new Set(keyActions)),
      suggestedFocus: query,
    };
  }

  /**
   * Stage 2: Broad Hybrid Retrieval (Multi-Query Vector Embeddings + Lexical Keyword Boost)
   */
  public async retrieveCandidates(params: {
    expansion: QueryExpansionResult;
    videoIdFilter?: string | string[];
    candidateLimit?: number;
  }): Promise<CandidateSceneWithScore[]> {
    const candidateLimit = params.candidateLimit || 16;
    const { expandedQueries, keyEntities, keyActions } = params.expansion;

    // 1. Parallel embedding generation for all expanded queries
    const queryEmbeddings = await Promise.all(
      expandedQueries.map(async (q) => {
        try {
          const res = await embeddingService.generateEmbedding(q);
          return { query: q, embedding: res.embedding };
        } catch {
          return null;
        }
      })
    );

    const validEmbeddings = queryEmbeddings.filter(Boolean) as { query: string; embedding: number[] }[];

    // 2. Query vector store across all embeddings
    const searchRuns = await Promise.all(
      validEmbeddings.map(async ({ embedding }) => {
        return await vectorService.search(embedding, 20, params.videoIdFilter, 0.02);
      })
    );

    // 3. Reciprocal Rank Fusion (RRF) & Lexical Keyword Matching
    const candidateMap = new Map<string, { match: VectorSearchResult; rrfScore: number }>();

    searchRuns.forEach((results) => {
      results.forEach((match, rank) => {
        const existing = candidateMap.get(match.sceneId);
        const scoreToAdd = 1.0 / (60 + (rank + 1));
        if (existing) {
          existing.rrfScore += scoreToAdd;
          if (match.similarity > existing.match.similarity) {
            existing.match.similarity = match.similarity;
          }
        } else {
          candidateMap.set(match.sceneId, { match, rrfScore: scoreToAdd });
        }
      });
    });

    const candidates = Array.from(candidateMap.values());

    // 4. Compute Lexical Keyword Boost
    const scoredCandidates: CandidateSceneWithScore[] = candidates.map(({ match, rrfScore }) => {
      let lexicalBoost = 0;
      const descLower = (match.metadata.description || '').toLowerCase();
      const objectsLower = (match.metadata.objects || []).map((o) => o.toLowerCase());
      const actionsLower = (match.metadata.actions || []).map((a) => a.toLowerCase());
      const peopleLower = (match.metadata.people || []).map((p) => p.toLowerCase());

      // Entity keyword matches (+0.15 each)
      for (const entity of keyEntities) {
        const ent = entity.toLowerCase();
        if (objectsLower.some((o) => o.includes(ent)) || descLower.includes(ent)) {
          lexicalBoost += 0.15;
          break;
        }
      }

      // Action keyword matches (+0.12 each)
      for (const action of keyActions) {
        const act = action.toLowerCase();
        if (actionsLower.some((a) => a.includes(act)) || descLower.includes(act)) {
          lexicalBoost += 0.12;
          break;
        }
      }

      // Character name matches (+0.08)
      for (const entity of keyEntities) {
        const ent = entity.toLowerCase();
        if (peopleLower.some((p) => p.includes(ent)) || descLower.includes(ent)) {
          lexicalBoost += 0.08;
          break;
        }
      }

      // Combined score: normalized RRF + Lexical Boost + base cosine similarity
      const combinedCandidateScore = parseFloat((rrfScore * 10 + lexicalBoost + match.similarity).toFixed(4));

      return {
        ...match,
        rrfScore,
        lexicalScore: lexicalBoost,
        combinedCandidateScore,
      };
    });

    // Sort by combined score descending and return top candidates
    scoredCandidates.sort((a, b) => b.combinedCandidateScore - a.combinedCandidateScore);
    return scoredCandidates.slice(0, candidateLimit);
  }

  /**
   * Stage 3: AI Scene Re-Ranking & Exclusion Filter (LLM-as-a-Judge)
   * Discards unrelated false positives and verifies exact action matches.
   */
  public async rerankAndFilter(params: {
    query: string;
    candidates: CandidateSceneWithScore[];
    videoId?: string;
    minConfidenceThreshold?: number;
    onWarning?: (msg: string) => void;
  }): Promise<RerankedSceneResult[]> {
    const { query, candidates } = params;
    if (candidates.length === 0) return [];

    const config = aiConfigService.getEffectiveConfig('timestamp_verification');
    const startMs = Date.now();
    const minThreshold = params.minConfidenceThreshold ?? 40;

    const videos = db.getVideos();
    const videoMap = new Map(videos.map((v) => [v.id, v]));

    // 1. Try AI-powered batch re-ranking if API key is configured
    if (config.apiKey && candidates.length > 0) {
      const candidatesPrompt = candidates
        .map((c, idx) => {
          return `[SCENE ${idx + 1} | ID: ${c.sceneId}]
Time: ${formatTime(c.metadata.startTime)} - ${formatTime(c.metadata.endTime)}
Description: ${c.metadata.description}
Actions: ${(c.metadata.actions || []).join(', ') || 'none'}
Objects: ${(c.metadata.objects || []).join(', ') || 'none'}
People: ${(c.metadata.people || []).join(', ') || 'none'}
`;
        })
        .join('\n');

      const systemPrompt = `You are an expert video clip retrieval re-ranker and scene judge.
User Search Query: "${query}"

Evaluate each candidate scene below.
Determine if the scene ACTUALLY depicts the specific action, object, and characters requested in the query.
Be strict:
- If a scene only contains the character (e.g. Loki is talking in a room) but lacks the requested action/object (e.g. holding the Tesseract / glowing blue cube), mark "match": false and assign "relevanceScore" < 35.
- If the scene DOES show the action (e.g. Loki holding the glowing cube / Tesseract in the desert), mark "match": true and assign "relevanceScore" 80-100.

Candidate Scenes:
${candidatesPrompt}

Respond ONLY with valid JSON array of evaluations:
[
  {
    "sceneId": "string",
    "match": boolean,
    "relevanceScore": number,
    "reason": "1-sentence explanation of why this matches or why it was rejected"
  }
]`;

      try {
        let textResult = '';
        let inputTokens = 0;
        let outputTokens = 0;

        if (config.provider === 'gemini') {
          const genAI = new GoogleGenerativeAI(config.apiKey);
          const model = genAI.getGenerativeModel({
            model: config.modelName || 'gemini-3.8-flash',
            generationConfig: {
              responseMimeType: 'application/json',
              temperature: 0.1,
            },
          });
          const res = await withAiRetry(() => model.generateContent(systemPrompt));
          textResult = res.response.text();
          const usage = (res.response as any)?.usageMetadata;
          inputTokens = usage?.promptTokenCount ?? Math.ceil(systemPrompt.length / 4);
          outputTokens = usage?.candidatesTokenCount ?? Math.ceil(textResult.length / 4);
        } else if (config.provider === 'anthropic') {
          const url = config.baseUrl ? `${config.baseUrl.replace(/\/+$/, '')}/v1/messages` : 'https://api.anthropic.com/v1/messages';
          const modelId = normalizeAnthropicModel(config.modelName, 'claude-3-5-haiku-20241022');
          const res = await fetch(url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-api-key': config.apiKey,
              'anthropic-version': '2023-06-01',
            },
            body: JSON.stringify({
              model: modelId,
              messages: [{ role: 'user', content: systemPrompt }],
              max_tokens: 1000,
              temperature: 0.1,
            }),
          });
          if (res.ok) {
            const data = await res.json();
            textResult = data.content?.[0]?.text || '';
            inputTokens = data.usage?.input_tokens ?? Math.ceil(systemPrompt.length / 4);
            outputTokens = data.usage?.output_tokens ?? Math.ceil(textResult.length / 4);
          }
        }

        if (textResult) {
          const cleaned = textResult.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
          const evaluations: any[] = JSON.parse(cleaned);

          const evalMap = new Map<string, any>();
          for (const ev of evaluations) {
            if (ev.sceneId) evalMap.set(ev.sceneId, ev);
          }

          const latencyMs = Date.now() - startMs;
          const modelUsed = config.modelName || config.provider;
          const estimatedCost = pricingService.calculateTextAiCost(modelUsed, inputTokens, outputTokens);

          pricingService.recordOperationCost({
            videoId: params.videoId,
            model: modelUsed,
            inputTokens,
            outputTokens,
            estimatedCost,
            processingTimeMs: latencyMs,
            requestType: 'RERANKING',
          });

          const rerankedList: RerankedSceneResult[] = [];

          for (const candidate of candidates) {
            const ev = evalMap.get(candidate.sceneId);
            const video = videoMap.get(candidate.videoId);

            // Determine if scene meets relevance criteria
            const isMatch = ev ? ev.match === true : candidate.combinedCandidateScore > 0.35;
            const score = ev ? Math.max(0, Math.min(100, Math.round(ev.relevanceScore || 0))) : Math.round(candidate.similarity * 100);

            // Skip rejected/irrelevant scenes
            if (!isMatch || score < minThreshold) {
              continue;
            }

            // Return the full, complete indexed scene boundaries without sub-cropping
            const verifiedStart = candidate.metadata.startTime;
            const verifiedEnd = candidate.metadata.endTime;

            rerankedList.push({
              sceneId: candidate.sceneId,
              videoId: candidate.videoId,
              videoName: video?.filename || 'Unknown Video',
              videoDuration: video?.duration || 0,
              videoStoragePath: video?.storagePath || '',
              thumbnailUrl: `/api/media/thumbnails/thumb_${video?.id}.jpg`,
              similarityScore: score,
              confidenceScore: score,
              startTime: candidate.metadata.startTime,
              endTime: candidate.metadata.endTime,
              verifiedStartTime: verifiedStart,
              verifiedEndTime: verifiedEnd,
              duration: Math.round((verifiedEnd - verifiedStart) * 10) / 10,
              description: candidate.metadata.description,
              actions: candidate.metadata.actions,
              objects: candidate.metadata.objects,
              people: candidate.metadata.people,
              location: candidate.metadata.location,
              isVerified: true,
              verificationReason: ev?.reason || 'Verified by AI semantic re-ranker.',
              groupId: video?.groupId,
              groupName: video?.groupName,
            });
          }

          // Strictly sort by final match score descending (highest match always first)
          rerankedList.sort((a, b) => b.confidenceScore - a.confidenceScore);

          if (rerankedList.length > 0) {
            return rerankedList;
          }
        }
      } catch (err: any) {
        console.warn(`[SEARCH_RERANKER] AI re-ranking fallback: ${err.message}`);
        if (params.onWarning) {
          params.onWarning(`AI verification fallback: ${err.message}`);
        }
      }
    }

    // 2. Fallback heuristic re-ranking (when AI is offline or returns empty)
    return this.fallbackHeuristicRerank(query, candidates, videoMap);
  }

  /**
   * Deterministic heuristic re-ranking fallback
   */
  private fallbackHeuristicRerank(
    query: string,
    candidates: CandidateSceneWithScore[],
    videoMap: Map<string, any>
  ): RerankedSceneResult[] {
    const queryLower = query.toLowerCase();
    const queryWords = queryLower.split(/\s+/).filter((w) => w.length > 2);

    const scored: RerankedSceneResult[] = candidates.map((candidate) => {
      const video = videoMap.get(candidate.videoId);
      const desc = (candidate.metadata.description || '').toLowerCase();
      const objects = (candidate.metadata.objects || []).map((o) => o.toLowerCase());
      const actions = (candidate.metadata.actions || []).map((a) => a.toLowerCase());
      const people = (candidate.metadata.people || []).map((p) => p.toLowerCase());

      let matchCount = 0;
      for (const w of queryWords) {
        if (desc.includes(w) || objects.some((o) => o.includes(w)) || actions.some((a) => a.includes(w)) || people.some((p) => p.includes(w))) {
          matchCount++;
        }
      }

      const wordMatchRatio = queryWords.length > 0 ? matchCount / queryWords.length : 0.5;
      const confidence = Math.min(99, Math.round(candidate.similarity * 50 + wordMatchRatio * 50));

      return {
        sceneId: candidate.sceneId,
        videoId: candidate.videoId,
        videoName: video?.filename || 'Unknown Video',
        videoDuration: video?.duration || 0,
        videoStoragePath: video?.storagePath || '',
        thumbnailUrl: `/api/media/thumbnails/thumb_${video?.id}.jpg`,
        similarityScore: confidence,
        confidenceScore: confidence,
        startTime: candidate.metadata.startTime,
        endTime: candidate.metadata.endTime,
        verifiedStartTime: candidate.metadata.startTime,
        verifiedEndTime: candidate.metadata.endTime,
        duration: Math.round((candidate.metadata.endTime - candidate.metadata.startTime) * 10) / 10,
        description: candidate.metadata.description,
        actions: candidate.metadata.actions,
        objects: candidate.metadata.objects,
        people: candidate.metadata.people,
        location: candidate.metadata.location,
        isVerified: wordMatchRatio >= 0.5,
        verificationReason: `Matched ${matchCount}/${queryWords.length} key query terms via lexical & vector indexing.`,
        groupId: video?.groupId,
        groupName: video?.groupName,
      };
    });

    scored.sort((a, b) => b.confidenceScore - a.confidenceScore);
    return scored;
  }
}

export const searchService = new SearchService();

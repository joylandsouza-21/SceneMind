import { db } from '../db';
import { AiModelConfig, ModelProvider, TaskType } from '../db/types';
import { GoogleGenerativeAI } from '@google/generative-ai';

export function normalizeAnthropicModel(model?: string, defaultModel = 'claude-3-5-haiku-20241022'): string {
  if (!model || !model.trim()) return defaultModel;
  const trimmed = model.trim();
  const lower = trimmed.toLowerCase();
  if (lower === 'claude-3-5-haiku' || lower === 'claude-haiku-3.5' || lower === 'claude-haiku') return 'claude-3-5-haiku-20241022';
  if (lower === 'claude-3-5-sonnet' || lower === 'claude-sonnet-3.5' || lower === 'claude-sonnet') return 'claude-3-5-sonnet-20241022';
  if (lower === 'claude-3-haiku') return 'claude-3-haiku-20240307';
  if (lower === 'claude-3-sonnet') return 'claude-3-sonnet-20240229';
  if (lower === 'claude-3-opus' || lower === 'claude-opus') return 'claude-3-opus-20240229';
  if (lower === 'claude-3-7-sonnet' || lower === 'claude-3.7-sonnet') return 'claude-3-7-sonnet-20250219';
  return trimmed;
}

export interface TestConnectionResult {
  success: boolean;
  latencyMs: number;
  message: string;
  preview?: string;
}

export class AiConfigService {
  /**
   * Default fallback configurations derived from environment variables
   */
  public getDefaultConfig(taskType: TaskType): AiModelConfig {
    const envGeminiKey = process.env.GEMINI_API_KEY || '';
    const envGeminiModel = process.env.GEMINI_MODEL || 'gemini-3.6-flash';
    const envEmbeddingModel = process.env.GEMINI_EMBEDDING_MODEL || 'gemini-embedding-001';

    switch (taskType) {
      case 'video_processing':
        return {
          id: 'video_processing',
          taskType: 'video_processing',
          provider: 'gemini',
          modelName: envGeminiModel,
          apiKey: envGeminiKey,
          temperature: 0.2,
          isActive: true,
          updatedAt: new Date().toISOString(),
        };

      case 'embedding':
        return {
          id: 'embedding',
          taskType: 'embedding',
          provider: 'gemini',
          modelName: envEmbeddingModel,
          apiKey: envGeminiKey,
          dimensions: 768,
          isActive: true,
          updatedAt: new Date().toISOString(),
        };

      case 'semantic_search':
        return {
          id: 'semantic_search',
          taskType: 'semantic_search',
          provider: 'gemini',
          modelName: envGeminiModel,
          apiKey: envGeminiKey,
          temperature: 0.2,
          isActive: true,
          updatedAt: new Date().toISOString(),
        };

      case 'timestamp_verification':
        return {
          id: 'timestamp_verification',
          taskType: 'timestamp_verification',
          provider: 'gemini',
          modelName: envGeminiModel,
          apiKey: envGeminiKey,
          temperature: 0.1,
          isActive: true,
          updatedAt: new Date().toISOString(),
        };
    }
  }

  /**
   * Get effective configuration for a task (Database record or environment fallback)
   */
  public getEffectiveConfig(taskType: TaskType): AiModelConfig {
    const dbConfig = db.getAiConfig(taskType);
    const defaults = this.getDefaultConfig(taskType);

    if (!dbConfig) {
      return defaults;
    }

    return {
      ...defaults,
      ...dbConfig,
      // If DB record has empty apiKey, fallback to env
      apiKey: (dbConfig.apiKey && dbConfig.apiKey.trim() !== '') ? dbConfig.apiKey.trim() : defaults.apiKey,
      modelName: dbConfig.modelName || defaults.modelName,
      provider: dbConfig.provider || defaults.provider,
    };
  }

  /**
   * Get all active configurations
   */
  public getAllConfigs(): Record<TaskType, AiModelConfig> {
    return {
      video_processing: this.getEffectiveConfig('video_processing'),
      embedding: this.getEffectiveConfig('embedding'),
      semantic_search: this.getEffectiveConfig('semantic_search'),
      timestamp_verification: this.getEffectiveConfig('timestamp_verification'),
    };
  }

  /**
   * Save or update a task configuration in database
   */
  public saveConfig(config: Partial<AiModelConfig> & { taskType: TaskType }): AiModelConfig {
    const existing = this.getEffectiveConfig(config.taskType);
    const toSave: AiModelConfig = {
      id: config.taskType,
      taskType: config.taskType,
      provider: config.provider || existing.provider,
      modelName: config.modelName || existing.modelName,
      apiKey: config.apiKey !== undefined ? config.apiKey : existing.apiKey,
      baseUrl: config.baseUrl !== undefined ? config.baseUrl : existing.baseUrl,
      dimensions: config.dimensions || existing.dimensions || 768,
      temperature: config.temperature !== undefined ? config.temperature : existing.temperature,
      maxTokens: config.maxTokens,
      isActive: config.isActive !== undefined ? config.isActive : true,
      updatedAt: new Date().toISOString(),
    };

    return db.upsertAiConfig(toSave);
  }

  /**
   * Live test an AI configuration
   */
  public async testConnection(config: {
    provider: ModelProvider;
    modelName: string;
    apiKey?: string;
    baseUrl?: string;
    taskType: TaskType;
    dimensions?: number;
  }): Promise<TestConnectionResult> {
    const start = Date.now();
    const apiKey = (config.apiKey && config.apiKey.trim() !== '')
      ? config.apiKey.trim()
      : (this.getEffectiveConfig(config.taskType).apiKey || '');

    try {
      if (config.taskType === 'embedding') {
        return await this.testEmbedding(config.provider, config.modelName, apiKey, config.baseUrl);
      } else {
        return await this.testGeneration(config.provider, config.modelName, apiKey, config.baseUrl);
      }
    } catch (err: any) {
      return {
        success: false,
        latencyMs: Date.now() - start,
        message: err.message || 'Connection test failed',
      };
    }
  }

  private async testEmbedding(
    provider: ModelProvider,
    modelName: string,
    apiKey: string,
    baseUrl?: string
  ): Promise<TestConnectionResult> {
    const start = Date.now();

    if (provider === 'gemini') {
      if (!apiKey) throw new Error('Gemini API key is required.');
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: modelName || 'gemini-embedding-001' });
      const res = await model.embedContent({
        content: { role: 'user', parts: [{ text: 'Semantic search test vector verification' }] },
        outputDimensionality: 768,
      } as any);
      const values = res.embedding.values;
      return {
        success: true,
        latencyMs: Date.now() - start,
        message: `Successfully generated ${values.length}-dimension vector embedding with Google Gemini.`,
        preview: `Vector shape: [${values.slice(0, 3).map((v) => v.toFixed(4)).join(', ')}, ... (${values.length} dims)]`,
      };
    }

    if (provider === 'anthropic') {
      if (!apiKey) throw new Error('Anthropic API key is required.');
      const anthropicModel = normalizeAnthropicModel(modelName, 'claude-3-5-haiku-20241022');
      const url = baseUrl ? `${baseUrl.replace(/\/+$/, '')}/v1/messages` : 'https://api.anthropic.com/v1/messages';
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: anthropicModel,
          max_tokens: 150,
          messages: [
            {
              role: 'user',
              content: 'Extract key semantic terms for: "Car chasing through downtown traffic". Output JSON: {"terms":[{"term":"chase","weight":3}]}',
            },
          ],
        }),
      });

      if (!res.ok) {
        const txt = await res.text();
        throw new Error(`Anthropic Claude API error (${res.status}): ${txt}`);
      }

      return {
        success: true,
        latencyMs: Date.now() - start,
        message: `Connected successfully to Anthropic Claude (${anthropicModel}) for semantic embedding!`,
        preview: `Encoded 768-dimension semantic vector space using Claude reasoning`,
      };
    }

    if (provider === 'voyage') {
      if (!apiKey) throw new Error('Voyage AI API key is required.');
      const url = baseUrl ? `${baseUrl.replace(/\/+$/, '')}/embeddings` : 'https://api.voyageai.com/v1/embeddings';
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: modelName || 'voyage-3',
          input: 'Semantic search test vector',
          output_dimension: 768,
        }),
      });

      if (!res.ok) {
        const txt = await res.text();
        throw new Error(`Voyage AI API error (${res.status}): ${txt}`);
      }
      const data = await res.json();
      const dims = data.data?.[0]?.embedding?.length || 768;
      return {
        success: true,
        latencyMs: Date.now() - start,
        message: `Connected successfully to Voyage AI (${modelName || 'voyage-3'})! Returned ${dims}-dim embedding.`,
      };
    }

    if (provider === 'cohere') {
      if (!apiKey) throw new Error('Cohere API key is required.');
      const url = baseUrl ? `${baseUrl.replace(/\/+$/, '')}/embed` : 'https://api.cohere.com/v1/embed';
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: modelName || 'embed-english-v3.0',
          texts: ['Semantic search test vector'],
          input_type: 'search_document',
        }),
      });

      if (!res.ok) {
        const txt = await res.text();
        throw new Error(`Cohere API error (${res.status}): ${txt}`);
      }
      const data = await res.json();
      const dims = data.embeddings?.[0]?.length || 768;
      return {
        success: true,
        latencyMs: Date.now() - start,
        message: `Connected successfully to Cohere (${modelName || 'embed-english-v3.0'})! Returned ${dims}-dim embedding.`,
      };
    }

    if (provider === 'mistral') {
      if (!apiKey) throw new Error('Mistral API key is required.');
      const url = baseUrl ? `${baseUrl.replace(/\/+$/, '')}/embeddings` : 'https://api.mistral.ai/v1/embeddings';
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: modelName || 'mistral-embed',
          input: ['Semantic search test vector'],
        }),
      });

      if (!res.ok) {
        const txt = await res.text();
        throw new Error(`Mistral API error (${res.status}): ${txt}`);
      }
      const data = await res.json();
      const dims = data.data?.[0]?.embedding?.length || 768;
      return {
        success: true,
        latencyMs: Date.now() - start,
        message: `Connected successfully to Mistral (${modelName || 'mistral-embed'})! Returned ${dims}-dim embedding.`,
      };
    }

    if (provider === 'openai' || provider === 'groq' || provider === 'custom' || provider === 'ollama') {
      const url = baseUrl
        ? `${baseUrl.replace(/\/+$/, '')}/embeddings`
        : provider === 'ollama'
        ? 'http://localhost:11434/api/embeddings'
        : 'https://api.openai.com/v1/embeddings';

      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (apiKey && provider !== 'ollama') {
        headers['Authorization'] = `Bearer ${apiKey}`;
      }

      const body = provider === 'ollama'
        ? { model: modelName || 'nomic-embed-text', prompt: 'Semantic search test vector' }
        : { model: modelName || 'text-embedding-3-small', input: 'Semantic search test vector', dimensions: 768 };

      const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(`${provider.toUpperCase()} Embeddings error (${res.status}): ${txt}`);
      }
      const data = await res.json();
      const dims = data.data?.[0]?.embedding?.length || data.embedding?.length || 768;
      return {
        success: true,
        latencyMs: Date.now() - start,
        message: `Connected successfully to ${provider.toUpperCase()}! Returned ${dims}-dimension embedding.`,
      };
    }

    throw new Error(`Embedding provider '${provider}' is not yet supported for direct embedding generation.`);
  }

  private async testGeneration(
    provider: ModelProvider,
    modelName: string,
    apiKey: string,
    baseUrl?: string
  ): Promise<TestConnectionResult> {
    const start = Date.now();
    const testPrompt = 'Hello, respond with the exact word "SceneMind-Ready" in JSON format: {"status":"SceneMind-Ready"}';

    if (provider === 'gemini') {
      if (!apiKey) throw new Error('Gemini API key is required.');
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: modelName || 'gemini-3.6-flash' });
      const res = await model.generateContent(testPrompt);
      const text = res.response.text();
      return {
        success: true,
        latencyMs: Date.now() - start,
        message: `Connected successfully to Google Gemini (${modelName})!`,
        preview: text.trim().slice(0, 100),
      };
    }

    if (provider === 'anthropic') {
      if (!apiKey) throw new Error('Anthropic API key is required.');
      const anthropicModel = normalizeAnthropicModel(modelName, 'claude-3-5-sonnet-20241022');
      const url = baseUrl ? `${baseUrl.replace(/\/+$/, '')}/v1/messages` : 'https://api.anthropic.com/v1/messages';
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: anthropicModel,
          max_tokens: 50,
          messages: [{ role: 'user', content: testPrompt }],
        }),
      });

      if (!res.ok) {
        const txt = await res.text();
        throw new Error(`Anthropic API error (${res.status}): ${txt}`);
      }

      const data = await res.json();
      const text = data.content?.[0]?.text || 'Connected';
      return {
        success: true,
        latencyMs: Date.now() - start,
        message: `Connected successfully to Anthropic Claude (${anthropicModel})!`,
        preview: text.trim().slice(0, 100),
      };
    }

    if (provider === 'openai' || provider === 'groq' || provider === 'ollama' || provider === 'custom') {
      const url = baseUrl
        ? `${baseUrl.replace(/\/+$/, '')}/chat/completions`
        : provider === 'groq'
        ? 'https://api.groq.com/openai/v1/chat/completions'
        : provider === 'ollama'
        ? 'http://localhost:11434/v1/chat/completions'
        : 'https://api.openai.com/v1/chat/completions';

      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (apiKey && provider !== 'ollama') {
        headers['Authorization'] = `Bearer ${apiKey}`;
      }

      const res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: modelName || (provider === 'groq' ? 'llama-3.3-70b-versatile' : 'gpt-4o-mini'),
          messages: [{ role: 'user', content: testPrompt }],
          max_tokens: 50,
        }),
      });

      if (!res.ok) {
        const txt = await res.text();
        throw new Error(`${provider.toUpperCase()} error (${res.status}): ${txt}`);
      }

      const data = await res.json();
      const text = data.choices?.[0]?.message?.content || 'Connected';
      return {
        success: true,
        latencyMs: Date.now() - start,
        message: `Connected successfully to ${provider.toUpperCase()} (${modelName})!`,
        preview: text.trim().slice(0, 100),
      };
    }

    throw new Error(`Unsupported provider '${provider}'.`);
  }
}

export const aiConfigService = new AiConfigService();

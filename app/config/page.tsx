'use client';

import React, { useState, useEffect } from 'react';
import {
  Settings,
  Key,
  Cpu,
  Database,
  Search,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Eye,
  EyeOff,
  RefreshCw,
  Save,
  Zap,
  Sliders,
  ShieldCheck,
  Server,
} from 'lucide-react';
import { AiModelConfig, ModelProvider, TaskType } from '@/lib/db/types';

interface ConfigState {
  video_processing: AiModelConfig;
  embedding: AiModelConfig;
  semantic_search: AiModelConfig;
  timestamp_verification: AiModelConfig;
}

const DEFAULT_CONFIGS: ConfigState = {
  video_processing: {
    id: 'video_processing',
    taskType: 'video_processing',
    provider: 'gemini',
    modelName: 'gemini-3.6-flash',
    apiKey: '',
    temperature: 0.2,
    isActive: true,
    updatedAt: '',
  },
  embedding: {
    id: 'embedding',
    taskType: 'embedding',
    provider: 'gemini',
    modelName: 'gemini-embedding-001',
    apiKey: '',
    dimensions: 768,
    isActive: true,
    updatedAt: '',
  },
  semantic_search: {
    id: 'semantic_search',
    taskType: 'semantic_search',
    provider: 'gemini',
    modelName: 'gemini-3.6-flash',
    apiKey: '',
    temperature: 0.2,
    isActive: true,
    updatedAt: '',
  },
  timestamp_verification: {
    id: 'timestamp_verification',
    taskType: 'timestamp_verification',
    provider: 'gemini',
    modelName: 'gemini-3.6-flash',
    apiKey: '',
    temperature: 0.1,
    isActive: true,
    updatedAt: '',
  },
};

// Recommended default models per provider
const DEFAULT_PROVIDER_MODELS: Record<ModelProvider, { embedding: string; generation: string; suggestions: string[] }> = {
  gemini: {
    embedding: 'gemini-embedding-001',
    generation: 'gemini-3.6-flash',
    suggestions: ['gemini-3.6-flash', 'gemini-2.5-flash', 'gemini-1.5-pro', 'gemini-embedding-001', 'text-embedding-004'],
  },
  anthropic: {
    embedding: 'claude-3-5-haiku-20241022',
    generation: 'claude-3-5-sonnet-20241022',
    suggestions: ['claude-3-5-haiku-20241022', 'claude-3-5-sonnet-20241022', 'claude-3-haiku-20240307', 'claude-3-7-sonnet-20250219'],
  },
  voyage: {
    embedding: 'voyage-3',
    generation: 'voyage-3',
    suggestions: ['voyage-3', 'voyage-3-lite', 'voyage-code-3', 'voyage-large-2'],
  },
  cohere: {
    embedding: 'embed-english-v3.0',
    generation: 'command-r-plus',
    suggestions: ['embed-english-v3.0', 'embed-multilingual-v3.0', 'command-r-plus', 'command-r'],
  },
  mistral: {
    embedding: 'mistral-embed',
    generation: 'mistral-large-latest',
    suggestions: ['mistral-embed', 'mistral-large-latest', 'mistral-small-latest', 'codestral-latest'],
  },
  openai: {
    embedding: 'text-embedding-3-small',
    generation: 'gpt-4o-mini',
    suggestions: ['text-embedding-3-small', 'text-embedding-3-large', 'gpt-4o', 'gpt-4o-mini', 'gpt-4.5-preview'],
  },
  groq: {
    embedding: 'llama-3.3-70b-versatile',
    generation: 'llama-3.3-70b-versatile',
    suggestions: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'mixtral-8x7b-32768'],
  },
  ollama: {
    embedding: 'nomic-embed-text',
    generation: 'llama3.2',
    suggestions: ['nomic-embed-text', 'bge-m3', 'llama3.2', 'mistral', 'deepseek-r1:8b'],
  },
  custom: {
    embedding: 'custom-embedding-model',
    generation: 'custom-llm-model',
    suggestions: ['custom-embedding-model', 'custom-llm-model'],
  },
};

export default function ConfigPage() {
  const [configs, setConfigs] = useState<ConfigState>(DEFAULT_CONFIGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});
  const [testResults, setTestResults] = useState<Record<string, { loading?: boolean; success?: boolean; message?: string; latencyMs?: number }>>({});
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [activeTab, setActiveTab] = useState<'video' | 'embedding' | 'search' | 'verification' | 'master'>('video');
  const [masterGeminiKey, setMasterGeminiKey] = useState('');

  // Load configs on mount
  useEffect(() => {
    fetchConfigs();
  }, []);

  const fetchConfigs = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/config');
      if (res.ok) {
        const data = await res.json();
        if (data.configs) {
          setConfigs({
            video_processing: data.configs.video_processing || DEFAULT_CONFIGS.video_processing,
            embedding: data.configs.embedding || DEFAULT_CONFIGS.embedding,
            semantic_search: data.configs.semantic_search || DEFAULT_CONFIGS.semantic_search,
            timestamp_verification: data.configs.timestamp_verification || DEFAULT_CONFIGS.timestamp_verification,
          });
          if (data.configs.video_processing?.apiKey) {
            setMasterGeminiKey(data.configs.video_processing.apiKey);
          }
        }
      }
    } catch (err) {
      console.error('Failed to load configs:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleConfigChange = (taskType: TaskType, field: keyof AiModelConfig, value: any) => {
    setConfigs((prev) => ({
      ...prev,
      [taskType]: {
        ...prev[taskType],
        [field]: value,
      },
    }));
  };

  const handleProviderChange = (taskType: TaskType, newProvider: ModelProvider) => {
    const isEmbedding = taskType === 'embedding';
    const defaultModel = isEmbedding
      ? DEFAULT_PROVIDER_MODELS[newProvider]?.embedding || ''
      : DEFAULT_PROVIDER_MODELS[newProvider]?.generation || '';

    setConfigs((prev) => ({
      ...prev,
      [taskType]: {
        ...prev[taskType],
        provider: newProvider,
        modelName: defaultModel,
      },
    }));
  };

  const toggleShowKey = (taskType: string) => {
    setShowKeys((prev) => ({ ...prev, [taskType]: !prev[taskType] }));
  };

  const testConnection = async (taskType: TaskType) => {
    const cfg = configs[taskType];
    setTestResults((prev) => ({
      ...prev,
      [taskType]: { loading: true },
    }));

    try {
      const res = await fetch('/api/config/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taskType,
          provider: cfg.provider,
          modelName: cfg.modelName,
          apiKey: cfg.apiKey,
          baseUrl: cfg.baseUrl,
          dimensions: cfg.dimensions,
        }),
      });

      const data = await res.json();
      setTestResults((prev) => ({
        ...prev,
        [taskType]: {
          loading: false,
          success: data.success,
          message: data.message,
          latencyMs: data.latencyMs,
        },
      }));
    } catch (err: any) {
      setTestResults((prev) => ({
        ...prev,
        [taskType]: {
          loading: false,
          success: false,
          message: err.message || 'Connection test failed',
        },
      }));
    }
  };

  const saveAllConfigs = async () => {
    setSaving(true);
    setSaveSuccess(false);
    try {
      const configArray = Object.values(configs);
      const res = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ configs: configArray }),
      });

      if (res.ok) {
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 4000);
      }
    } catch (err) {
      console.error('Failed to save configs:', err);
    } finally {
      setSaving(false);
    }
  };

  const applyMasterKeyToGeminiTasks = () => {
    if (!masterGeminiKey.trim()) return;
    setConfigs((prev) => ({
      ...prev,
      video_processing: { ...prev.video_processing, apiKey: masterGeminiKey.trim() },
      embedding: prev.embedding.provider === 'gemini' ? { ...prev.embedding, apiKey: masterGeminiKey.trim() } : prev.embedding,
      semantic_search: prev.semantic_search.provider === 'gemini' ? { ...prev.semantic_search, apiKey: masterGeminiKey.trim() } : prev.semantic_search,
      timestamp_verification: prev.timestamp_verification.provider === 'gemini' ? { ...prev.timestamp_verification, apiKey: masterGeminiKey.trim() } : prev.timestamp_verification,
    }));
  };

  if (loading) {
    return (
      <div className="min-h-screen pt-24 pb-12 flex items-center justify-center bg-[#080c14] text-slate-300">
        <div className="flex flex-col items-center space-y-4">
          <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
          <p className="text-sm text-slate-400">Loading AI model settings...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pt-20 pb-16 bg-[#080c14] text-slate-200">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Page Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between py-6 border-b border-slate-800/80 mb-8 gap-4">
          <div>
            <div className="flex items-center space-x-3">
              <div className="p-2 rounded-xl bg-blue-500/10 border border-blue-500/30 text-blue-400">
                <Settings className="w-6 h-6" />
              </div>
              <h1 className="text-2xl font-bold tracking-tight bg-gradient-to-r from-white via-slate-100 to-slate-400 bg-clip-text text-transparent">
                AI Model & API Configuration
              </h1>
            </div>
            <p className="text-sm text-slate-400 mt-1 ml-11">
              Configure models and API keys for video analysis, vector embeddings, and semantic reasoning with hot-reloading.
            </p>
          </div>

          <div className="flex items-center space-x-3">
            <button
              onClick={fetchConfigs}
              className="p-2.5 rounded-lg border border-slate-700 bg-slate-800/40 text-slate-300 hover:text-white hover:bg-slate-800 transition"
              title="Refresh configurations"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
            <button
              onClick={saveAllConfigs}
              disabled={saving}
              className="flex items-center space-x-2 px-5 py-2.5 rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-medium text-sm shadow-lg shadow-blue-500/20 transition-all disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              <span>{saving ? 'Saving...' : 'Save All Settings'}</span>
            </button>
          </div>
        </div>

        {/* Success Alert */}
        {saveSuccess && (
          <div className="mb-6 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 flex items-center space-x-3 animate-fade-in">
            <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
            <span className="text-sm font-medium">All AI configurations and API keys saved successfully! Active services updated instantly.</span>
          </div>
        )}

        {/* Navigation Tabs */}
        <div className="flex flex-wrap gap-2 p-1.5 rounded-xl bg-slate-900/60 border border-slate-800 mb-8 backdrop-blur-sm">
          <button
            onClick={() => setActiveTab('video')}
            className={`flex items-center space-x-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
              activeTab === 'video'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }`}
          >
            <Cpu className="w-4 h-4" />
            <span>Video Processing</span>
            <span className="text-[10px] bg-blue-400/20 text-blue-300 px-1.5 py-0.5 rounded ml-1 font-mono">Gemini</span>
          </button>

          <button
            onClick={() => setActiveTab('embedding')}
            className={`flex items-center space-x-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
              activeTab === 'embedding'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-500/20'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }`}
          >
            <Database className="w-4 h-4" />
            <span>Vector Embeddings</span>
            <span className="text-[10px] bg-slate-700 text-slate-300 px-1.5 py-0.5 rounded ml-1">Multi-Provider</span>
          </button>

          <button
            onClick={() => setActiveTab('search')}
            className={`flex items-center space-x-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
              activeTab === 'search'
                ? 'bg-purple-600 text-white shadow-md shadow-purple-500/20'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }`}
          >
            <Search className="w-4 h-4" />
            <span>Semantic Search</span>
            <span className="text-[10px] bg-slate-700 text-slate-300 px-1.5 py-0.5 rounded ml-1">LLM Reasoning</span>
          </button>

          <button
            onClick={() => setActiveTab('verification')}
            className={`flex items-center space-x-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
              activeTab === 'verification'
                ? 'bg-cyan-600 text-white shadow-md shadow-cyan-500/20'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }`}
          >
            <Sliders className="w-4 h-4" />
            <span>Timestamp Verification</span>
          </button>

          <button
            onClick={() => setActiveTab('master')}
            className={`flex items-center space-x-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
              activeTab === 'master'
                ? 'bg-amber-600 text-white shadow-md shadow-amber-500/20'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }`}
          >
            <Key className="w-4 h-4" />
            <span>Quick Key Sync</span>
          </button>
        </div>

        {/* Tab 1: Video Processing Model */}
        {activeTab === 'video' && (
          <div className="space-y-6 animate-fade-in">
            <div className="p-6 rounded-2xl bg-gradient-to-b from-slate-900/80 to-[#0c121e] border border-slate-800/80 shadow-xl backdrop-blur-md">
              <div className="flex items-start justify-between mb-6">
                <div>
                  <div className="flex items-center space-x-2">
                    <span className="text-xs font-semibold uppercase tracking-wider text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded border border-blue-500/20">
                      Core Pipeline
                    </span>
                    <h2 className="text-lg font-bold text-white">Video Multimodal Analysis & Scene Detection</h2>
                  </div>
                  <p className="text-sm text-slate-400 mt-1">
                    Extracts chronological scenes, object tags, physical actions, and narrative descriptions directly from video frames.
                  </p>
                </div>
                <div className="p-3 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20">
                  <Cpu className="w-6 h-6" />
                </div>
              </div>

              {/* Notice Banner */}
              <div className="p-4 rounded-xl bg-blue-950/30 border border-blue-800/40 text-blue-200 text-xs flex items-center space-x-3 mb-6">
                <ShieldCheck className="w-5 h-5 text-blue-400 flex-shrink-0" />
                <div>
                  <strong className="text-blue-300">Google Gemini Multimodal Video Engine:</strong> Video processing requires Gemini's File API to perform native frame-level visual reasoning. Gemini models like <code className="bg-blue-900/40 px-1 py-0.5 rounded">gemini-3.6-flash</code> or <code className="bg-blue-900/40 px-1 py-0.5 rounded">gemini-2.5-flash</code> are supported.
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* 1. Provider (Dropdown) */}
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                    Select Provider
                  </label>
                  <select
                    value={configs.video_processing.provider}
                    onChange={(e) => handleProviderChange('video_processing', e.target.value as ModelProvider)}
                    className="w-full px-4 py-3 rounded-xl bg-slate-950 border border-slate-700 text-white font-medium text-sm focus:border-blue-500 focus:outline-none"
                  >
                    <option value="gemini">Google Gemini (Fixed Multimodal Engine)</option>
                  </select>
                </div>

                {/* 2. Model Name (Input) */}
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                    Model Name
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. gemini-3.6-flash or gemini-2.5-flash"
                    value={configs.video_processing.modelName}
                    onChange={(e) => handleConfigChange('video_processing', 'modelName', e.target.value)}
                    className="w-full px-4 py-3 rounded-xl bg-slate-950 border border-slate-700 text-white font-mono text-sm focus:border-blue-500 focus:outline-none"
                  />
                  {/* Suggestion Badges */}
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {['gemini-3.6-flash', 'gemini-2.5-flash', 'gemini-1.5-pro'].map((sug) => (
                      <button
                        key={sug}
                        type="button"
                        onClick={() => handleConfigChange('video_processing', 'modelName', sug)}
                        className={`text-[11px] px-2 py-0.5 rounded border transition ${
                          configs.video_processing.modelName === sug
                            ? 'bg-blue-600/30 text-blue-300 border-blue-500/40 font-semibold'
                            : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200'
                        }`}
                      >
                        {sug}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 3. API Key (Input) */}
                <div className="md:col-span-2">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                    Google Gemini API Key
                  </label>
                  <div className="relative">
                    <input
                      type={showKeys.video_processing ? 'text' : 'password'}
                      placeholder="Enter your Gemini API key (AQ.Ab8...)"
                      value={configs.video_processing.apiKey || ''}
                      onChange={(e) => handleConfigChange('video_processing', 'apiKey', e.target.value)}
                      className="w-full pl-4 pr-12 py-3 rounded-xl bg-slate-950 border border-slate-700 text-white font-mono text-sm focus:border-blue-500 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => toggleShowKey('video_processing')}
                      className="absolute right-3 top-3.5 text-slate-400 hover:text-white"
                    >
                      {showKeys.video_processing ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              </div>

              {/* Test Connection Button & Output */}
              <div className="mt-6 pt-6 border-t border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <button
                  type="button"
                  onClick={() => testConnection('video_processing')}
                  disabled={testResults.video_processing?.loading}
                  className="flex items-center space-x-2 px-4 py-2 rounded-lg border border-blue-500/30 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 text-xs font-semibold transition"
                >
                  {testResults.video_processing?.loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
                  <span>Test Gemini API Connection</span>
                </button>

                {testResults.video_processing && !testResults.video_processing.loading && (
                  <div
                    className={`text-xs px-3 py-1.5 rounded-lg border flex items-center space-x-2 ${
                      testResults.video_processing.success
                        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                        : 'bg-rose-500/10 border-rose-500/30 text-rose-400'
                    }`}
                  >
                    {testResults.video_processing.success ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertCircle className="w-3.5 h-3.5" />}
                    <span>
                      {testResults.video_processing.message}{' '}
                      {testResults.video_processing.latencyMs && `(${testResults.video_processing.latencyMs}ms)`}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: Embedding Model */}
        {activeTab === 'embedding' && (
          <div className="space-y-6 animate-fade-in">
            <div className="p-6 rounded-2xl bg-gradient-to-b from-slate-900/80 to-[#0c121e] border border-slate-800/80 shadow-xl backdrop-blur-md">
              <div className="flex items-start justify-between mb-6">
                <div>
                  <div className="flex items-center space-x-2">
                    <span className="text-xs font-semibold uppercase tracking-wider text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded border border-indigo-500/20">
                      Vector Indexing
                    </span>
                    <h2 className="text-lg font-bold text-white">Scene Vector Embedding Model</h2>
                  </div>
                  <p className="text-sm text-slate-400 mt-1">
                    Converts visual scene descriptions into 768-dimensional dense vectors stored in PostgreSQL <code className="text-indigo-300">pgvector</code>.
                  </p>
                </div>
                <div className="p-3 rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                  <Database className="w-6 h-6" />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* 1. Provider (Dropdown) */}
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                    Select Provider
                  </label>
                  <select
                    value={configs.embedding.provider}
                    onChange={(e) => handleProviderChange('embedding', e.target.value as ModelProvider)}
                    className="w-full px-4 py-3 rounded-xl bg-slate-950 border border-slate-700 text-white font-medium text-sm focus:border-indigo-500 focus:outline-none"
                  >
                    <option value="voyage">Voyage AI (Anthropic Partner / voyage-3)</option>
                    <option value="gemini">Google Gemini (gemini-embedding-001 / text-embedding-004)</option>
                    <option value="openai">OpenAI (text-embedding-3-small / text-embedding-3-large)</option>
                    <option value="cohere">Cohere (embed-english-v3.0 / embed-multilingual)</option>
                    <option value="mistral">Mistral AI (mistral-embed)</option>
                    <option value="ollama">Ollama Local (nomic-embed-text / bge-m3)</option>
                    <option value="custom">Custom / OpenAI-Compatible Proxy</option>
                  </select>
                </div>

                {/* 2. Model Name (Input) */}
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                    Model Name
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. claude-3-5-haiku-20241022 or voyage-3"
                    value={configs.embedding.modelName}
                    onChange={(e) => handleConfigChange('embedding', 'modelName', e.target.value)}
                    className="w-full px-4 py-3 rounded-xl bg-slate-950 border border-slate-700 text-white font-mono text-sm focus:border-indigo-500 focus:outline-none"
                  />
                  {/* Suggestion Badges */}
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {(DEFAULT_PROVIDER_MODELS[configs.embedding.provider]?.suggestions || []).map((sug) => (
                      <button
                        key={sug}
                        type="button"
                        onClick={() => handleConfigChange('embedding', 'modelName', sug)}
                        className={`text-[11px] px-2 py-0.5 rounded border transition ${
                          configs.embedding.modelName === sug
                            ? 'bg-indigo-600/30 text-indigo-300 border-indigo-500/40 font-semibold'
                            : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200'
                        }`}
                      >
                        {sug}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 3. API Key (Input) */}
                {configs.embedding.provider !== 'ollama' && (
                  <div className="md:col-span-2">
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                      {configs.embedding.provider === 'anthropic'
                        ? 'Anthropic Claude API Key (sk-ant-...)'
                        : `${configs.embedding.provider.toUpperCase()} API Key`}
                    </label>
                    <div className="relative">
                      <input
                        type={showKeys.embedding ? 'text' : 'password'}
                        placeholder={`Enter ${configs.embedding.provider} API key...`}
                        value={configs.embedding.apiKey || ''}
                        onChange={(e) => handleConfigChange('embedding', 'apiKey', e.target.value)}
                        className="w-full pl-4 pr-12 py-3 rounded-xl bg-slate-950 border border-slate-700 text-white font-mono text-sm focus:border-indigo-500 focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => toggleShowKey('embedding')}
                        className="absolute right-3 top-3.5 text-slate-400 hover:text-white"
                      >
                        {showKeys.embedding ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                )}

                {/* 4. Base URL (Conditional Input) */}
                {(configs.embedding.provider === 'ollama' || configs.embedding.provider === 'custom') && (
                  <div className="md:col-span-2">
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                      Endpoint Base URL (Optional)
                    </label>
                    <input
                      type="text"
                      placeholder={configs.embedding.provider === 'ollama' ? 'http://localhost:11434' : 'https://your-proxy.com/v1'}
                      value={configs.embedding.baseUrl || ''}
                      onChange={(e) => handleConfigChange('embedding', 'baseUrl', e.target.value)}
                      className="w-full px-4 py-3 rounded-xl bg-slate-950 border border-slate-700 text-white font-mono text-sm focus:border-indigo-500 focus:outline-none"
                    />
                  </div>
                )}

                {/* Dimensions Info (Protected 768) */}
                <div className="md:col-span-2">
                  <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 text-xs text-slate-400 flex items-center justify-between">
                    <span>
                      Vector Output Space: <strong className="text-indigo-400">768 floats</strong> (Enforced unit vector for pgvector compatibility)
                    </span>
                    <span className="text-[10px] bg-indigo-500/20 text-indigo-300 px-2 py-0.5 rounded font-mono">
                      vector(768)
                    </span>
                  </div>
                </div>
              </div>

              {/* Test Button */}
              <div className="mt-6 pt-6 border-t border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <button
                  type="button"
                  onClick={() => testConnection('embedding')}
                  disabled={testResults.embedding?.loading}
                  className="flex items-center space-x-2 px-4 py-2 rounded-lg border border-indigo-500/30 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 text-xs font-semibold transition"
                >
                  {testResults.embedding?.loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
                  <span>Test Embedding Generation</span>
                </button>

                {testResults.embedding && !testResults.embedding.loading && (
                  <div
                    className={`text-xs px-3 py-1.5 rounded-lg border flex items-center space-x-2 ${
                      testResults.embedding.success
                        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                        : 'bg-rose-500/10 border-rose-500/30 text-rose-400'
                    }`}
                  >
                    {testResults.embedding.success ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertCircle className="w-3.5 h-3.5" />}
                    <span>
                      {testResults.embedding.message}{' '}
                      {testResults.embedding.latencyMs && `(${testResults.embedding.latencyMs}ms)`}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Tab 3: Semantic Search Reasoning */}
        {activeTab === 'search' && (
          <div className="space-y-6 animate-fade-in">
            <div className="p-6 rounded-2xl bg-gradient-to-b from-slate-900/80 to-[#0c121e] border border-slate-800/80 shadow-xl backdrop-blur-md">
              <div className="flex items-start justify-between mb-6">
                <div>
                  <div className="flex items-center space-x-2">
                    <span className="text-xs font-semibold uppercase tracking-wider text-purple-400 bg-purple-500/10 px-2 py-0.5 rounded border border-purple-500/20">
                      Query Reasoning
                    </span>
                    <h2 className="text-lg font-bold text-white">Semantic Search & Multi-Segment Reasoning Model</h2>
                  </div>
                  <p className="text-sm text-slate-400 mt-1">
                    Understands complex conversational queries, splits multi-scene prompts, and re-ranks visual relevance.
                  </p>
                </div>
                <div className="p-3 rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/20">
                  <Search className="w-6 h-6" />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* 1. Provider (Dropdown) */}
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                    Select Provider
                  </label>
                  <select
                    value={configs.semantic_search.provider}
                    onChange={(e) => handleProviderChange('semantic_search', e.target.value as ModelProvider)}
                    className="w-full px-4 py-3 rounded-xl bg-slate-950 border border-slate-700 text-white font-medium text-sm focus:border-purple-500 focus:outline-none"
                  >
                    <option value="gemini">Google Gemini</option>
                    <option value="anthropic">Anthropic Claude</option>
                    <option value="openai">OpenAI</option>
                    <option value="groq">Groq (Ultra-Low Latency)</option>
                    <option value="mistral">Mistral AI</option>
                    <option value="cohere">Cohere</option>
                    <option value="ollama">Ollama Local</option>
                    <option value="custom">Custom Endpoint</option>
                  </select>
                </div>

                {/* 2. Model Name (Input) */}
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                    Model Name
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. claude-3-5-sonnet-20241022 or gpt-4o-mini"
                    value={configs.semantic_search.modelName}
                    onChange={(e) => handleConfigChange('semantic_search', 'modelName', e.target.value)}
                    className="w-full px-4 py-3 rounded-xl bg-slate-950 border border-slate-700 text-white font-mono text-sm focus:border-purple-500 focus:outline-none"
                  />
                  {/* Suggestion Badges */}
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {(DEFAULT_PROVIDER_MODELS[configs.semantic_search.provider]?.suggestions || []).map((sug) => (
                      <button
                        key={sug}
                        type="button"
                        onClick={() => handleConfigChange('semantic_search', 'modelName', sug)}
                        className={`text-[11px] px-2 py-0.5 rounded border transition ${
                          configs.semantic_search.modelName === sug
                            ? 'bg-purple-600/30 text-purple-300 border-purple-500/40 font-semibold'
                            : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200'
                        }`}
                      >
                        {sug}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 3. API Key (Input) */}
                {configs.semantic_search.provider !== 'ollama' && (
                  <div className="md:col-span-2">
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                      {configs.semantic_search.provider.toUpperCase()} API Key
                    </label>
                    <div className="relative">
                      <input
                        type={showKeys.semantic_search ? 'text' : 'password'}
                        placeholder={`Enter ${configs.semantic_search.provider} API key...`}
                        value={configs.semantic_search.apiKey || ''}
                        onChange={(e) => handleConfigChange('semantic_search', 'apiKey', e.target.value)}
                        className="w-full pl-4 pr-12 py-3 rounded-xl bg-slate-950 border border-slate-700 text-white font-mono text-sm focus:border-purple-500 focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => toggleShowKey('semantic_search')}
                        className="absolute right-3 top-3.5 text-slate-400 hover:text-white"
                      >
                        {showKeys.semantic_search ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                )}

                {/* 4. Base URL (Conditional Input) */}
                {(configs.semantic_search.provider === 'ollama' || configs.semantic_search.provider === 'custom' || configs.semantic_search.provider === 'groq') && (
                  <div className="md:col-span-2">
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                      Custom Endpoint Base URL (Optional)
                    </label>
                    <input
                      type="text"
                      placeholder={configs.semantic_search.provider === 'ollama' ? 'http://localhost:11434' : 'https://api.groq.com/openai/v1'}
                      value={configs.semantic_search.baseUrl || ''}
                      onChange={(e) => handleConfigChange('semantic_search', 'baseUrl', e.target.value)}
                      className="w-full px-4 py-3 rounded-xl bg-slate-950 border border-slate-700 text-white font-mono text-sm focus:border-purple-500 focus:outline-none"
                    />
                  </div>
                )}
              </div>

              {/* Test Button */}
              <div className="mt-6 pt-6 border-t border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <button
                  type="button"
                  onClick={() => testConnection('semantic_search')}
                  disabled={testResults.semantic_search?.loading}
                  className="flex items-center space-x-2 px-4 py-2 rounded-lg border border-purple-500/30 bg-purple-500/10 hover:bg-purple-500/20 text-purple-400 text-xs font-semibold transition"
                >
                  {testResults.semantic_search?.loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
                  <span>Test Semantic LLM Reasoning</span>
                </button>

                {testResults.semantic_search && !testResults.semantic_search.loading && (
                  <div
                    className={`text-xs px-3 py-1.5 rounded-lg border flex items-center space-x-2 ${
                      testResults.semantic_search.success
                        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                        : 'bg-rose-500/10 border-rose-500/30 text-rose-400'
                    }`}
                  >
                    {testResults.semantic_search.success ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertCircle className="w-3.5 h-3.5" />}
                    <span>
                      {testResults.semantic_search.message}{' '}
                      {testResults.semantic_search.latencyMs && `(${testResults.semantic_search.latencyMs}ms)`}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Tab 4: Timestamp Verification */}
        {activeTab === 'verification' && (
          <div className="space-y-6 animate-fade-in">
            <div className="p-6 rounded-2xl bg-gradient-to-b from-slate-900/80 to-[#0c121e] border border-slate-800/80 shadow-xl backdrop-blur-md">
              <div className="flex items-start justify-between mb-6">
                <div>
                  <div className="flex items-center space-x-2">
                    <span className="text-xs font-semibold uppercase tracking-wider text-cyan-400 bg-cyan-500/10 px-2 py-0.5 rounded border border-cyan-500/20">
                      Sub-Second Precision
                    </span>
                    <h2 className="text-lg font-bold text-white">Timestamp Verification & Fine Slicing Model</h2>
                  </div>
                  <p className="text-sm text-slate-400 mt-1">
                    Refines candidate scene start/end boundaries before automatic sub-clip rendering and trimming.
                  </p>
                </div>
                <div className="p-3 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                  <Sliders className="w-6 h-6" />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* 1. Provider (Dropdown) */}
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                    Select Provider
                  </label>
                  <select
                    value={configs.timestamp_verification.provider}
                    onChange={(e) => handleProviderChange('timestamp_verification', e.target.value as ModelProvider)}
                    className="w-full px-4 py-3 rounded-xl bg-slate-950 border border-slate-700 text-white font-medium text-sm focus:border-cyan-500 focus:outline-none"
                  >
                    <option value="gemini">Google Gemini</option>
                    <option value="anthropic">Anthropic Claude</option>
                    <option value="openai">OpenAI</option>
                    <option value="groq">Groq</option>
                    <option value="mistral">Mistral</option>
                    <option value="ollama">Ollama Local</option>
                    <option value="custom">Custom Endpoint</option>
                  </select>
                </div>

                {/* 2. Model Name (Input) */}
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                    Model Name
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. claude-3-5-sonnet-20241022 or gpt-4o-mini"
                    value={configs.timestamp_verification.modelName}
                    onChange={(e) => handleConfigChange('timestamp_verification', 'modelName', e.target.value)}
                    className="w-full px-4 py-3 rounded-xl bg-slate-950 border border-slate-700 text-white font-mono text-sm focus:border-cyan-500 focus:outline-none"
                  />
                  {/* Suggestion Badges */}
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {(DEFAULT_PROVIDER_MODELS[configs.timestamp_verification.provider]?.suggestions || []).map((sug) => (
                      <button
                        key={sug}
                        type="button"
                        onClick={() => handleConfigChange('timestamp_verification', 'modelName', sug)}
                        className={`text-[11px] px-2 py-0.5 rounded border transition ${
                          configs.timestamp_verification.modelName === sug
                            ? 'bg-cyan-600/30 text-cyan-300 border-cyan-500/40 font-semibold'
                            : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200'
                        }`}
                      >
                        {sug}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 3. API Key (Input) */}
                <div className="md:col-span-2">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                    API Key
                  </label>
                  <div className="relative">
                    <input
                      type={showKeys.timestamp_verification ? 'text' : 'password'}
                      placeholder="Leave blank to reuse default provider key..."
                      value={configs.timestamp_verification.apiKey || ''}
                      onChange={(e) => handleConfigChange('timestamp_verification', 'apiKey', e.target.value)}
                      className="w-full pl-4 pr-12 py-3 rounded-xl bg-slate-950 border border-slate-700 text-white font-mono text-sm focus:border-cyan-500 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => toggleShowKey('timestamp_verification')}
                      className="absolute right-3 top-3.5 text-slate-400 hover:text-white"
                    >
                      {showKeys.timestamp_verification ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              </div>

              {/* Test Button */}
              <div className="mt-6 pt-6 border-t border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <button
                  type="button"
                  onClick={() => testConnection('timestamp_verification')}
                  disabled={testResults.timestamp_verification?.loading}
                  className="flex items-center space-x-2 px-4 py-2 rounded-lg border border-cyan-500/30 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 text-xs font-semibold transition"
                >
                  {testResults.timestamp_verification?.loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
                  <span>Test Verification Model</span>
                </button>

                {testResults.timestamp_verification && !testResults.timestamp_verification.loading && (
                  <div
                    className={`text-xs px-3 py-1.5 rounded-lg border flex items-center space-x-2 ${
                      testResults.timestamp_verification.success
                        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                        : 'bg-rose-500/10 border-rose-500/30 text-rose-400'
                    }`}
                  >
                    {testResults.timestamp_verification.success ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertCircle className="w-3.5 h-3.5" />}
                    <span>
                      {testResults.timestamp_verification.message}{' '}
                      {testResults.timestamp_verification.latencyMs && `(${testResults.timestamp_verification.latencyMs}ms)`}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Tab 5: Master Key Sync */}
        {activeTab === 'master' && (
          <div className="space-y-6 animate-fade-in">
            <div className="p-6 rounded-2xl bg-gradient-to-b from-slate-900/80 to-[#0c121e] border border-slate-800/80 shadow-xl backdrop-blur-md">
              <div className="flex items-start justify-between mb-6">
                <div>
                  <div className="flex items-center space-x-2">
                    <span className="text-xs font-semibold uppercase tracking-wider text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                      Quick Setup
                    </span>
                    <h2 className="text-lg font-bold text-white">One-Click Master Gemini Key Sync</h2>
                  </div>
                  <p className="text-sm text-slate-400 mt-1">
                    Paste a single Google Gemini API key to automatically apply it across Video Processing, Embeddings, Search, and Verification.
                  </p>
                </div>
                <div className="p-3 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
                  <Key className="w-6 h-6" />
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                    Master Google Gemini API Key
                  </label>
                  <input
                    type="password"
                    placeholder="AQ.Ab8RN6J..."
                    value={masterGeminiKey}
                    onChange={(e) => setMasterGeminiKey(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl bg-slate-950 border border-slate-700 text-white font-mono text-sm focus:border-amber-500 focus:outline-none"
                  />
                </div>

                <div className="flex items-center space-x-3 pt-2">
                  <button
                    type="button"
                    onClick={applyMasterKeyToGeminiTasks}
                    className="px-5 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-sm font-semibold transition shadow-lg shadow-amber-500/20"
                  >
                    Propagate to All Gemini Tasks
                  </button>
                  <button
                    type="button"
                    onClick={saveAllConfigs}
                    disabled={saving}
                    className="px-5 py-2.5 rounded-xl bg-blue-600 hover:from-blue-500 hover:to-indigo-500 text-white text-sm font-semibold transition"
                  >
                    Save Changes
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

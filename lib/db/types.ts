export interface VideoGroup {
  id: string;
  name: string;
  description?: string;
  color?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Video {
  id: string;
  filename: string;
  originalName: string;
  storagePath: string;
  duration: number;
  width: number;
  height: number;
  fps: number;
  format: string;
  sizeBytes: number;
  status: 'pending' | 'processing' | 'indexed' | 'failed' | 'cancelled';
  processingProgress: number;
  groupId?: string;
  groupName?: string;
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
}

export interface VideoScene {
  id: string;
  videoId: string;
  sceneNumber: number;
  startTime: number;
  endTime: number;
  duration: number;
  description: string;
  actions: string[];
  objects: string[];
  people: string[];
  location: string;
  events: string[];
  confidence: number;
  embeddingId: string;
  createdAt: string;
}

export interface VideoSearch {
  id: string;
  name?: string;
  videoId?: string;
  groupId?: string;
  groupName?: string;
  query: string;
  resultCount: number;
  results?: any[];
  segments?: any[];
  isSegmented?: boolean;
  partSavedPrompts?: Record<string, any[]>;
  createdAt: string;
}


export interface VideoClip {
  id: string;
  videoId: string;
  sceneId?: string;
  query?: string;
  startTime: number;
  endTime: number;
  duration: number;
  outputPath: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  errorMessage?: string;
  createdAt: string;
}

export type JobType =
  | 'VIDEO_UPLOAD'
  | 'VIDEO_METADATA'
  | 'VIDEO_ANALYSIS'
  | 'SCENE_SEGMENTATION'
  | 'DESCRIPTION_GENERATION'
  | 'EMBEDDING_GENERATION'
  | 'INDEX_FINALIZATION'
  | 'CLIP_GENERATION';

export type JobStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled' | 'retrying';

export interface ProcessingJob {
  id: string;
  videoId: string;
  jobType: JobType;
  status: JobStatus;
  progress: number;
  currentStep: string;
  totalSteps: number;
  retryCount: number;
  error?: string;
  logs?: string[];
  createdAt: string;
  updatedAt: string;
}

export type CostOperation =
  | 'QUERY_EXPANSION'
  | 'PROMPT_SEGMENTATION'
  | 'QUERY_EMBEDDING'
  | 'RESULT_VERIFICATION';

export interface AiCost {
  id: string;
  videoId?: string;
  sceneId?: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  estimatedCost: number;
  processingTimeMs: number;
  requestType: 'SCENE_ANALYSIS' | 'EMBEDDING' | 'TIMESTAMP_VERIFICATION' | 'RERANKING';
  /** Finer-grained step label (only on logs recorded after search cost tracking was added) */
  operation?: CostOperation;
  /** Search this cost belongs to (only on newer logs) */
  searchId?: string;
  /** Search text at the time of the search (kept even if the search isn't saved to history) */
  searchQuery?: string;
  /** Video the search was limited to, if any */
  scopeVideoId?: string;
  createdAt: string;
}

export interface VectorRecord {
  id: string;
  sceneId: string;
  videoId: string;
  embedding: number[];
  text: string;
  metadata: {
    startTime: number;
    endTime: number;
    description: string;
    actions: string[];
    objects: string[];
    people: string[];
    location: string;
    confidence: number;
  };
  createdAt: string;
}

export type ModelProvider = 'gemini' | 'openai' | 'anthropic' | 'voyage' | 'cohere' | 'mistral' | 'groq' | 'ollama' | 'custom';

export type TaskType = 'video_processing' | 'embedding' | 'semantic_search' | 'timestamp_verification';

export interface AiModelConfig {
  id: string; // e.g. 'video_processing' | 'embedding' | 'semantic_search' | 'timestamp_verification'
  taskType: TaskType;
  provider: ModelProvider;
  modelName: string;
  apiKey?: string;
  baseUrl?: string;
  dimensions?: number;
  temperature?: number;
  maxTokens?: number;
  isActive: boolean;
  updatedAt: string;
}

export interface DatabaseSchema {
  videos: Video[];
  groups: VideoGroup[];
  scenes: VideoScene[];
  searches: VideoSearch[];
  clips: VideoClip[];
  jobs: ProcessingJob[];
  costs: AiCost[];
  vectors: VectorRecord[];
  configs: AiModelConfig[];
}

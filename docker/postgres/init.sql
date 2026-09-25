-- ==============================================================================
-- SceneMind AI Database Initialization Script
-- PostgreSQL 16 with pgvector extension
-- ==============================================================================

-- 1. Enable required extensions
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. Groups table
CREATE TABLE IF NOT EXISTS groups_ (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    color VARCHAR(32),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 3. Videos table
CREATE TABLE IF NOT EXISTS videos (
    id VARCHAR(64) PRIMARY KEY,
    filename VARCHAR(512) NOT NULL,
    original_name VARCHAR(512) NOT NULL,
    storage_path TEXT NOT NULL,
    duration DOUBLE PRECISION NOT NULL DEFAULT 0,
    width INT DEFAULT 1920,
    height INT DEFAULT 1080,
    fps DOUBLE PRECISION DEFAULT 30,
    format VARCHAR(32) DEFAULT 'mp4',
    size_bytes BIGINT DEFAULT 0,
    status VARCHAR(32) NOT NULL DEFAULT 'pending',
    processing_progress INT DEFAULT 0,
    group_id VARCHAR(64) REFERENCES groups_(id) ON DELETE SET NULL,
    group_name VARCHAR(255),
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_videos_group ON videos(group_id);
CREATE INDEX IF NOT EXISTS idx_videos_status ON videos(status);

-- 4. Scenes table with vector embeddings
CREATE TABLE IF NOT EXISTS scenes (
    id VARCHAR(64) PRIMARY KEY,
    video_id VARCHAR(64) NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
    scene_number INT NOT NULL,
    start_time DOUBLE PRECISION NOT NULL,
    end_time DOUBLE PRECISION NOT NULL,
    duration DOUBLE PRECISION NOT NULL,
    description TEXT NOT NULL,
    actions JSONB DEFAULT '[]',
    objects JSONB DEFAULT '[]',
    people JSONB DEFAULT '[]',
    location VARCHAR(255) DEFAULT '',
    events JSONB DEFAULT '[]',
    confidence DOUBLE PRECISION DEFAULT 1.0,
    embedding_id VARCHAR(64) DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_scenes_video ON scenes(video_id);
CREATE INDEX IF NOT EXISTS idx_scenes_start ON scenes(start_time);

-- 5. Searches table
CREATE TABLE IF NOT EXISTS searches (
    id VARCHAR(64) PRIMARY KEY,
    video_id VARCHAR(64),
    group_id VARCHAR(64),
    group_name VARCHAR(255),
    query TEXT NOT NULL,
    result_count INT DEFAULT 0,
    results JSONB DEFAULT '[]',
    segments JSONB DEFAULT '[]',
    is_segmented BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_searches_created ON searches(created_at DESC);

-- 6. Clips table
CREATE TABLE IF NOT EXISTS clips (
    id VARCHAR(64) PRIMARY KEY,
    video_id VARCHAR(64) NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
    scene_id VARCHAR(64) REFERENCES scenes(id) ON DELETE SET NULL,
    query TEXT,
    start_time DOUBLE PRECISION NOT NULL,
    end_time DOUBLE PRECISION NOT NULL,
    duration DOUBLE PRECISION NOT NULL,
    output_path TEXT NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'pending',
    progress INT DEFAULT 0,
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_clips_video ON clips(video_id);

-- 7. Processing Jobs table
CREATE TABLE IF NOT EXISTS jobs (
    id VARCHAR(64) PRIMARY KEY,
    video_id VARCHAR(64) NOT NULL,
    job_type VARCHAR(64) NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'pending',
    progress INT DEFAULT 0,
    current_step TEXT DEFAULT '',
    total_steps INT DEFAULT 0,
    retry_count INT DEFAULT 0,
    error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_jobs_video ON jobs(video_id);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);

-- 8. AI Costs table
CREATE TABLE IF NOT EXISTS costs (
    id VARCHAR(64) PRIMARY KEY,
    video_id VARCHAR(64),
    scene_id VARCHAR(64),
    model VARCHAR(128) NOT NULL,
    input_tokens INT DEFAULT 0,
    output_tokens INT DEFAULT 0,
    estimated_cost DOUBLE PRECISION DEFAULT 0,
    processing_time_ms INT DEFAULT 0,
    request_type VARCHAR(64) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_costs_video ON costs(video_id);

-- 9. Vector Embeddings table (pgvector)
CREATE TABLE IF NOT EXISTS vectors (
    id VARCHAR(64) PRIMARY KEY,
    scene_id VARCHAR(64) NOT NULL,
    video_id VARCHAR(64) NOT NULL,
    embedding vector(768),
    text TEXT NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_vectors_video ON vectors(video_id);
CREATE INDEX IF NOT EXISTS idx_vectors_scene ON vectors(scene_id);

-- 10. AI Model & API Configuration Table
CREATE TABLE IF NOT EXISTS ai_configs (
    id VARCHAR(64) PRIMARY KEY,
    task_type VARCHAR(64) NOT NULL,
    provider VARCHAR(64) NOT NULL,
    model_name VARCHAR(128) NOT NULL,
    api_key TEXT,
    base_url TEXT,
    dimensions INT DEFAULT 768,
    temperature DOUBLE PRECISION DEFAULT 0.2,
    max_tokens INT,
    is_active BOOLEAN DEFAULT TRUE,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_ai_configs_task ON ai_configs(task_type);

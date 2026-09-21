-- ==============================================================================
-- SceneMind AI Database Initialization Script
-- Enables pgvector extension and creates initial database schemas
-- ==============================================================================

-- 1. Enable pgvector extension for semantic embedding similarity searches
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. Videos table
CREATE TABLE IF NOT EXISTS videos (
    id VARCHAR(64) PRIMARY KEY,
    filename VARCHAR(255) NOT NULL,
    storage_path TEXT NOT NULL,
    file_size BIGINT NOT NULL,
    duration DOUBLE PRECISION NOT NULL DEFAULT 0,
    width INT DEFAULT 1920,
    height INT DEFAULT 1080,
    fps DOUBLE PRECISION DEFAULT 30,
    status VARCHAR(32) NOT NULL DEFAULT 'uploaded',
    processing_progress INT DEFAULT 0,
    group_name VARCHAR(128),
    uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    indexed_at TIMESTAMP WITH TIME ZONE
);

-- 3. Scenes table with vector embeddings
CREATE TABLE IF NOT EXISTS scenes (
    id VARCHAR(64) PRIMARY KEY,
    video_id VARCHAR(64) NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
    scene_number INT NOT NULL,
    start_time DOUBLE PRECISION NOT NULL,
    end_time DOUBLE PRECISION NOT NULL,
    duration DOUBLE PRECISION NOT NULL,
    description TEXT NOT NULL,
    actions TEXT[] DEFAULT '{}',
    objects TEXT[] DEFAULT '{}',
    location VARCHAR(255),
    people TEXT[] DEFAULT '{}',
    confidence DOUBLE PRECISION DEFAULT 1.0,
    embedding vector(768), -- Gemini text-embedding dimension
    verified_start_time DOUBLE PRECISION,
    verified_end_time DOUBLE PRECISION,
    is_verified BOOLEAN DEFAULT FALSE,
    verification_reason TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Index on scenes start_time, video_id, and vector cosine similarity
CREATE INDEX IF NOT EXISTS idx_scenes_video_id ON scenes(video_id);
CREATE INDEX IF NOT EXISTS idx_scenes_start_time ON scenes(start_time);

-- 4. Clips table
CREATE TABLE IF NOT EXISTS clips (
    id VARCHAR(64) PRIMARY KEY,
    video_id VARCHAR(64) NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
    scene_id VARCHAR(64) REFERENCES scenes(id) ON DELETE SET NULL,
    query TEXT,
    start_time DOUBLE PRECISION NOT NULL,
    end_time DOUBLE PRECISION NOT NULL,
    duration DOUBLE PRECISION NOT NULL,
    output_path TEXT NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'completed',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_clips_video_id ON clips(video_id);

-- 5. Search History table
CREATE TABLE IF NOT EXISTS search_history (
    id VARCHAR(64) PRIMARY KEY,
    query TEXT NOT NULL,
    group_name VARCHAR(128),
    filter_verified BOOLEAN DEFAULT FALSE,
    min_confidence DOUBLE PRECISION DEFAULT 0.0,
    prompt_segments JSONB DEFAULT '[]',
    results JSONB DEFAULT '[]',
    result_count INT DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_search_history_created_at ON search_history(created_at DESC);

-- 6. Processing Jobs table
CREATE TABLE IF NOT EXISTS jobs (
    id VARCHAR(64) PRIMARY KEY,
    video_id VARCHAR(64) NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
    type VARCHAR(32) NOT NULL DEFAULT 'index',
    status VARCHAR(32) NOT NULL DEFAULT 'pending',
    progress INT DEFAULT 0,
    current_step TEXT,
    error TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

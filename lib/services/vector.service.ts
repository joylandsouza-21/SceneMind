import { db } from '../db/store';
import { VectorRecord } from '../db/types';
import { embeddingService } from './embedding.service';
import { v4 as uuidv4 } from 'uuid';

export interface VectorSearchResult {
  id: string;
  sceneId: string;
  videoId: string;
  similarity: number;
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
}

export interface IVectorService {
  upsert(params: {
    sceneId: string;
    videoId: string;
    embedding: number[];
    text: string;
    metadata: VectorRecord['metadata'];
  }): Promise<string>;

  search(
    queryEmbedding: number[],
    limit?: number,
    videoIdFilter?: string,
    minSimilarity?: number
  ): Promise<VectorSearchResult[]>;

  delete(sceneId: string): Promise<void>;
  deleteByVideo(videoId: string): Promise<void>;
}

export class EmbeddedVectorService implements IVectorService {
  public async upsert(params: {
    sceneId: string;
    videoId: string;
    embedding: number[];
    text: string;
    metadata: VectorRecord['metadata'];
  }): Promise<string> {
    const existing = db.getVectors(params.videoId).find((v) => v.sceneId === params.sceneId);
    const id = existing ? existing.id : `vec_${uuidv4()}`;

    const record: VectorRecord = {
      id,
      sceneId: params.sceneId,
      videoId: params.videoId,
      embedding: params.embedding,
      text: params.text,
      metadata: params.metadata,
      createdAt: new Date().toISOString(),
    };

    db.upsertVector(record);
    return id;
  }

  public async search(
    queryEmbedding: number[],
    limit = 10,
    videoIdFilter?: string,
    minSimilarity = 0.2
  ): Promise<VectorSearchResult[]> {
    const records = db.getVectors(videoIdFilter);
    const scored: VectorSearchResult[] = [];

    for (const record of records) {
      const similarity = embeddingService.cosineSimilarity(queryEmbedding, record.embedding);
      if (similarity >= minSimilarity) {
        scored.push({
          id: record.id,
          sceneId: record.sceneId,
          videoId: record.videoId,
          similarity: parseFloat(similarity.toFixed(4)),
          text: record.text,
          metadata: record.metadata,
        });
      }
    }

    scored.sort((a, b) => b.similarity - a.similarity);
    return scored.slice(0, limit);
  }

  public async delete(sceneId: string): Promise<void> {
    const all = db.getVectors();
    const target = all.find((v) => v.sceneId === sceneId);
    if (target) {
      db.deleteVector(target.id);
    }
  }

  public async deleteByVideo(videoId: string): Promise<void> {
    const all = db.getVectors(videoId);
    for (const v of all) {
      db.deleteVector(v.id);
    }
  }
}

export const vectorService: IVectorService = new EmbeddedVectorService();

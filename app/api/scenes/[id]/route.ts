import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { embeddingService } from '@/lib/services/embedding.service';
import { vectorService } from '@/lib/services/vector.service';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const scene = db.getScene(params.id);
  if (!scene) return NextResponse.json({ error: 'Scene not found' }, { status: 404 });
  return NextResponse.json({ scene });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const scene = db.getScene(params.id);
  if (!scene) return NextResponse.json({ error: 'Scene not found' }, { status: 404 });

  await vectorService.delete(scene.id);
  db.deleteScene(scene.id);
  return NextResponse.json({ success: true, message: `Scene ${params.id} deleted` });
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const scene = db.getScene(params.id);
  if (!scene) return NextResponse.json({ error: 'Scene not found' }, { status: 404 });

  try {
    const canonicalText = embeddingService.buildCanonicalText({
      description: scene.description,
      actions: scene.actions,
      objects: scene.objects,
      people: scene.people,
      location: scene.location,
      events: scene.events,
    });

    const { embedding } = await embeddingService.generateEmbedding(canonicalText, {
      videoId: scene.videoId,
      sceneId: scene.id,
    });

    const vectorId = await vectorService.upsert({
      sceneId: scene.id,
      videoId: scene.videoId,
      embedding,
      text: canonicalText,
      metadata: {
        startTime: scene.startTime,
        endTime: scene.endTime,
        description: scene.description,
        actions: scene.actions,
        objects: scene.objects,
        people: scene.people,
        location: scene.location,
        confidence: scene.confidence,
      },
    });

    scene.embeddingId = vectorId;
    db.upsertScene(scene);

    return NextResponse.json({
      success: true,
      scene,
      message: `Scene ${params.id} re-indexed successfully.`,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

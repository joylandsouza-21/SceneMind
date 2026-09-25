import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const group = db.getGroup(params.id);
    if (!group) {
      return NextResponse.json({ error: 'Group not found' }, { status: 404 });
    }

    const videos = db.getVideos(params.id);
    return NextResponse.json({
      group: {
        ...group,
        videoCount: videos.length,
      },
      videos,
    });
  } catch (err: any) {
    console.error('Failed to get group:', err);
    return NextResponse.json({ error: err.message || 'Failed to get group' }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const group = db.getGroup(params.id);
    if (!group) {
      return NextResponse.json({ error: 'Group not found' }, { status: 404 });
    }

    const body = await req.json();
    const { name, description, color } = body;

    if (name !== undefined) {
      if (!name || typeof name !== 'string' || !name.trim()) {
        return NextResponse.json({ error: 'Name cannot be empty' }, { status: 400 });
      }
      group.name = name.trim();

      // Update associated videos' groupName as well
      const videos = db.getVideos(group.id);
      for (const v of videos) {
        v.groupName = group.name;
        db.upsertVideo(v);
      }
    }

    if (description !== undefined) {
      group.description = description ? description.trim() : undefined;
    }

    if (color !== undefined) {
      group.color = color;
    }

    group.updatedAt = new Date().toISOString();
    db.upsertGroup(group);

    return NextResponse.json({
      success: true,
      group,
    });
  } catch (err: any) {
    console.error('Failed to update group:', err);
    return NextResponse.json({ error: err.message || 'Failed to update group' }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const group = db.getGroup(params.id);
    if (!group) {
      return NextResponse.json({ error: 'Group not found' }, { status: 404 });
    }

    const deleted = db.deleteGroup(params.id);
    return NextResponse.json({
      success: deleted,
      message: 'Group deleted successfully and videos unlinked',
    });
  } catch (err: any) {
    console.error('Failed to delete group:', err);
    return NextResponse.json({ error: err.message || 'Failed to delete group' }, { status: 500 });
  }
}

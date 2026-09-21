import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { db } from '@/lib/db/store';
import { VideoGroup } from '@/lib/db/types';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const groups = db.getGroups();
    const videos = db.getVideos();

    // Map each group with its current video count
    const groupsWithCounts = groups.map((g) => {
      const count = videos.filter((v) => v.groupId === g.id).length;
      return {
        ...g,
        videoCount: count,
      };
    });

    return NextResponse.json({
      groups: groupsWithCounts,
      total: groupsWithCounts.length,
    });
  } catch (err: any) {
    console.error('Failed to list groups:', err);
    return NextResponse.json({ error: err.message || 'Failed to list groups' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, description, color } = body;

    if (!name || typeof name !== 'string' || !name.trim()) {
      return NextResponse.json({ error: 'Group name is required' }, { status: 400 });
    }

    const trimmedName = name.trim();
    // Check if group with same name already exists
    const existing = db.getGroups().find((g) => g.name.toLowerCase() === trimmedName.toLowerCase());
    if (existing) {
      return NextResponse.json(
        { group: existing, message: 'Group already exists' },
        { status: 200 }
      );
    }

    const newGroup: VideoGroup = {
      id: `grp_${uuidv4()}`,
      name: trimmedName,
      description: description?.trim() || undefined,
      color: color || undefined,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    db.upsertGroup(newGroup);

    return NextResponse.json({
      success: true,
      group: { ...newGroup, videoCount: 0 },
      message: 'Group created successfully',
    }, { status: 201 });
  } catch (err: any) {
    console.error('Failed to create group:', err);
    return NextResponse.json({ error: err.message || 'Failed to create group' }, { status: 500 });
  }
}

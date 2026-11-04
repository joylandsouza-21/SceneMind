import { NextRequest, NextResponse } from 'next/server';
import { aiConfigService } from '@/lib/services/ai-config.service';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    if (!body.provider || !body.taskType) {
      return NextResponse.json({ error: 'provider and taskType are required' }, { status: 400 });
    }

    const result = await aiConfigService.testConnection({
      provider: body.provider,
      modelName: body.modelName,
      apiKey: body.apiKey,
      baseUrl: body.baseUrl,
      taskType: body.taskType,
      dimensions: body.dimensions,
    });

    return NextResponse.json(result);
  } catch (err: any) {
    console.error('Test connection error:', err);
    return NextResponse.json({
      success: false,
      latencyMs: 0,
      message: err.message || 'Connection test failed',
    }, { status: 500 });
  }
}

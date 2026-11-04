import { NextRequest, NextResponse } from 'next/server';
import { aiConfigService } from '@/lib/services/ai-config.service';
import { AiModelConfig, TaskType } from '@/lib/db/types';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const configs = aiConfigService.getAllConfigs();
    return NextResponse.json({
      success: true,
      configs,
      providers: ['gemini', 'openai', 'anthropic', 'groq', 'ollama', 'custom'],
    });
  } catch (err: any) {
    console.error('Failed to fetch AI configs:', err);
    return NextResponse.json({ error: err.message || 'Failed to fetch configurations' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    if (Array.isArray(body.configs)) {
      const saved: AiModelConfig[] = [];
      for (const cfg of body.configs) {
        if (cfg.taskType) {
          saved.push(aiConfigService.saveConfig(cfg));
        }
      }
      return NextResponse.json({
        success: true,
        message: 'All configurations updated successfully.',
        configs: aiConfigService.getAllConfigs(),
      });
    }

    if (!body.taskType) {
      return NextResponse.json({ error: 'taskType is required' }, { status: 400 });
    }

    const saved = aiConfigService.saveConfig(body);
    return NextResponse.json({
      success: true,
      message: `Configuration for ${body.taskType} updated successfully.`,
      config: saved,
      configs: aiConfigService.getAllConfigs(),
    });
  } catch (err: any) {
    console.error('Failed to save AI config:', err);
    return NextResponse.json({ error: err.message || 'Failed to save configuration' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  return POST(req);
}

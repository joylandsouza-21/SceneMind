import { NextRequest, NextResponse } from 'next/server';
import { pricingService } from '@/lib/services/pricing.service';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const videoId = searchParams.get('videoId') || undefined;

    const aggregated = pricingService.getAggregatedCosts(videoId);
    const detailed = db.getCosts(videoId);

    return NextResponse.json({
      summary: aggregated,
      records: detailed.slice(-50).reverse(), // Last 50 operations
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

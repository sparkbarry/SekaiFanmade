import { NextResponse } from 'next/server';
import { chartIdParam, cacheHeaders, notFound } from '@/lib/api';
import { getChart } from '@/lib/charts';
import { apiViewer } from '@/lib/game-auth';
import { errorResponse } from '@/lib/http';

export const dynamic = 'force-dynamic';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const id = chartIdParam((await params).id);
    const viewer = await apiViewer(request);
    const chart = id ? await getChart(id, viewer?.id) : null;
    if (!chart) return notFound();
    return NextResponse.json(chart, { headers: cacheHeaders(!!viewer) });
  } catch (err) {
    return errorResponse(err);
  }
}

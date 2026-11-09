import { NextResponse } from 'next/server';
import { getChart } from '@/lib/charts';
import { errorResponse } from '@/lib/http';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const chart = await getChart(Number((await params).id));
    if (!chart) return NextResponse.json({ error: { code: 'NOT_FOUND', message: '谱面不存在。' } }, { status: 404 });
    return NextResponse.json(chart, { headers: { 'Cache-Control': 'public, max-age=15' } });
  } catch (err) {
    return errorResponse(err);
  }
}

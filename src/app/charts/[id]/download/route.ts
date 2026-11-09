import { NextResponse } from 'next/server';
import { getChart } from '@/lib/charts';
import { env } from '@/lib/env';
import { errorResponse } from '@/lib/http';

export const dynamic = 'force-dynamic';

/**
 * There is no ZIP on the server any more: the chart page builds it in the browser. Old links (and game
 * builds from before the change) are sent to the chart page.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const chart = await getChart((await params).id);
    if (!chart) return NextResponse.json({ error: { code: 'NOT_FOUND', message: '谱面不存在。' } }, { status: 404 });
    return NextResponse.redirect(new URL(`/charts/${chart.id}`, env().APP_ORIGIN), { status: 302, headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    return errorResponse(err);
  }
}

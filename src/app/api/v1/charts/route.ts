import { NextResponse } from 'next/server';
import { listCharts } from '@/lib/charts';
import { cacheHeaders, listQueryFrom } from '@/lib/api';
import { apiViewer } from '@/lib/game-auth';
import { errorResponse } from '@/lib/http';

export const dynamic = 'force-dynamic';

/**
 * Public catalogue. Query: q (title, artists, uploader or #id), tag, difficulty,
 * sort (new|updated|recommended|daily|plays|popular|downloads|hard|random), seed (for random), page, uploader.
 * With a game Bearer token or a website session each item also has liked / bookmarked.
 */
export async function GET(request: Request) {
  try {
    const p = new URL(request.url).searchParams;
    const viewer = await apiViewer(request);
    const result = await listCharts({ ...listQueryFrom(p), uploaderId: p.get('uploader') ?? undefined, viewerId: viewer?.id });
    return NextResponse.json(result, { headers: cacheHeaders(!!viewer) });
  } catch (err) {
    return errorResponse(err);
  }
}

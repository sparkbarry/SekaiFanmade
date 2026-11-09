import { NextResponse } from 'next/server';
import { listQueryFrom } from '@/lib/api';
import { listCharts } from '@/lib/charts';
import { requireApiViewer } from '@/lib/game-auth';
import { errorResponse } from '@/lib/http';

export const dynamic = 'force-dynamic';

/** The signed-in player's マイリスト, newest first unless `sort` says otherwise. */
export async function GET(request: Request) {
  try {
    const viewer = await requireApiViewer(request);
    const query = listQueryFrom(new URL(request.url).searchParams);
    const result = await listCharts({ ...query, bookmarkedBy: viewer.id, viewerId: viewer.id });
    return NextResponse.json(result, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (err) {
    return errorResponse(err);
  }
}

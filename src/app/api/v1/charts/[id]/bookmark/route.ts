import { NextResponse } from 'next/server';
import { chartIdParam, notFound } from '@/lib/api';
import { setBookmark } from '@/lib/charts';
import { requireApiViewer } from '@/lib/game-auth';
import { errorResponse } from '@/lib/http';

export const dynamic = 'force-dynamic';

/** マイリスト: PUT saves the chart for the signed-in player, DELETE removes it. */
async function handle(request: Request, params: Promise<{ id: string }>, saved: boolean) {
  try {
    const id = chartIdParam((await params).id);
    if (!id) return notFound();
    const viewer = await requireApiViewer(request);
    await setBookmark(viewer, id, saved);
    return NextResponse.json({ bookmarked: saved }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    return errorResponse(err);
  }
}

export function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(request, params, true);
}

export function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(request, params, false);
}

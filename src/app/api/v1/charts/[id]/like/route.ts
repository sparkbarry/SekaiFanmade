import { NextResponse } from 'next/server';
import { chartIdParam, notFound } from '@/lib/api';
import { setLike } from '@/lib/charts';
import { requireApiViewer } from '@/lib/game-auth';
import { errorResponse } from '@/lib/http';

export const dynamic = 'force-dynamic';

async function handle(request: Request, params: Promise<{ id: string }>, liked: boolean) {
  try {
    const id = chartIdParam((await params).id);
    if (!id) return notFound();
    const viewer = await requireApiViewer(request);
    const likeCount = await setLike(viewer, id, liked);
    return NextResponse.json({ liked, likeCount }, { headers: { 'Cache-Control': 'no-store' } });
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

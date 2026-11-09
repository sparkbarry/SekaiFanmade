import { NextResponse } from 'next/server';
import { commentIdParam, jsonBody } from '@/lib/api';
import { requireApiViewer } from '@/lib/game-auth';
import { errorResponse } from '@/lib/http';
import { parseVote, voteComment } from '@/lib/votes';

export const dynamic = 'force-dynamic';

/** {"value": 1 | 0 | -1}. Returns {score, myVote}. */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const id = commentIdParam((await params).id);
    if (!id) return NextResponse.json({ error: { code: 'NOT_FOUND', message: '评论不存在。' } }, { status: 404 });
    const viewer = await requireApiViewer(request);
    const value = parseVote((await jsonBody(request)).value);
    return NextResponse.json(await voteComment(viewer, id, value), { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    return errorResponse(err);
  }
}

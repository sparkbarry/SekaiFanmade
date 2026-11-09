import { NextResponse } from 'next/server';
import { chartIdParam, jsonBody, notFound } from '@/lib/api';
import { requireApiViewer } from '@/lib/game-auth';
import { errorResponse } from '@/lib/http';
import { parseVote, voteChart } from '@/lib/votes';

export const dynamic = 'force-dynamic';

/** Reddit-style vote: {"value": 1 | 0 | -1}; 0 withdraws. Returns {score, upvotes, downvotes, myVote}. */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const id = chartIdParam((await params).id);
    if (!id) return notFound();
    const viewer = await requireApiViewer(request);
    const value = parseVote((await jsonBody(request)).value);
    return NextResponse.json(await voteChart(viewer, id, value), { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    return errorResponse(err);
  }
}

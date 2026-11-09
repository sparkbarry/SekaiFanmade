import { NextResponse } from 'next/server';
import { anonymousActor, recordPlay } from '@/lib/charts';
import { chartIdParam, clientAddress, notFound } from '@/lib/api';
import { apiViewer } from '@/lib/game-auth';
import { errorResponse } from '@/lib/http';

export const dynamic = 'force-dynamic';

/** The game reports a finished play. Counted once per player (or address) per chart per hour. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const id = chartIdParam((await params).id);
    if (!id) return notFound();
    const viewer = await apiViewer(request);
    const playCount = await recordPlay(id, viewer ? `user:${viewer.id}` : anonymousActor(clientAddress(request)));
    if (playCount === null) return notFound();
    return NextResponse.json({ playCount }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    return errorResponse(err);
  }
}

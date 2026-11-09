import { NextResponse } from 'next/server';
import { apiViewer } from '@/lib/game-auth';
import { errorResponse } from '@/lib/http';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    return NextResponse.json({ user: await apiViewer(request) }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (err) {
    return errorResponse(err);
  }
}

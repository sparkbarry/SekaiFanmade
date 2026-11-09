import { NextResponse } from 'next/server';
import { getViewer } from '@/lib/session';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({ user: await getViewer() }, { headers: { 'Cache-Control': 'no-store' } });
}

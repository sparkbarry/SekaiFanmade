import { NextResponse } from 'next/server';
import { listTags } from '@/lib/charts';
import { errorResponse } from '@/lib/http';

export const dynamic = 'force-dynamic';

/** Most used tags, for the search form's suggestions. */
export async function GET() {
  try {
    return NextResponse.json({ tags: await listTags() }, { headers: { 'Cache-Control': 'public, max-age=60' } });
  } catch (err) {
    return errorResponse(err);
  }
}

import { NextResponse } from 'next/server';
import { chartIdParam, notFound } from '@/lib/api';
import { recordDownload } from '@/lib/charts';
import { errorResponse } from '@/lib/http';

export const dynamic = 'force-dynamic';

/**
 * Counts a download. The website (JSZip in the browser) and the game fetch the package's parts from the
 * CDN themselves, so they report the download here.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const id = chartIdParam((await params).id);
    if (!id || !(await recordDownload(id))) return notFound();
    return new NextResponse(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    return errorResponse(err);
  }
}

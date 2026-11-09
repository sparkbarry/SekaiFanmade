import { NextResponse } from 'next/server';
import { recordDownload } from '@/lib/charts';
import { errorResponse } from '@/lib/http';

export const dynamic = 'force-dynamic';

/** Counts the download and sends the browser (or the game) to the CDN copy of the package. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const id = Number((await params).id);
    const url = Number.isSafeInteger(id) && id > 0 ? await recordDownload(id) : null;
    if (!url) return NextResponse.json({ error: { code: 'NOT_FOUND', message: '谱面不存在。' } }, { status: 404 });
    return NextResponse.redirect(url, { status: 302, headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    return errorResponse(err);
  }
}

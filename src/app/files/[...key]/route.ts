import { createReadStream } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { contentDisposition, localStorageBackend } from '@/lib/storage';

export const dynamic = 'force-dynamic';

/** Serves the development storage directory. In production files come from the CDN and this is 404. */
export async function GET(request: Request, { params }: { params: Promise<{ key: string[] }> }) {
  const local = localStorageBackend();
  if (!local) return new Response('Not found', { status: 404 });
  const key = (await params).key.join('/');
  let file: string;
  try {
    file = local.resolve(key);
  } catch {
    return new Response('Not found', { status: 404 });
  }
  const info = await stat(file).catch(() => null);
  if (!info?.isFile() || key.endsWith('.meta.json')) return new Response('Not found', { status: 404 });
  const meta = JSON.parse(await readFile(`${file}.meta.json`, 'utf8').catch(() => '{}')) as {
    contentType?: string;
    downloadName?: string;
  };
  const headers = new Headers({
    'Content-Type': meta.contentType ?? 'application/octet-stream',
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'public, max-age=31536000, immutable',
  });
  if (meta.downloadName) headers.set('Content-Disposition', contentDisposition(meta.downloadName));

  const range = /^bytes=(\d*)-(\d*)$/.exec(request.headers.get('range') ?? '');
  if (range && (range[1] || range[2])) {
    const start = range[1] ? Number(range[1]) : Math.max(0, info.size - Number(range[2]));
    const end = range[1] && range[2] ? Math.min(Number(range[2]), info.size - 1) : info.size - 1;
    if (start > end || start >= info.size) return new Response(null, { status: 416, headers });
    headers.set('Content-Range', `bytes ${start}-${end}/${info.size}`);
    headers.set('Content-Length', String(end - start + 1));
    return new Response(Readable.toWeb(createReadStream(file, { start, end })) as ReadableStream, { status: 206, headers });
  }
  headers.set('Content-Length', String(info.size));
  return new Response(Readable.toWeb(createReadStream(file)) as ReadableStream, { headers });
}

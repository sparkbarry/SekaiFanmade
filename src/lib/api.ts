import 'server-only';
import { NextResponse } from 'next/server';
import { parseChartRef, SORTS, type ListQuery, type Sort } from '@/lib/charts';
import { BadRequest } from '@/lib/http';
import { DIFFICULTIES, type Difficulty } from '@/lib/db/schema';

/** A chart reference in a URL: the 32-hex id or the number. Returns it unchanged, or null if malformed. */
export function chartIdParam(raw: string): string | null {
  return parseChartRef(raw) ? raw.trim().toLowerCase() : null;
}

export function notFound(message = '谱面不存在。') {
  return NextResponse.json({ error: { code: 'NOT_FOUND', message } }, { status: 404 });
}

/** Shared list parameters: q, tag, difficulty, sort, seed, page. */
export function listQueryFrom(p: URLSearchParams): ListQuery {
  const difficulty = p.get('difficulty');
  const sort = p.get('sort');
  return {
    q: p.get('q') ?? undefined,
    tag: p.get('tag') ?? undefined,
    difficulty: (DIFFICULTIES as readonly string[]).includes(difficulty ?? '') ? (difficulty as Difficulty) : undefined,
    sort: (SORTS as readonly string[]).includes(sort ?? '') ? (sort as Sort) : 'new',
    seed: p.get('seed') ?? undefined,
    page: Number(p.get('page') ?? '1') || 1,
  };
}

/** Lists for signed-in requests carry per-user flags, so they must not be cached publicly. */
export function cacheHeaders(signedIn: boolean): HeadersInit {
  return { 'Cache-Control': signedIn ? 'private, no-store' : 'public, max-age=15' };
}

export function clientAddress(request: Request): string {
  return request.headers.get('x-real-ip') ?? request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
}

/** Reads a small JSON body ({...}) or throws BadRequest. */
export async function jsonBody(request: Request): Promise<Record<string, unknown>> {
  const text = await request.text();
  if (text.length > 64 * 1024) throw new BadRequest('请求太大。');
  try {
    const value = JSON.parse(text || '{}');
    if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>;
  } catch {
    // fall through
  }
  throw new BadRequest('请求不是有效的 JSON。');
}

export function commentIdParam(raw: string): number | null {
  const id = Number(raw);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

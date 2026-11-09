import { NextResponse } from 'next/server';
import { listCharts, SORTS, type Sort } from '@/lib/charts';
import { DIFFICULTIES, type Difficulty } from '@/lib/db/schema';
import { errorResponse } from '@/lib/http';

export const dynamic = 'force-dynamic';

/** Public catalogue for OpenSekai and other clients. Query: q, difficulty, sort, page, uploader. */
export async function GET(request: Request) {
  try {
    const p = new URL(request.url).searchParams;
    const difficulty = p.get('difficulty');
    const sort = p.get('sort');
    const result = await listCharts({
      q: p.get('q') ?? undefined,
      difficulty: (DIFFICULTIES as readonly string[]).includes(difficulty ?? '') ? (difficulty as Difficulty) : undefined,
      sort: (SORTS as readonly string[]).includes(sort ?? '') ? (sort as Sort) : 'new',
      page: Number(p.get('page') ?? '1') || 1,
      uploaderId: p.get('uploader') ?? undefined,
    });
    return NextResponse.json(result, { headers: { 'Cache-Control': 'public, max-age=15' } });
  } catch (err) {
    return errorResponse(err);
  }
}

import { NextResponse } from 'next/server';
import { chartIdParam, jsonBody, notFound } from '@/lib/api';
import { COMMENT_SORTS, createComment, listComments, type CommentSort } from '@/lib/comments';
import { apiViewer, requireApiViewer } from '@/lib/game-auth';
import { BadRequest, errorResponse } from '@/lib/http';

export const dynamic = 'force-dynamic';

/** ?sort=best|top|new|old|controversial&page=N: 20 top-level comments a page, each with its replies. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const id = chartIdParam((await params).id);
    if (!id) return notFound();
    const p = new URL(request.url).searchParams;
    const sort = p.get('sort') ?? 'best';
    if (!(COMMENT_SORTS as readonly string[]).includes(sort)) throw new BadRequest('不支持这种排序。');
    const viewer = await apiViewer(request);
    const result = await listComments(id, { sort: sort as CommentSort, page: Number(p.get('page') ?? '1') || 1, viewerId: viewer?.id });
    return NextResponse.json(result, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (err) {
    return errorResponse(err);
  }
}

/** {"body": "...", "parentId": 12?}: the author's upvote is cast at once. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const id = chartIdParam((await params).id);
    if (!id) return notFound();
    const viewer = await requireApiViewer(request);
    const body = await jsonBody(request);
    const parentId = body.parentId === undefined || body.parentId === null ? null : Number(body.parentId);
    if (parentId !== null && !(Number.isSafeInteger(parentId) && parentId > 0)) throw new BadRequest('parentId 不正确。');
    const comment = await createComment(viewer, id, body.body, parentId);
    return NextResponse.json(comment, { status: 201, headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    return errorResponse(err);
  }
}

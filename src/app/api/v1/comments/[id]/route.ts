import { NextResponse } from 'next/server';
import { commentIdParam, jsonBody } from '@/lib/api';
import { deleteComment, editComment, getCommentThread } from '@/lib/comments';
import { apiViewer, requireApiViewer } from '@/lib/game-auth';
import { errorResponse } from '@/lib/http';

export const dynamic = 'force-dynamic';

const missing = () => NextResponse.json({ error: { code: 'NOT_FOUND', message: '评论不存在。' } }, { status: 404 });

/** The comment with everything under it. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const id = commentIdParam((await params).id);
    if (!id) return missing();
    const viewer = await apiViewer(request);
    const thread = await getCommentThread(id, viewer?.id);
    return thread ? NextResponse.json(thread, { headers: { 'Cache-Control': 'private, no-store' } }) : missing();
  } catch (err) {
    return errorResponse(err);
  }
}

/** The author edits: {"body": "..."}. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const id = commentIdParam((await params).id);
    if (!id) return missing();
    const viewer = await requireApiViewer(request);
    return NextResponse.json(await editComment(viewer, id, (await jsonBody(request)).body), { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    return errorResponse(err);
  }
}

/** The author deletes, an admin removes. Returns {ok, purged}. */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const id = commentIdParam((await params).id);
    if (!id) return missing();
    const viewer = await requireApiViewer(request);
    const { purged } = await deleteComment(viewer, id);
    return NextResponse.json({ ok: true, purged }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    return errorResponse(err);
  }
}

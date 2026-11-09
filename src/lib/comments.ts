import 'server-only';
import { and, asc, count, desc, eq, gte, inArray, isNull, sql, type SQL } from 'drizzle-orm';
import { charts, chartVotes, comments, commentVotes, db, users } from '@/lib/db';
import { Conflict, NotFound, parseChartRef, TooMany } from '@/lib/charts';
import { BadRequest } from '@/lib/http';
import { Forbidden, type Viewer } from '@/lib/session';
import type { Vote } from '@/lib/votes';

/**
 * Threaded comments, as on OurTaiko Fanmade (034): replies form a tree under each top-level comment,
 * every comment can be voted on, and the author's own upvote is cast when it is posted. A comment
 * deleted by its author (or removed by an admin) that has replies stays as an empty placeholder.
 */

export const COMMENT_SORTS = ['best', 'top', 'new', 'old', 'controversial'] as const;
export type CommentSort = (typeof COMMENT_SORTS)[number];
export const COMMENT_PAGE_SIZE = 20;
const MAX_REPLIES = 1500;
const MAX_DEPTH = 1000;
const MAX_BODY = 10000;
const PER_MINUTE = 8;

export interface CommentNode {
  id: number;
  chartId: string;
  parentId: number | null;
  depth: number;
  /** Null on placeholders. */
  author: { id: string; nickname: string; avatarUrl: string | null } | null;
  body: string | null;
  createdAt: string;
  editedAt: string | null;
  deleted: boolean;
  removed: boolean;
  score: number;
  myVote: Vote;
  replyCount: number;
  replies: CommentNode[];
}

function order(sort: CommentSort): SQL[] {
  switch (sort) {
    case 'top':
      return [desc(sql`${comments.upvotes} - ${comments.downvotes}`), desc(comments.createdAt), asc(comments.id)];
    case 'new':
      return [desc(comments.createdAt), desc(comments.id)];
    case 'old':
      return [asc(comments.createdAt), asc(comments.id)];
    case 'controversial':
      return [desc(sql`comment_controversy(${comments.upvotes}, ${comments.downvotes})`), desc(comments.createdAt), asc(comments.id)];
    default:
      return [desc(sql`comment_confidence(${comments.upvotes}, ${comments.downvotes})`), desc(comments.createdAt), asc(comments.id)];
  }
}

const columns = {
  id: comments.id,
  chartId: comments.chartId,
  parentId: comments.parentId,
  depth: comments.depth,
  body: comments.body,
  upvotes: comments.upvotes,
  downvotes: comments.downvotes,
  replyCount: comments.replyCount,
  createdAt: comments.createdAt,
  editedAt: comments.editedAt,
  deletedAt: comments.deletedAt,
  removedAt: comments.removedAt,
  userId: users.id,
  nickname: users.nickname,
  avatarUrl: users.avatarUrl,
};

type Row = Awaited<ReturnType<typeof selectComments>>[number];

function selectComments() {
  return db().select(columns).from(comments).innerJoin(users, eq(users.id, comments.userId));
}

function toNode(r: Row, myVotes: Map<number, Vote>): CommentNode {
  const gone = r.deletedAt !== null || r.removedAt !== null;
  return {
    id: r.id,
    chartId: r.chartId,
    parentId: r.parentId,
    depth: r.depth,
    author: gone ? null : { id: r.userId, nickname: r.nickname, avatarUrl: r.avatarUrl },
    body: r.body,
    createdAt: r.createdAt.toISOString(),
    editedAt: r.editedAt?.toISOString() ?? null,
    deleted: r.deletedAt !== null,
    removed: r.removedAt !== null,
    score: r.upvotes - r.downvotes,
    myVote: myVotes.get(r.id) ?? 0,
    replyCount: r.replyCount,
    replies: [],
  };
}

async function votesOf(viewerId: string | undefined, ids: number[]): Promise<Map<number, Vote>> {
  if (!viewerId || ids.length === 0) return new Map();
  const rows = await db()
    .select({ id: commentVotes.commentId, value: commentVotes.value })
    .from(commentVotes)
    .where(and(eq(commentVotes.userId, viewerId), inArray(commentVotes.commentId, ids)));
  return new Map(rows.map((r) => [r.id, r.value as Vote]));
}

async function liveChart(ref: string): Promise<{ id: string; commentCount: number } | null> {
  const parsed = parseChartRef(ref);
  if (!parsed) return null;
  const [row] = await db()
    .select({ id: charts.id, commentCount: charts.commentCount })
    .from(charts)
    .where(and('id' in parsed ? eq(charts.id, parsed.id) : eq(charts.numberId, parsed.numberId), isNull(charts.deletedAt)));
  return row ?? null;
}

export async function listComments(
  chartRef: string,
  opts: { sort?: CommentSort; page?: number; viewerId?: string },
): Promise<{ items: CommentNode[]; total: number; commentCount: number; page: number; pageSize: number; sort: CommentSort }> {
  const chart = await liveChart(chartRef);
  if (!chart) throw new NotFound('谱面不存在。');
  const sort = opts.sort ?? 'best';
  const page = Math.max(1, Math.trunc(opts.page ?? 1));
  const topFilter = and(eq(comments.chartId, chart.id), isNull(comments.parentId));
  const [tops, [{ total }]] = await Promise.all([
    selectComments()
      .where(topFilter)
      .orderBy(...order(sort))
      .limit(COMMENT_PAGE_SIZE)
      .offset((page - 1) * COMMENT_PAGE_SIZE),
    db().select({ total: count() }).from(comments).where(topFilter),
  ]);
  const replies = tops.length
    ? await selectComments()
        .where(and(inArray(comments.rootId, tops.map((t) => t.id)), sql`${comments.parentId} is not null`))
        .orderBy(...order(sort))
        .limit(MAX_REPLIES)
    : [];
  const myVotes = await votesOf(opts.viewerId, [...tops, ...replies].map((r) => r.id));
  const nodes = new Map<number, CommentNode>();
  const items = tops.map((t) => {
    const n = toNode(t, myVotes);
    nodes.set(n.id, n);
    return n;
  });
  // Replies come in sort order; a parent may come after its child, so attach in two passes.
  for (const r of replies) nodes.set(r.id, toNode(r, myVotes));
  for (const r of replies) {
    const parent = r.parentId !== null ? nodes.get(r.parentId) : undefined;
    if (parent) parent.replies.push(nodes.get(r.id)!);
  }
  return { items, total, commentCount: chart.commentCount, page, pageSize: COMMENT_PAGE_SIZE, sort };
}

/** One comment and everything under it (for a permalink). */
export async function getCommentThread(id: number, viewerId?: string): Promise<CommentNode | null> {
  const [row] = await selectComments()
    .innerJoin(charts, eq(charts.id, comments.chartId))
    .where(and(eq(comments.id, id), isNull(charts.deletedAt)));
  if (!row) return null;
  const all = await selectComments()
    .where(and(eq(comments.chartId, row.chartId), sql`${comments.rootId} = (select root_id from comments where id = ${id})`))
    .orderBy(...order('best'))
    .limit(MAX_REPLIES);
  const myVotes = await votesOf(viewerId, all.map((r) => r.id));
  const nodes = new Map(all.map((r) => [r.id, toNode(r, myVotes)]));
  for (const r of all) {
    const parent = r.parentId !== null ? nodes.get(r.parentId) : undefined;
    if (parent) parent.replies.push(nodes.get(r.id)!);
  }
  return nodes.get(id) ?? toNode(row, myVotes);
}

export function normalizeBody(raw: unknown): string {
  const text = String(raw ?? '')
    .replace(/\r\n?/g, '\n')
    .trim();
  if (!text) throw new BadRequest('评论不能为空。');
  if (text.length > MAX_BODY) throw new BadRequest(`评论最多 ${MAX_BODY} 字。`);
  if (/[\u0000-\u0008\u000b-\u001f\u007f]/.test(text)) throw new BadRequest('评论里有不能显示的字符。');
  return text;
}

export async function createComment(
  viewer: Viewer,
  chartRef: string,
  rawBody: unknown,
  parentId: number | null,
): Promise<CommentNode> {
  const body = normalizeBody(rawBody);
  const chart = await liveChart(chartRef);
  if (!chart) throw new NotFound('谱面不存在。');
  const id = await db().transaction(async (tx) => {
    // Serializes one user's posts, so the per-minute limit holds under concurrent requests.
    await tx.select({ id: users.id }).from(users).where(eq(users.id, viewer.id)).for('update');
    const [{ n }] = await tx
      .select({ n: count() })
      .from(comments)
      .where(and(eq(comments.userId, viewer.id), gte(comments.createdAt, new Date(Date.now() - 60_000))));
    if (n >= PER_MINUTE) throw new TooMany('评论太频繁，请一分钟后再试。');
    const [live] = await tx
      .select({ id: charts.id })
      .from(charts)
      .where(and(eq(charts.id, chart.id), isNull(charts.deletedAt)))
      .for('share');
    if (!live) throw new NotFound('谱面不存在。');

    let rootId: number | null = null;
    let depth = 0;
    if (parentId !== null) {
      const [parent] = await tx
        .select({ id: comments.id, rootId: comments.rootId, depth: comments.depth, deletedAt: comments.deletedAt, removedAt: comments.removedAt })
        .from(comments)
        .where(and(eq(comments.id, parentId), eq(comments.chartId, chart.id)))
        .for('update');
      if (!parent) throw new NotFound('要回复的评论不存在。');
      if (parent.deletedAt || parent.removedAt) throw new Conflict('不能回复已删除的评论。');
      if (parent.depth + 1 > MAX_DEPTH) throw new BadRequest('回复层数太深了。');
      rootId = parent.rootId ?? parent.id;
      depth = parent.depth + 1;
    }
    const [row] = await tx
      .insert(comments)
      .values({ chartId: chart.id, parentId, rootId, depth, userId: viewer.id, body, upvotes: 1 })
      .returning({ id: comments.id });
    if (rootId === null) await tx.update(comments).set({ rootId: row.id }).where(eq(comments.id, row.id));
    await tx.insert(commentVotes).values({ commentId: row.id, userId: viewer.id, value: 1 });
    if (parentId !== null) {
      await tx
        .update(comments)
        .set({ replyCount: sql`${comments.replyCount} + 1` })
        .where(eq(comments.id, parentId));
    }
    await tx
      .update(charts)
      .set({ commentCount: sql`${charts.commentCount} + 1` })
      .where(eq(charts.id, chart.id));
    return row.id;
  });
  const node = await getCommentThread(id, viewer.id);
  if (!node) throw new NotFound('评论不存在。');
  return node;
}

export async function editComment(viewer: Viewer, id: number, rawBody: unknown): Promise<CommentNode> {
  const body = normalizeBody(rawBody);
  const updated = await db()
    .update(comments)
    .set({ body, editedAt: new Date() })
    .where(and(eq(comments.id, id), eq(comments.userId, viewer.id), isNull(comments.deletedAt), isNull(comments.removedAt)))
    .returning({ id: comments.id });
  if (updated.length === 0) {
    const [row] = await db().select({ userId: comments.userId }).from(comments).where(eq(comments.id, id));
    if (!row) throw new NotFound('评论不存在。');
    if (row.userId !== viewer.id) throw new Forbidden('只能编辑自己的评论。');
    throw new Conflict('这条评论已删除。');
  }
  const node = await getCommentThread(id, viewer.id);
  if (!node) throw new NotFound('评论不存在。');
  return node;
}

/**
 * The author deletes, an admin removes. Without replies the row goes, together with placeholder ancestors
 * left with no replies; with replies the text is cleared and an anonymous placeholder stays. Idempotent.
 */
export async function deleteComment(viewer: Viewer, id: number): Promise<{ chartId: string; purged: boolean }> {
  return db().transaction(async (tx) => {
    const [row] = await tx
      .select({
        id: comments.id,
        chartId: comments.chartId,
        parentId: comments.parentId,
        userId: comments.userId,
        replyCount: comments.replyCount,
        deletedAt: comments.deletedAt,
        removedAt: comments.removedAt,
      })
      .from(comments)
      .where(eq(comments.id, id))
      .for('update');
    if (!row) throw new NotFound('评论不存在。');
    const isAuthor = row.userId === viewer.id;
    if (!isAuthor && !viewer.isAdmin) throw new Forbidden('不能删除别人的评论。');
    if (row.deletedAt || row.removedAt) return { chartId: row.chartId, purged: false };

    await tx
      .update(charts)
      .set({ commentCount: sql`greatest(${charts.commentCount} - 1, 0)` })
      .where(eq(charts.id, row.chartId));
    if (row.replyCount > 0) {
      await tx
        .update(comments)
        .set({ body: null, ...(isAuthor ? { deletedAt: new Date() } : { removedAt: new Date() }) })
        .where(eq(comments.id, id));
      return { chartId: row.chartId, purged: false };
    }
    // No replies: drop it, then any placeholder ancestors that this leaves empty.
    await tx.delete(comments).where(eq(comments.id, id));
    let parentId = row.parentId;
    while (parentId !== null) {
      const [parent] = await tx
        .update(comments)
        .set({ replyCount: sql`greatest(${comments.replyCount} - 1, 0)` })
        .where(eq(comments.id, parentId))
        .returning({ id: comments.id, parentId: comments.parentId, replyCount: comments.replyCount, deletedAt: comments.deletedAt, removedAt: comments.removedAt });
      if (!parent || parent.replyCount > 0 || (!parent.deletedAt && !parent.removedAt)) break;
      await tx.delete(comments).where(eq(comments.id, parent.id));
      parentId = parent.parentId;
    }
    return { chartId: row.chartId, purged: true };
  });
}

/** Votes from others on the user's charts and comments, as Fanmade's karma. */
export async function karmaOf(userId: string): Promise<{ karma: number; commentCount: number }> {
  const [chartPart] = await db()
    .select({ total: sql<number>`coalesce(sum(${chartVotes.value}), 0)::int` })
    .from(chartVotes)
    .innerJoin(charts, eq(charts.id, chartVotes.chartId))
    .where(and(eq(charts.uploaderId, userId), sql`${chartVotes.userId} <> ${userId}`, isNull(charts.deletedAt)));
  const [commentPart] = await db()
    .select({ total: sql<number>`coalesce(sum(${commentVotes.value}), 0)::int` })
    .from(commentVotes)
    .innerJoin(comments, eq(comments.id, commentVotes.commentId))
    .where(and(eq(comments.userId, userId), sql`${commentVotes.userId} <> ${userId}`));
  const [{ n }] = await db()
    .select({ n: count() })
    .from(comments)
    .innerJoin(charts, eq(charts.id, comments.chartId))
    .where(and(eq(comments.userId, userId), isNull(comments.deletedAt), isNull(comments.removedAt), isNull(charts.deletedAt)));
  return { karma: (chartPart?.total ?? 0) + (commentPart?.total ?? 0), commentCount: n };
}

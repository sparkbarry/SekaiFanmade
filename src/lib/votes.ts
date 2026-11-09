import 'server-only';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { charts, chartVotes, comments, commentVotes, db } from '@/lib/db';
import { NotFound, parseChartRef } from '@/lib/charts';
import { BadRequest } from '@/lib/http';
import type { Viewer } from '@/lib/session';

/** Reddit-style votes on charts and comments: 1 up, -1 down, 0 withdraws. One per user and object. */
export type Vote = -1 | 0 | 1;

export function parseVote(raw: unknown): Vote {
  if (raw === 1 || raw === 0 || raw === -1) return raw;
  throw new BadRequest('投票只能是 1、0 或 -1。');
}

export interface ChartVoteResult {
  score: number;
  upvotes: number;
  downvotes: number;
  myVote: Vote;
}

/** Counter changes for going from `before` to `after`. */
function deltas(before: Vote, after: Vote) {
  return {
    up: (after === 1 ? 1 : 0) - (before === 1 ? 1 : 0),
    down: (after === -1 ? 1 : 0) - (before === -1 ? 1 : 0),
  };
}

export async function voteChart(viewer: Viewer, ref: string, value: Vote): Promise<ChartVoteResult> {
  const parsed = parseChartRef(ref);
  if (!parsed) throw new NotFound('谱面不存在。');
  return db().transaction(async (tx) => {
    const [chart] = await tx
      .select({ id: charts.id })
      .from(charts)
      .where(and('id' in parsed ? eq(charts.id, parsed.id) : eq(charts.numberId, parsed.numberId), isNull(charts.deletedAt)))
      .for('update');
    if (!chart) throw new NotFound('谱面不存在。');
    const [existing] = await tx
      .select({ value: chartVotes.value })
      .from(chartVotes)
      .where(and(eq(chartVotes.chartId, chart.id), eq(chartVotes.userId, viewer.id)));
    const before = (existing?.value ?? 0) as Vote;
    if (value === 0) {
      await tx.delete(chartVotes).where(and(eq(chartVotes.chartId, chart.id), eq(chartVotes.userId, viewer.id)));
    } else if (before !== value) {
      await tx
        .insert(chartVotes)
        .values({ chartId: chart.id, userId: viewer.id, value })
        .onConflictDoUpdate({ target: [chartVotes.chartId, chartVotes.userId], set: { value, createdAt: new Date() } });
    }
    const d = deltas(before, value);
    const [row] = await tx
      .update(charts)
      .set({ upvotes: sql`${charts.upvotes} + ${d.up}`, downvotes: sql`${charts.downvotes} + ${d.down}` })
      .where(eq(charts.id, chart.id))
      .returning({ upvotes: charts.upvotes, downvotes: charts.downvotes });
    return { score: row.upvotes - row.downvotes, upvotes: row.upvotes, downvotes: row.downvotes, myVote: value };
  });
}

/** Votes on a comment. Placeholders (deleted or removed) only accept withdrawing a vote. */
export async function voteComment(viewer: Viewer, commentId: number, value: Vote): Promise<{ score: number; myVote: Vote }> {
  return db().transaction(async (tx) => {
    const [comment] = await tx
      .select({ id: comments.id, deletedAt: comments.deletedAt, removedAt: comments.removedAt })
      .from(comments)
      .innerJoin(charts, eq(charts.id, comments.chartId))
      .where(and(eq(comments.id, commentId), isNull(charts.deletedAt)))
      .for('update', { of: comments });
    if (!comment) throw new NotFound('评论不存在。');
    if (value !== 0 && (comment.deletedAt || comment.removedAt)) throw new BadRequest('这条评论已删除，不能再投票。');
    const [existing] = await tx
      .select({ value: commentVotes.value })
      .from(commentVotes)
      .where(and(eq(commentVotes.commentId, commentId), eq(commentVotes.userId, viewer.id)));
    const before = (existing?.value ?? 0) as Vote;
    if (value === 0) {
      await tx.delete(commentVotes).where(and(eq(commentVotes.commentId, commentId), eq(commentVotes.userId, viewer.id)));
    } else if (before !== value) {
      await tx
        .insert(commentVotes)
        .values({ commentId, userId: viewer.id, value })
        .onConflictDoUpdate({ target: [commentVotes.commentId, commentVotes.userId], set: { value, createdAt: new Date() } });
    }
    const d = deltas(before, value);
    const [row] = await tx
      .update(comments)
      .set({ upvotes: sql`${comments.upvotes} + ${d.up}`, downvotes: sql`${comments.downvotes} + ${d.down}` })
      .where(eq(comments.id, commentId))
      .returning({ upvotes: comments.upvotes, downvotes: comments.downvotes });
    return { score: row.upvotes - row.downvotes, myVote: value };
  });
}

/**
 * How much of a thread shows before the rest folds behind a button. Ported from OurTaiko's site kit
 * (web/src/comment-folding.ts): as on Reddit, a long thread shows a part first and folds the rest into
 * "N replies". Replies are picked level by level, siblings in sort order, until a cap on count, depth or
 * the budget is hit. A single reply without replies of its own never folds.
 */
export type FoldPolicy = {
  /** Most replies shown below the starting comment. */
  budget: number;
  /** Most levels shown below the starting comment. */
  depth: number;
  /** Most direct replies shown on the starting comment. */
  rootReplies: number;
  /** Most direct replies shown on each comment further down. */
  replies: number;
};

export interface FoldableComment {
  id: number;
  replyCount: number;
  replies: FoldableComment[];
}

export const WIDE_POLICY: FoldPolicy = { budget: 10, depth: 4, rootReplies: 4, replies: 2 };
export const NARROW_POLICY: FoldPolicy = { budget: 8, depth: 2, rootReplies: 3, replies: 2 };
export const MORE_POLICY: FoldPolicy = { budget: 10, depth: 3, rootReplies: 10, replies: 2 };

/** Returns how many direct replies each comment shows; a missing comment shows 0. */
export function planReplies(root: FoldableComment, policy: FoldPolicy, skip = 0): Map<number, number> {
  const shown = new Map<number, number>();
  let budget = policy.budget;
  let level: { comment: FoldableComment; depth: number }[] = [{ comment: root, depth: 0 }];
  while (level.length > 0 && budget > 0) {
    const next: typeof level = [];
    for (const { comment, depth } of level) {
      const offset = comment === root ? skip : 0;
      const replies = comment.replies.slice(offset);
      const cap = depth >= policy.depth ? 0 : comment === root ? policy.rootReplies : policy.replies;
      let count = Math.min(replies.length, cap, budget);
      if (replies.length - count === 1 && replies[count].replyCount === 0 && budget > count) count++;
      if (count === 0) continue;
      shown.set(comment.id, offset + count);
      budget -= count;
      next.push(...replies.slice(0, count).map((reply) => ({ comment: reply, depth: depth + 1 })));
    }
    level = next;
  }
  return shown;
}

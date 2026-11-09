import { describe, expect, it } from 'vitest';
import { planReplies, type FoldableComment } from './comment-folding';

let next = 1;
function c(...replies: FoldableComment[]): FoldableComment {
  return { id: next++, replyCount: replies.length, replies };
}

describe('planReplies', () => {
  it('shows up to rootReplies direct replies and folds the rest', () => {
    const root = c(c(), c(), c(), c(), c(), c());
    const plan = planReplies(root, { budget: 10, depth: 4, rootReplies: 4, replies: 2 });
    expect(plan.get(root.id)).toBe(4);
  });

  it('does not fold a single leaf reply behind a button', () => {
    const root = c(c(), c(), c(), c(), c());
    const plan = planReplies(root, { budget: 10, depth: 4, rootReplies: 4, replies: 2 });
    expect(plan.get(root.id)).toBe(5);
  });

  it('stops at the depth cap', () => {
    const deep = c(c(c(c(c()))));
    const plan = planReplies(deep, { budget: 10, depth: 2, rootReplies: 4, replies: 2 });
    expect(plan.get(deep.id)).toBe(1);
    expect(plan.get(deep.replies[0].id)).toBe(1);
    expect(plan.get(deep.replies[0].replies[0].id)).toBeUndefined();
  });

  it('spends the budget across levels', () => {
    const root = c(c(c(), c()), c(c(), c()), c(c(), c()));
    const plan = planReplies(root, { budget: 5, depth: 4, rootReplies: 4, replies: 2 });
    const shown = [...plan.values()].reduce((a, b) => a + b, 0);
    expect(shown).toBe(5);
  });
});

'use client';

import { useOptimistic, useState, useTransition } from 'react';
import { toggleLikeAction } from '@/app/actions';
import { cx } from '@/components/ui';

export function LikeButton({ chartId, liked, count, signedIn }: { chartId: string; liked: boolean; count: number; signedIn: boolean }) {
  const [state, setState] = useState({ liked, count });
  const [optimistic, setOptimistic] = useOptimistic(state);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (!signedIn) {
    return (
      <a
        href={`/auth/login?next=${encodeURIComponent(`/charts/${chartId}`)}`}
        aria-label={`登录后喜欢（${count}）`}
        className="inline-flex items-center gap-1.5 rounded-[10px] border-2 border-outline bg-card px-4 py-2 text-sm font-bold shadow-press transition-all hover:-translate-y-0.5 hover:shadow-press-hover"
      >
        <span aria-hidden>♡</span>
        <span className="tabular-nums">{count}</span>
      </a>
    );
  }

  const click = () => {
    const next = !state.liked;
    start(async () => {
      setOptimistic({ liked: next, count: state.count + (next ? 1 : -1) });
      const res = await toggleLikeAction(chartId, next);
      if (res.error) setError(res.error);
      else {
        setError(null);
        setState({ liked: next, count: res.count ?? state.count });
      }
    });
  };

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={click}
        disabled={pending}
        aria-pressed={optimistic.liked}
        aria-label={`喜欢（${optimistic.count}）`}
        className={cx(
          'inline-flex items-center gap-1.5 rounded-[10px] border-2 border-outline px-4 py-2 text-sm font-bold shadow-press transition-all hover:-translate-y-0.5 hover:shadow-press-hover active:translate-y-0.5 active:shadow-none',
          optimistic.liked ? 'bg-pop text-[#382d2a]' : 'bg-card',
        )}
      >
        <span aria-hidden>{optimistic.liked ? '♥' : '♡'}</span>
        <span className="tabular-nums">{optimistic.count}</span>
      </button>
      {error && <span className="text-xs text-danger">{error}</span>}
    </span>
  );
}

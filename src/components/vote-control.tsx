'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { cx } from '@/components/ui';

export type Vote = -1 | 0 | 1;

/**
 * Reddit-style arrows, as on OurTaiko Fanmade. Pressing the active arrow withdraws the vote. The score
 * updates at once and rolls back if the server refuses.
 */
export function VoteControl({
  kind,
  id,
  score,
  myVote,
  signedIn,
  loginNext,
  size = 'md',
  disabled = false,
}: {
  kind: 'chart' | 'comment';
  id: string | number;
  score: number;
  myVote: Vote;
  signedIn: boolean;
  loginNext: string;
  size?: 'sm' | 'md';
  disabled?: boolean;
}) {
  const router = useRouter();
  const [state, setState] = useState({ score, myVote });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cast = async (direction: 1 | -1) => {
    if (!signedIn) {
      router.push(`/auth/login?next=${encodeURIComponent(loginNext)}`);
      return;
    }
    if (pending) return;
    const next: Vote = state.myVote === direction ? 0 : direction;
    const before = state;
    setState({ score: state.score - state.myVote + next, myVote: next });
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/${kind === 'chart' ? 'charts' : 'comments'}/${id}/vote`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: next }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error?.message ?? '投票失败。');
      setState({ score: body.score, myVote: body.myVote });
    } catch (e) {
      setState(before);
      setError(e instanceof Error ? e.message : '投票失败。');
    } finally {
      setPending(false);
    }
  };

  const arrow = (direction: 1 | -1) => {
    const active = state.myVote === direction;
    return (
      <button
        type="button"
        onClick={() => cast(direction)}
        disabled={disabled || pending}
        aria-pressed={active}
        aria-label={direction === 1 ? '赞' : '踩'}
        className={cx(
          'flex items-center justify-center rounded-[8px] font-black transition-colors disabled:opacity-40',
          size === 'sm' ? 'size-6 text-sm' : 'size-9 text-lg',
          active ? (direction === 1 ? 'bg-pop text-[#382d2a]' : 'bg-[#8fa8ff] text-[#382d2a]') : 'hover:bg-cream',
        )}
      >
        {direction === 1 ? '▲' : '▼'}
      </button>
    );
  };

  return (
    <span className="inline-flex items-center gap-1">
      <span
        className={cx(
          'inline-flex items-center gap-0.5 rounded-[10px] border-outline bg-card',
          size === 'sm' ? 'border-[1.5px] px-0.5' : 'border-2 px-1 py-0.5 shadow-press',
        )}
      >
        {arrow(1)}
        <span
          className={cx(
            'min-w-6 text-center font-black tabular-nums',
            size === 'sm' ? 'text-xs' : 'text-sm',
            state.myVote === 1 && 'text-[#d6336c] dark:text-pop',
            state.myVote === -1 && 'text-[#3f5bd6] dark:text-[#8fa8ff]',
          )}
        >
          {state.score}
        </span>
        {arrow(-1)}
      </span>
      {error && <span className="text-xs text-danger">{error}</span>}
    </span>
  );
}

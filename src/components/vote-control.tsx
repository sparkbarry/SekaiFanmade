'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { cx, DownIcon, UpIcon } from '@/components/ui';

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
          'grid place-items-center rounded-full transition-colors disabled:opacity-40',
          size === 'sm' ? 'size-8' : 'size-10',
          active
            ? direction === 1
              ? 'bg-up-soft text-up'
              : 'bg-down-soft text-down'
            : 'text-muted hover:bg-surface-high hover:text-foreground',
        )}
      >
        {direction === 1 ? <UpIcon className="size-3.5" /> : <DownIcon className="size-3.5" />}
      </button>
    );
  };

  return (
    <span className="inline-flex items-center gap-1">
      <span
        role="group"
        aria-label="投票"
        className={cx('inline-flex items-center', size === 'sm' ? 'gap-0.5' : 'min-h-12 rounded-full bg-surface px-1')}
      >
        {arrow(1)}
        <span
          className={cx(
            'min-w-7 text-center font-bold tabular-nums',
            size === 'sm' ? 'text-[13px]' : 'text-[15px]',
            state.myVote === 1 && 'text-up',
            state.myVote === -1 && 'text-down',
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

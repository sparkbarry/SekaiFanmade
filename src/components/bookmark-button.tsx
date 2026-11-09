'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { BookmarkIcon, cx } from '@/components/ui';

/** マイリスト, the game's saved charts: the same list as the in-game マイリスト tab. */
export function BookmarkButton({
  chartId,
  bookmarked,
  signedIn,
  loginNext,
}: {
  chartId: string;
  bookmarked: boolean;
  signedIn: boolean;
  loginNext: string;
}) {
  const router = useRouter();
  const [saved, setSaved] = useState(bookmarked);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = async () => {
    if (!signedIn) {
      router.push(`/auth/login?next=${encodeURIComponent(loginNext)}`);
      return;
    }
    if (pending) return;
    const next = !saved;
    setSaved(next);
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/charts/${chartId}/bookmark`, { method: next ? 'PUT' : 'DELETE' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error?.message ?? '操作失败。');
      }
    } catch (e) {
      setSaved(!next);
      setError(e instanceof Error ? e.message : '操作失败。');
    } finally {
      setPending(false);
    }
  };

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={toggle}
        disabled={pending}
        aria-pressed={saved}
        title={saved ? '从マイリスト移除' : '加入マイリスト'}
        className={cx(
          'grid size-12 place-items-center rounded-full border-[1.5px] transition disabled:opacity-60',
          saved ? 'border-transparent bg-primary-soft text-on-primary-soft' : 'border-border bg-card hover:bg-surface',
        )}
      >
        <BookmarkIcon className={cx('size-[18px]', saved && 'fill-current')} />
        <span className="sr-only">{saved ? '从マイリスト移除' : '加入マイリスト'}</span>
      </button>
      {error && <span className="text-xs text-danger">{error}</span>}
    </span>
  );
}

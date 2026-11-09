import Link from 'next/link';
import { cx } from '@/components/ui';

/** Page numbers as round pills around the current one, with arrows at the ends. */
export function Pagination({ page, pages, href }: { page: number; pages: number; href: (page: number) => string }) {
  if (pages <= 1) return null;
  const shown = new Set([1, pages, page - 1, page, page + 1].filter((p) => p >= 1 && p <= pages));
  const list = [...shown].sort((a, b) => a - b);
  const pill = 'grid h-11 min-w-11 place-items-center rounded-full px-3 text-sm font-semibold tabular-nums';
  const arrow = (to: number, label: string, rel: 'prev' | 'next', d: string) =>
    to >= 1 && to <= pages ? (
      <Link href={href(to)} rel={rel} aria-label={label} className={cx(pill, 'bg-card shadow-elev-1 hover:bg-surface')}>
        <svg aria-hidden viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d={d} />
        </svg>
      </Link>
    ) : null;
  return (
    <nav className="flex flex-wrap items-center justify-center gap-2 pt-2" aria-label="分页">
      {arrow(page - 1, '上一页', 'prev', 'M15 6l-6 6 6 6')}
      {list.map((p, i) => (
        <span key={p} className="contents">
          {i > 0 && p - list[i - 1] > 1 && <span className="px-1 text-muted">…</span>}
          <Link
            href={href(p)}
            aria-current={p === page ? 'page' : undefined}
            className={cx(pill, p === page ? 'bg-primary text-on-primary' : 'bg-card shadow-elev-1 hover:bg-surface')}
          >
            {p}
          </Link>
        </span>
      ))}
      {arrow(page + 1, '下一页', 'next', 'M9 6l6 6-6 6')}
    </nav>
  );
}

import Link from 'next/link';
import { buttonClass } from '@/components/ui';

export function Pagination({ page, pages, href }: { page: number; pages: number; href: (page: number) => string }) {
  if (pages <= 1) return null;
  return (
    <nav className="mt-8 flex items-center justify-center gap-3" aria-label="分页">
      {page > 1 ? (
        <Link className={buttonClass('outline')} href={href(page - 1)} rel="prev">
          上一页
        </Link>
      ) : (
        <span className={buttonClass('outline', 'pointer-events-none opacity-40')}>上一页</span>
      )}
      <span className="text-sm font-bold tabular-nums">
        {page} / {pages}
      </span>
      {page < pages ? (
        <Link className={buttonClass('outline')} href={href(page + 1)} rel="next">
          下一页
        </Link>
      ) : (
        <span className={buttonClass('outline', 'pointer-events-none opacity-40')}>下一页</span>
      )}
    </nav>
  );
}

import Link from 'next/link';
import { Fragment } from 'react';
import { SearchIcon, UploadIcon } from '@/components/ui';

export interface Crumb {
  label: string;
  href?: string;
}

/**
 * The bar above every page: where you are (a frosted breadcrumb pill), chart search and the upload
 * button. `keep` carries the home page's filters into a new search.
 */
export function PageBar({
  crumbs,
  q = '',
  keep = {},
  upload = true,
}: {
  crumbs: Crumb[];
  q?: string;
  keep?: Record<string, string | undefined>;
  upload?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <nav
        aria-label="位置"
        className="flex min-h-11 max-w-full items-center gap-2 overflow-hidden rounded-full bg-glass px-[18px] text-sm text-muted shadow-elev-1 backdrop-blur-xl"
      >
        {crumbs.map((c, i) => (
          <Fragment key={i}>
            {i > 0 && <span aria-hidden>/</span>}
            {c.href ? (
              <Link href={c.href} className="whitespace-nowrap hover:text-foreground">
                {c.label}
              </Link>
            ) : (
              <span aria-current="page" className="truncate font-semibold text-foreground">
                {c.label}
              </span>
            )}
          </Fragment>
        ))}
      </nav>
      <div className="hidden flex-1 sm:block" />
      <form
        action="/"
        role="search"
        className="flex min-h-11 min-w-0 flex-[1_1_240px] items-center gap-2.5 rounded-full bg-card pr-2 pl-4 shadow-elev-1 sm:max-w-[380px]"
      >
        {Object.entries(keep).map(([k, v]) => (v ? <input key={k} type="hidden" name={k} value={v} /> : null))}
        <SearchIcon className="size-[18px] shrink-0 text-muted" />
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="曲名、谱师、歌手或 #编号"
          aria-label="搜索谱面"
          className="min-w-0 flex-1 bg-transparent py-2 text-sm outline-none placeholder:text-muted"
        />
      </form>
      {upload && (
        <Link
          href="/upload"
          className="inline-flex min-h-11 items-center gap-2 rounded-full bg-primary px-5 text-sm font-semibold text-on-primary hover:brightness-110 max-sm:hidden"
        >
          <UploadIcon className="size-[18px]" />
          上传谱面
        </Link>
      )}
    </div>
  );
}

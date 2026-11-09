import Link from 'next/link';
import { ChartGrid } from '@/components/chart-card';
import { PageBar } from '@/components/page-bar';
import { Pagination } from '@/components/pagination';
import { cx, DIFFICULTY_DOT, DIFFICULTY_LABEL, EmptyState, PageHeader, segmentClass, segmentTrackClass } from '@/components/ui';
import { listCharts, SORTS, type Sort } from '@/lib/charts';
import { DIFFICULTIES, type Difficulty } from '@/lib/db/schema';

export const dynamic = 'force-dynamic';

const SORT_LABEL: Partial<Record<Sort, string>> = { hot: '热门', new: '最新', top: '得分最高', comments: '评论最多', daily: '今日游玩' };
const SHOWN_SORTS = ['hot', 'new', 'top', 'comments', 'daily'] as const;

type Search = Promise<Record<string, string | string[] | undefined>>;

function one(v: string | string[] | undefined) {
  return Array.isArray(v) ? v[0] : v;
}

export default async function Home({ searchParams }: { searchParams: Search }) {
  const sp = await searchParams;
  const q = one(sp.q)?.trim() ?? '';
  const d = one(sp.d);
  const difficulty = (DIFFICULTIES as readonly string[]).includes(d ?? '') ? (d as Difficulty) : undefined;
  const s = one(sp.sort);
  const sort: Sort = (SORTS as readonly string[]).includes(s ?? '') ? (s as Sort) : 'hot';
  const page = Math.max(1, Number(one(sp.page)) || 1);
  const tag = one(sp.tag)?.trim() || undefined;
  const result = await listCharts({ q, difficulty, sort, page, tag });

  const href = (over: { d?: string | null; sort?: string; page?: number; tag?: string | null }) => {
    const p = new URLSearchParams();
    if (q) p.set('q', q);
    const tt = over.tag === undefined ? tag : over.tag;
    if (tt) p.set('tag', tt);
    const dd = over.d === undefined ? difficulty : over.d;
    if (dd) p.set('d', dd);
    const ss = over.sort ?? sort;
    if (ss !== 'hot') p.set('sort', ss);
    if (over.page && over.page > 1) p.set('page', String(over.page));
    const str = p.toString();
    return str ? `/?${str}` : '/';
  };

  const chip = 'inline-flex min-h-9 items-center gap-2 rounded-full border-[1.5px] px-3.5 text-[13px] font-semibold transition';

  return (
    <>
      <PageBar
        crumbs={[{ label: 'Sekai Fanmade', href: '/' }, { label: q ? `搜索「${q}」` : '谱面广场' }]}
        q={q}
        keep={{ d: difficulty, sort: sort !== 'hot' ? sort : undefined, tag }}
      />

      <PageHeader overline="OpenSekai 自制谱社区" title="谱面" mark="广场">
        浏览、试听、下载社区上传的自制谱。下载的 ZIP 在 OpenSekai「自制谱管理」里导入即可游玩，游戏里的「在线谱面」也能直接下载。
      </PageHeader>

      <section aria-label="筛选" className="flex flex-col gap-3.5 rounded-[20px] bg-card px-4 py-4 shadow-elev-1 sm:px-5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="w-11 shrink-0 text-[13px] font-semibold text-muted">难度</span>
          <Link
            href={href({ d: null, page: 1 })}
            aria-current={!difficulty ? 'true' : undefined}
            className={cx(chip, !difficulty ? 'border-primary bg-primary text-on-primary' : 'border-border bg-card hover:bg-surface')}
          >
            全部
          </Link>
          {DIFFICULTIES.map((diff) => {
            const on = difficulty === diff;
            return (
              <Link
                key={diff}
                href={href({ d: diff, page: 1 })}
                aria-current={on ? 'true' : undefined}
                className={cx(chip, on ? 'border-current' : 'border-border bg-card hover:bg-surface')}
                style={on ? { background: `var(--diff-${diff}-bg)`, color: `var(--diff-${diff}-fg)` } : { color: `var(--diff-${diff}-fg)` }}
              >
                <span aria-hidden className="size-2 rounded-full" style={{ background: DIFFICULTY_DOT[diff] }} />
                {DIFFICULTY_LABEL[diff]}
              </Link>
            );
          })}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="w-11 shrink-0 text-[13px] font-semibold text-muted">排序</span>
          <div role="group" aria-label="排序" className={segmentTrackClass}>
            {SHOWN_SORTS.map((key) => (
              <Link key={key} href={href({ sort: key, page: 1 })} aria-current={sort === key ? 'true' : undefined} className={segmentClass(sort === key)}>
                {SORT_LABEL[key]}
              </Link>
            ))}
          </div>
          <span className="ml-auto flex items-center gap-2 text-[13px] text-muted">
            {tag && (
              <Link
                href={href({ tag: null, page: 1 })}
                className="inline-flex min-h-8 items-center gap-1.5 rounded-full bg-secondary px-3 font-semibold text-on-secondary hover:brightness-95"
              >
                标签「{tag}」
                <svg aria-hidden viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
                <span className="sr-only">清除标签</span>
              </Link>
            )}
            共 {result.total} 份谱面
          </span>
        </div>
      </section>

      {result.items.length === 0 ? (
        <EmptyState>{q || difficulty || tag ? '没有找到符合条件的谱面' : '还没有人上传谱面'}</EmptyState>
      ) : (
        <ChartGrid charts={result.items} />
      )}
      <Pagination page={result.page} pages={result.pages} href={(p) => href({ page: p })} />
    </>
  );
}

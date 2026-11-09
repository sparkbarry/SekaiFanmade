import Link from 'next/link';
import { ChartGrid } from '@/components/chart-card';
import { Pagination } from '@/components/pagination';
import { Button, cx, DIFFICULTY_COLOR, DIFFICULTY_LABEL, EmptyState, inputClass } from '@/components/ui';
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

  const href = (over: { d?: string | null; sort?: string; page?: number }) => {
    const p = new URLSearchParams();
    if (q) p.set('q', q);
    if (tag) p.set('tag', tag);
    const dd = over.d === undefined ? difficulty : over.d;
    if (dd) p.set('d', dd);
    const ss = over.sort ?? sort;
    if (ss !== 'hot') p.set('sort', ss);
    if (over.page && over.page > 1) p.set('page', String(over.page));
    const str = p.toString();
    return str ? `/?${str}` : '/';
  };

  return (
    <div className="flex flex-col gap-6">
      <section className="overflow-hidden rounded-[14px] border-2 border-outline bg-card shadow-drop">
        <div className="hero-stripe h-3 border-b-2 border-outline" />
        <div className="flex flex-col gap-4 px-5 py-6 sm:px-8 sm:py-8">
          <h1 className="text-3xl font-black tracking-tight sm:text-4xl">
            OpenSekai <span className="text-brand dark:text-hero">自制谱</span>
          </h1>
          <form action="/" className="flex gap-2">
            {difficulty && <input type="hidden" name="d" value={difficulty} />}
            {sort !== 'hot' && <input type="hidden" name="sort" value={sort} />}
            <input
              type="search"
              name="q"
              defaultValue={q}
              placeholder="曲名、谱面名、歌手、作曲或上传者"
              aria-label="搜索谱面"
              className={inputClass}
            />
            <Button type="submit" className="shrink-0 whitespace-nowrap">
              搜索
            </Button>
          </form>
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-2">
        <Link
          href={href({ d: null, page: 1 })}
          className={cx(
            'rounded-full border-[1.5px] border-outline px-3 py-1 text-xs font-bold',
            !difficulty ? 'bg-cream ring-2 ring-outline ring-offset-2 ring-offset-background' : 'bg-card',
          )}
        >
          全部
        </Link>
        {DIFFICULTIES.map((diff) => (
          <Link
            key={diff}
            href={href({ d: diff, page: 1 })}
            aria-current={difficulty === diff ? 'true' : undefined}
            className={cx(
              'rounded-full border-[1.5px] border-[#382d2a] px-3 py-1 text-xs font-bold text-[#382d2a]',
              difficulty === diff ? 'ring-2 ring-outline ring-offset-2 ring-offset-background' : 'opacity-80 hover:opacity-100',
            )}
            style={{ background: DIFFICULTY_COLOR[diff] }}
          >
            {DIFFICULTY_LABEL[diff]}
          </Link>
        ))}
        <div className="ml-auto flex gap-1">
          {SHOWN_SORTS.map((key) => (
            <Link
              key={key}
              href={href({ sort: key, page: 1 })}
              className={cx(
                'rounded-[10px] px-2.5 py-1 text-xs font-bold',
                sort === key ? 'border-[1.5px] border-outline bg-cream' : 'text-muted hover:bg-cream',
              )}
            >
              {SORT_LABEL[key]}
            </Link>
          ))}
        </div>
      </div>

      {result.items.length === 0 ? (
        <EmptyState>{q || difficulty || tag ? '没有找到符合条件的谱面' : '还没有人上传谱面'}</EmptyState>
      ) : (
        <>
          <p className="text-sm text-muted">
            {tag && <>标签「{tag}」· </>}共 {result.total} 份谱面
          </p>
          <ChartGrid charts={result.items} />
        </>
      )}
      <Pagination page={result.page} pages={result.pages} href={(p) => href({ page: p })} />
    </div>
  );
}

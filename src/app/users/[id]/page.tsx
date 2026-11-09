import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChartGrid } from '@/components/chart-card';
import { PageBar } from '@/components/page-bar';
import { Pagination } from '@/components/pagination';
import { Avatar, ButtonLink, cx, EmptyState, formatDate, segmentClass, segmentTrackClass, UploadIcon } from '@/components/ui';
import { getUser, listCharts } from '@/lib/charts';
import { karmaOf } from '@/lib/comments';
import { getViewer } from '@/lib/session';

export const dynamic = 'force-dynamic';

type Params = Promise<{ id: string }>;
type Search = Promise<{ tab?: string; page?: string }>;

type Tab = 'uploads' | 'upvoted' | 'mylist';

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const user = await getUser((await params).id);
  return { title: user ? user.nickname : '用户不存在' };
}

export default async function UserPage({ params, searchParams }: { params: Params; searchParams: Search }) {
  const { id } = await params;
  const sp = await searchParams;
  const user = await getUser(id);
  if (!user) notFound();
  const viewer = await getViewer();
  const own = viewer?.id === id;
  // マイリスト (the game's bookmarks) is private: only its owner sees the tab.
  const tab: Tab = sp.tab === 'upvoted' ? 'upvoted' : sp.tab === 'mylist' && own ? 'mylist' : 'uploads';
  const page = Math.max(1, Number(sp.page) || 1);
  const query =
    tab === 'upvoted'
      ? { upvotedBy: id, page, sort: 'new' as const }
      : tab === 'mylist'
        ? { bookmarkedBy: id, page, sort: 'new' as const }
        : { uploaderId: id, page, sort: 'new' as const };
  const [result, stats, uploads] = await Promise.all([
    listCharts(query),
    karmaOf(id),
    tab === 'uploads' ? null : listCharts({ uploaderId: id, page: 1, sort: 'new' }),
  ]);
  const uploadCount = tab === 'uploads' ? result.total : (uploads?.total ?? 0);

  const tabs: [Tab, string][] = [
    ['uploads', '上传的谱面'],
    ['upvoted', '赞过的谱面'],
    ...(own ? ([['mylist', 'マイリスト']] as [Tab, string][]) : []),
  ];
  const tabHref = (key: Tab, p = 1) => {
    const q = new URLSearchParams();
    if (key !== 'uploads') q.set('tab', key);
    if (p > 1) q.set('page', String(p));
    const s = q.toString();
    return s ? `/users/${id}?${s}` : `/users/${id}`;
  };

  return (
    <>
      <PageBar crumbs={[{ label: '用户' }, { label: user.nickname }]} />

      <section aria-label="用户资料" className="flex flex-wrap items-center gap-5 rounded-[28px] bg-card p-5 shadow-elev-2 sm:gap-6 sm:px-7 sm:py-6">
        <Avatar src={user.avatarUrl} name={user.nickname} size={88} />
        <div className="flex min-w-0 flex-[1_1_220px] flex-col gap-1">
          <h1 className="truncate text-[26px] leading-9 font-semibold sm:text-[28px]">{user.nickname}</h1>
          <p className="text-sm text-muted">{formatDate(user.createdAt.toISOString())} 加入</p>
          {own && (
            <a className="mt-1 w-fit text-[13px] font-semibold text-link hover:underline" href="https://sso.ourtaiko.org/profile/">
              在 OurTaiko 账号中心修改昵称和头像
            </a>
          )}
        </div>
        <dl className="flex flex-wrap gap-3">
          <div className="flex min-w-[88px] flex-col items-center rounded-[20px] bg-secondary px-4 py-3" title="别人对其谱面和评论的赞减踩">
            <dt className="order-2 text-xs text-on-secondary">karma</dt>
            <dd className="text-2xl font-bold tabular-nums">{stats.karma}</dd>
          </div>
          <div className="flex min-w-[88px] flex-col items-center rounded-[20px] bg-surface px-4 py-3">
            <dt className="order-2 text-xs text-muted">谱面</dt>
            <dd className="text-2xl font-bold tabular-nums">{uploadCount}</dd>
          </div>
          <div className="flex min-w-[88px] flex-col items-center rounded-[20px] bg-surface px-4 py-3">
            <dt className="order-2 text-xs text-muted">评论</dt>
            <dd className="text-2xl font-bold tabular-nums">{stats.commentCount}</dd>
          </div>
        </dl>
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <nav aria-label="谱面列表" className={cx(segmentTrackClass, 'bg-surface-high')}>
          {tabs.map(([key, label]) => (
            <Link key={key} href={tabHref(key)} aria-current={tab === key ? 'page' : undefined} className={cx(segmentClass(tab === key), 'min-h-10 text-sm')}>
              {label}
            </Link>
          ))}
        </nav>
        {own && (
          <ButtonLink href="/upload" variant="tonal" className="ml-auto">
            <UploadIcon className="size-[18px]" />
            上传谱面
          </ButtonLink>
        )}
      </div>

      {result.items.length === 0 ? (
        <EmptyState>
          {tab === 'upvoted' ? '还没有赞过的谱面' : tab === 'mylist' ? 'マイリスト是空的，在游戏的在线谱面里点「登録」加入' : '还没有上传谱面'}
        </EmptyState>
      ) : (
        <ChartGrid charts={result.items} />
      )}
      <Pagination page={result.page} pages={result.pages} href={(p) => tabHref(tab, p)} />
    </>
  );
}

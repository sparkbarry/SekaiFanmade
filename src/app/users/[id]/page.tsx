import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChartGrid } from '@/components/chart-card';
import { Pagination } from '@/components/pagination';
import { Avatar, ButtonLink, cx, EmptyState } from '@/components/ui';
import { getUser, listCharts } from '@/lib/charts';
import { karmaOf } from '@/lib/comments';
import { getViewer } from '@/lib/session';

export const dynamic = 'force-dynamic';

type Params = Promise<{ id: string }>;
type Search = Promise<{ tab?: string; page?: string }>;

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
  const tab = sp.tab === 'upvoted' ? 'upvoted' : 'uploads';
  const page = Math.max(1, Number(sp.page) || 1);
  const [result, stats] = await Promise.all([
    listCharts(tab === 'upvoted' ? { upvotedBy: id, page, sort: 'new' } : { uploaderId: id, page, sort: 'new' }),
    karmaOf(id),
  ]);
  const own = viewer?.id === id;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-4">
        <Avatar src={user.avatarUrl} name={user.nickname} size={64} />
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-black">{user.nickname}</h1>
          <p className="text-sm text-muted">
            <span title="别人对其谱面和评论的赞减踩">karma {stats.karma}</span> · 评论 {stats.commentCount}
          </p>
          {own && (
            <a className="text-sm text-link hover:underline" href="https://sso.ourtaiko.org/profile/">
              在账号中心修改昵称和头像
            </a>
          )}
        </div>
        {own && (
          <ButtonLink href="/upload" className="ml-auto">
            上传谱面
          </ButtonLink>
        )}
      </div>
      <div className="flex gap-1">
        {(
          [
            ['uploads', '上传的谱面'],
            ['upvoted', '赞过的谱面'],
          ] as const
        ).map(([key, label]) => (
          <Link
            key={key}
            href={key === 'uploads' ? `/users/${id}` : `/users/${id}?tab=upvoted`}
            className={cx(
              'rounded-[10px] px-3 py-1.5 text-sm font-bold',
              tab === key ? 'border-[1.5px] border-outline bg-cream shadow-[0_2px_0_var(--outline)]' : 'hover:bg-cream',
            )}
          >
            {label}
          </Link>
        ))}
      </div>
      {result.items.length === 0 ? (
        <EmptyState>{tab === 'upvoted' ? '还没有赞过的谱面' : '还没有上传谱面'}</EmptyState>
      ) : (
        <ChartGrid charts={result.items} />
      )}
      <Pagination
        page={result.page}
        pages={result.pages}
        href={(p) => `/users/${id}?${new URLSearchParams({ ...(tab === 'upvoted' ? { tab } : {}), page: String(p) })}`}
      />
    </div>
  );
}

import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { BookmarkButton } from '@/components/bookmark-button';
import { Jacket } from '@/components/chart-card';
import { Comments } from '@/components/comments';
import { PageBar } from '@/components/page-bar';
import { PreviewPlayer } from '@/components/preview-player';
import {
  Avatar,
  buttonClass,
  ButtonLink,
  Chip,
  DifficultyBadge,
  DIFFICULTY_LABEL,
  DownloadIcon,
  formatBytes,
  formatDate,
  InfoIcon,
  Notice,
  Section,
} from '@/components/ui';
import { VoteControl } from '@/components/vote-control';
import { getChart } from '@/lib/charts';
import { getViewer } from '@/lib/session';

export const dynamic = 'force-dynamic';

type Params = Promise<{ id: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const chart = await getChart((await params).id);
  return chart ? { title: `${chart.scoreTitle}（${chart.title}）` } : { title: '谱面不存在' };
}

export default async function ChartPage({ params }: { params: Params }) {
  const ref = (await params).id;
  const chart = await getChart(ref);
  if (!chart) notFound();
  // /charts/12 (the number) works too; send it to the id URL.
  if (ref !== chart.id) redirect(`/charts/${chart.id}`);
  const id = chart.id;
  const viewer = await getViewer();
  const mine = viewer ? await getChart(id, viewer.id) : null;
  const myVote = mine?.myVote ?? 0;
  const canEdit = !!viewer && (viewer.id === chart.uploader.id || viewer.isAdmin);
  const artists = [...new Set([chart.singer, chart.composer].filter(Boolean))].join(' · ');

  const info: [string, string][] = (
    [
      ['编号', `#${chart.numberId}`],
      ['难度', `${DIFFICULTY_LABEL[chart.difficulty]} ${chart.playLevel}`],
      ['曲名', chart.title],
      ['歌手', chart.singer],
      ['作曲', chart.composer],
      ['作词', chart.lyricist],
      ['编曲', chart.arranger],
      ['合作', chart.collaborationLabel],
      ['上传', formatDate(chart.createdAt)],
      ['更新', chart.revision > 1 ? `${formatDate(chart.updatedAt)}（第 ${chart.revision} 版）` : ''],
      ['大小', formatBytes(chart.packageSize)],
      ['游玩', `${chart.playCount} 次`],
      ['下载', `${chart.downloadCount} 次`],
    ] as [string, string][]
  ).filter(([, v]) => v);

  return (
    <>
      <PageBar crumbs={[{ label: '谱面广场', href: '/' }, { label: chart.scoreTitle }]} />

      <header className="flex flex-col gap-2 px-1 pt-1">
        <div className="flex flex-wrap items-center gap-2">
          <Chip tone="neutral" className="text-xs">#{chart.numberId}</Chip>
          <DifficultyBadge difficulty={chart.difficulty} level={chart.playLevel} size="sm" />
          {chart.hasVideo && <Chip tone="neutral" className="text-xs">含 MV</Chip>}
          {chart.allowDerivative && <Chip className="text-xs">二次利用OK</Chip>}
          {chart.parentChartId && (
            <Link href={`/charts/${chart.parentChartId}`} className="hover:brightness-95">
              <Chip tone="tertiary" className="text-xs">親譜面 →</Chip>
            </Link>
          )}
        </div>
        <h1 className="break-words text-[26px] leading-9 font-semibold sm:text-[32px] sm:leading-10">{chart.scoreTitle}</h1>
        {(chart.scoreTitle !== chart.title || artists) && (
          <p className="text-base text-muted">
            {[chart.scoreTitle !== chart.title ? chart.title : null, artists].filter(Boolean).join(' · ')}
          </p>
        )}
        <Link href={`/users/${chart.uploader.id}`} className="mt-1 flex w-fit items-center gap-2 rounded-full py-1 pr-3 text-sm hover:bg-card">
          <Avatar src={chart.uploader.avatarUrl} name={chart.uploader.nickname} size={28} />
          <span>
            <span className="text-muted">谱师</span> <span className="font-semibold">{chart.uploader.nickname}</span>
          </span>
        </Link>
        {chart.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {chart.tags.map((t) => (
              <Link
                key={t}
                href={`/?tag=${encodeURIComponent(t)}`}
                className="inline-flex min-h-8 items-center rounded-full bg-card px-3 text-[13px] font-semibold text-muted shadow-elev-1 hover:text-foreground"
              >
                # {t}
              </Link>
            ))}
          </div>
        )}
      </header>

      <div className="grid items-start gap-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] xl:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
        <section aria-label="封面与操作" className="flex flex-col gap-4 rounded-[28px] bg-card p-4 shadow-elev-2">
          <div className="overflow-hidden rounded-[20px]">
            <Jacket url={chart.jacketUrl} title={chart.title} difficulty={chart.difficulty} />
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <a href={`/charts/${chart.id}/download`} className={buttonClass('default', 'min-h-12 px-6 text-[15px]')}>
              <DownloadIcon className="size-[18px]" />
              下载 ZIP · {formatBytes(chart.packageSize)}
            </a>
            <PreviewPlayer src={chart.audioUrl} start={chart.previewStartSec} />
            <VoteControl kind="chart" id={chart.id} score={chart.score} myVote={myVote} signedIn={!!viewer} loginNext={`/charts/${chart.id}`} />
            <BookmarkButton chartId={chart.id} bookmarked={!!mine?.bookmarked} signedIn={!!viewer} loginNext={`/charts/${chart.id}`} />
            {canEdit && (
              <ButtonLink variant="outline" href={`/charts/${chart.id}/edit`} className="min-h-12">
                管理
              </ButtonLink>
            )}
          </div>
          <Notice>
            在 OpenSekai 的「自制谱管理」里点「新建谱面」→「导入 ZIP / 文件夹」，选下载的 ZIP 即可游玩。游戏的「在线谱面」也能直接下载。
          </Notice>
        </section>

        <section aria-labelledby="info-title" className="overflow-hidden rounded-[28px] bg-card shadow-elev-2">
          <h2 id="info-title" className="flex items-center gap-2.5 border-b border-border px-5 py-4 text-lg font-semibold sm:px-6">
            <InfoIcon className="size-5 text-primary" />
            谱面信息
          </h2>
          <dl>
            {info.map(([k, v]) => (
              <div key={k} className="flex justify-between gap-4 border-b border-surface px-5 py-3 text-sm last:border-b-0 sm:px-6">
                <dt className="shrink-0 text-muted">{k}</dt>
                <dd className="min-w-0 break-words text-right font-semibold">{v}</dd>
              </div>
            ))}
          </dl>
        </section>
      </div>

      <Section title="简介">
        {chart.description ? (
          <p className="whitespace-pre-wrap break-words text-sm leading-6">{chart.description}</p>
        ) : (
          <p className="text-sm text-muted">谱师还没有写简介。</p>
        )}
      </Section>

      <Comments chartId={chart.id} viewer={viewer ? { id: viewer.id, isAdmin: viewer.isAdmin } : null} initialCount={chart.commentCount} />
    </>
  );
}

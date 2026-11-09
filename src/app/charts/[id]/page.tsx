import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Jacket } from '@/components/chart-card';
import { Comments } from '@/components/comments';
import { LikeButton } from '@/components/like-button';
import { PreviewPlayer } from '@/components/preview-player';
import { Avatar, ButtonLink, buttonClass, Card, DIFFICULTY_COLOR, DifficultyBadge, formatBytes, formatDate } from '@/components/ui';
import { getChart, hasLiked, listComments } from '@/lib/charts';
import { getViewer } from '@/lib/session';

export const dynamic = 'force-dynamic';

type Params = Promise<{ id: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const chart = await getChart(Number((await params).id));
  return chart ? { title: `${chart.scoreTitle}（${chart.title}）` } : { title: '谱面不存在' };
}

export default async function ChartPage({ params }: { params: Params }) {
  const id = Number((await params).id);
  const chart = await getChart(id);
  if (!chart) notFound();
  const viewer = await getViewer();
  const [comments, liked] = await Promise.all([listComments(id), viewer ? hasLiked(id, viewer.id) : false]);
  const canEdit = !!viewer && (viewer.id === chart.uploader.id || viewer.isAdmin);

  const credits: [string, string][] = (
    [
      ['歌手', chart.singer],
      ['作曲', chart.composer],
      ['作词', chart.lyricist],
      ['编曲', chart.arranger],
      ['合作', chart.collaborationLabel],
    ] as [string, string][]
  ).filter(([, v]) => v);

  return (
    <div className="flex flex-col gap-8">
      <Card className="overflow-hidden">
        <div className="h-1.5" style={{ background: DIFFICULTY_COLOR[chart.difficulty] }} />
        <div className="flex flex-col gap-6 p-5 sm:flex-row sm:p-6">
          <div className="w-full max-w-64 shrink-0 self-center overflow-hidden rounded-[10px] border-2 border-outline sm:self-start">
            <Jacket url={chart.jacketUrl} title={chart.title} />
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <DifficultyBadge difficulty={chart.difficulty} level={chart.playLevel} />
              {chart.hasVideo && (
                <span className="rounded-full border-[1.5px] border-outline bg-cream px-2.5 py-0.5 text-xs font-bold">含 MV</span>
              )}
              {chart.allowDerivative && (
                <span className="rounded-full border-[1.5px] border-outline bg-[#ffd1e3] px-2.5 py-0.5 text-xs font-bold text-[#382d2a]">
                  二次利用OK
                </span>
              )}
              {chart.parentChartId && (
                <Link
                  href={`/charts/${chart.parentChartId}`}
                  className="rounded-full border-[1.5px] border-outline bg-[#c9f3e6] px-2.5 py-0.5 text-xs font-bold text-[#382d2a] hover:underline"
                >
                  親譜面 #{chart.parentChartId}
                </Link>
              )}
              <span className="text-xs text-muted">#{chart.id}</span>
            </div>
            <h1 className="break-words text-2xl font-black leading-tight sm:text-3xl">{chart.scoreTitle}</h1>
            {chart.scoreTitle !== chart.title && <p className="text-lg font-bold">{chart.title}</p>}
            {chart.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {chart.tags.map((t) => (
                  <Link
                    key={t}
                    href={`/?tag=${encodeURIComponent(t)}`}
                    className="rounded-[8px] border-[1.5px] border-border bg-cream px-2 py-0.5 text-xs font-bold hover:border-outline"
                  >
                    {t}
                  </Link>
                ))}
              </div>
            )}
            {credits.length > 0 && (
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
                {credits.map(([k, v]) => (
                  <div key={k} className="contents">
                    <dt className="text-muted">{k}</dt>
                    <dd className="break-words">{v}</dd>
                  </div>
                ))}
              </dl>
            )}
            <Link href={`/users/${chart.uploader.id}`} className="flex w-fit items-center gap-2 text-sm font-bold hover:underline">
              <Avatar src={chart.uploader.avatarUrl} name={chart.uploader.nickname} />
              {chart.uploader.nickname}
            </Link>
            <p className="text-xs text-muted">
              {formatDate(chart.createdAt)} 上传
              {chart.revision > 1 && ` · ${formatDate(chart.updatedAt)} 更新（第 ${chart.revision} 版）`} · {formatBytes(chart.packageSize)} · 游玩 {chart.playCount} 次 · 下载{' '}
              {chart.downloadCount} 次
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <a href={`/charts/${chart.id}/download`} className={buttonClass('default')}>
                ↓ 下载 ZIP
              </a>
              <PreviewPlayer src={chart.audioUrl} start={chart.previewStartSec} />
              <LikeButton chartId={chart.id} liked={liked} count={chart.likeCount} signedIn={!!viewer} />
              {canEdit && (
                <ButtonLink variant="outline" href={`/charts/${chart.id}/edit`}>
                  管理
                </ButtonLink>
              )}
            </div>
          </div>
        </div>
      </Card>

      {chart.description && (
        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-black">简介</h2>
          <p className="whitespace-pre-wrap break-words rounded-[10px] border-[1.5px] border-border bg-card p-4 text-sm">
            {chart.description}
          </p>
        </section>
      )}

      <section className="rounded-[10px] border-[1.5px] border-border bg-cream p-4 text-sm">
        在 OpenSekai 的自制谱管理里点「新建谱面」→「导入 ZIP / 文件夹」，选择下载的 ZIP 即可游玩。
      </section>

      <Comments chartId={chart.id} comments={comments} viewerId={viewer?.id ?? null} canModerate={canEdit} />
    </div>
  );
}

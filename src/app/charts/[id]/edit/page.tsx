import { notFound, redirect } from 'next/navigation';
import { ChartInfoForm, DeleteChartForm } from '@/components/chart-manage';
import { PageBar } from '@/components/page-bar';
import { DifficultyBadge, Section } from '@/components/ui';
import { Uploader } from '@/components/uploader';
import { getChart } from '@/lib/charts';
import { env } from '@/lib/env';
import { getViewer } from '@/lib/session';

export const dynamic = 'force-dynamic';
export const metadata = { title: '管理谱面' };

export default async function EditChart({ params }: { params: Promise<{ id: string }> }) {
  const chart = await getChart((await params).id);
  if (!chart) notFound();
  const id = chart.id;
  const parent = chart.parentChartId ? await getChart(chart.parentChartId) : null;
  const viewer = await getViewer();
  if (!viewer) redirect(`/auth/login?next=${encodeURIComponent(`/charts/${id}/edit`)}`);
  if (viewer.id !== chart.uploader.id && !viewer.isAdmin) notFound();

  return (
    <>
      <PageBar crumbs={[{ label: '谱面广场', href: '/' }, { label: chart.scoreTitle, href: `/charts/${id}` }, { label: '管理' }]} />
      <header className="flex flex-col gap-2 px-1 pt-1">
        <DifficultyBadge difficulty={chart.difficulty} level={chart.playLevel} size="sm" />
        <h1 className="text-[26px] leading-9 font-semibold sm:text-[32px] sm:leading-10">
          管理 <span className="title-mark">{chart.scoreTitle}</span>
        </h1>
      </header>

      <div className="grid max-w-5xl items-start gap-5 lg:grid-cols-2">
        <Section title="谱面信息">
          <ChartInfoForm
            chartId={id}
            noteDesigner={chart.noteDesigner}
            description={chart.description}
            tags={chart.tags}
            allowDerivative={chart.allowDerivative}
            parentChart={parent ? String(parent.numberId) : ''}
          />
        </Section>

        <div className="flex flex-col gap-5">
          <Section title="上传新版本">
            <p className="text-[13px] leading-5 text-muted">
              曲名、难度、谱师署名等信息改为新 ZIP 里 manifest.json 的内容；简介、标签、得分、评论、游玩和下载次数保留。
            </p>
            <Uploader chartId={id} maxMb={env().UPLOAD_MAX_MB} />
          </Section>
          <Section title="删除">
            <DeleteChartForm chartId={id} />
          </Section>
        </div>
      </div>
    </>
  );
}

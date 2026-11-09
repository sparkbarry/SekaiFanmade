import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ChartInfoForm, DeleteChartForm } from '@/components/chart-manage';
import { Card, DifficultyBadge } from '@/components/ui';
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
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div className="flex flex-col gap-1">
        <Link href={`/charts/${id}`} className="text-sm text-link hover:underline">
          ← 返回谱面
        </Link>
        <h1 className="flex flex-wrap items-center gap-2 text-2xl font-black">
          {chart.scoreTitle} <DifficultyBadge difficulty={chart.difficulty} level={chart.playLevel} />
        </h1>
      </div>

      <Card className="flex flex-col gap-3 p-6">
        <h2 className="font-black">谱面信息</h2>
        <ChartInfoForm
          chartId={id}
          description={chart.description}
          tags={chart.tags}
          allowDerivative={chart.allowDerivative}
          parentChart={parent ? String(parent.numberId) : ''}
        />
      </Card>

      <Card className="flex flex-col gap-3 p-6">
        <h2 className="font-black">上传新版本</h2>
        <p className="text-xs text-muted">
          曲名、难度、作者等信息改为新 ZIP 里 manifest.json 的内容；简介、标签、喜欢、评论、游玩和下载次数保留。
        </p>
        <Uploader chartId={id} maxMb={env().UPLOAD_MAX_MB} />
      </Card>

      <Card className="flex flex-col gap-3 p-6">
        <h2 className="font-black">删除</h2>
        <DeleteChartForm chartId={id} />
      </Card>
    </div>
  );
}

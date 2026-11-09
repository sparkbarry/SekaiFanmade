import { Suspense } from 'react';
import { LoginLink } from '@/components/login-link';
import { PageBar } from '@/components/page-bar';
import { Card, Notice, PageHeader } from '@/components/ui';
import { Uploader } from '@/components/uploader';
import { env } from '@/lib/env';
import { getViewer } from '@/lib/session';

export const dynamic = 'force-dynamic';
export const metadata = { title: '上传谱面' };

const STEPS = ['在 OpenSekai 的「自制谱管理」里选中谱面。', '点详情窗口下方的「导出ZIP」。', '把导出的 ZIP 传到这里，之后在谱面的「管理」里写简介、加标签。'];

export default async function UploadPage() {
  const viewer = await getViewer();
  return (
    <>
      <PageBar crumbs={[{ label: 'Sekai Fanmade', href: '/' }, { label: '上传谱面' }]} upload={false} />
      <PageHeader title="上传" mark="谱面">
        曲名、难度、作者都取自 ZIP 里的 manifest.json。上传后可以写简介、加标签。
      </PageHeader>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Card className="flex flex-col gap-4 p-5 shadow-elev-2 sm:p-6">
          {!viewer ? (
            <div className="flex flex-col items-start gap-3 py-6">
              <p className="font-semibold">登录 OurTaiko 账号后可以上传。</p>
              <Suspense>
                <LoginLink label="登录后上传" />
              </Suspense>
            </div>
          ) : viewer.banned ? (
            <Notice tone="error">你的账号已被本站停用，不能上传。</Notice>
          ) : (
            <Uploader maxMb={env().UPLOAD_MAX_MB} />
          )}
          <p className="text-xs leading-5 text-muted">请只上传你有权分享的内容。</p>
        </Card>

        <Card className="flex flex-col gap-4 p-5 sm:p-6">
          <h2 className="text-lg font-semibold">怎么准备谱面包</h2>
          <ol className="flex flex-col gap-3">
            {STEPS.map((step, i) => (
              <li key={i} className="flex gap-3 text-sm leading-6">
                <span className="grid size-7 shrink-0 place-items-center rounded-full bg-primary text-[13px] font-bold text-on-primary">{i + 1}</span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
          <div className="h-px bg-border" />
          <h3 className="text-sm font-semibold">ZIP 里需要</h3>
          <ul className="flex flex-wrap gap-2">
            {['manifest.json', 'score.json 或 SUS', '音频 ogg / mp3 / wav'].map((x) => (
              <li key={x} className="rounded-full bg-secondary px-3 py-1 text-[13px] font-semibold text-on-secondary">
                {x}
              </li>
            ))}
            {['封面 png / jpg（可选）', 'MV mp4（可选）'].map((x) => (
              <li key={x} className="rounded-full bg-surface px-3 py-1 text-[13px] font-semibold text-muted">
                {x}
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}

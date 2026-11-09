import { LoginLink } from '@/components/login-link';
import { Card, Notice } from '@/components/ui';
import { Uploader } from '@/components/uploader';
import { env } from '@/lib/env';
import { getViewer } from '@/lib/session';
import { Suspense } from 'react';

export const dynamic = 'force-dynamic';
export const metadata = { title: '上传谱面' };

export default async function UploadPage() {
  const viewer = await getViewer();
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <h1 className="text-2xl font-black">上传谱面</h1>
      {!viewer ? (
        <Card className="flex flex-col items-start gap-3 p-6">
          <p className="font-bold">登录 OurTaiko 账号后可以上传。</p>
          <Suspense>
            <LoginLink label="登录后上传" />
          </Suspense>
        </Card>
      ) : viewer.banned ? (
        <Notice tone="error">你的账号已被本站停用，不能上传。</Notice>
      ) : (
        <Card className="flex flex-col gap-4 p-6">
          <ol className="list-decimal space-y-1 pl-5 text-sm">
            <li>在 OpenSekai 的自制谱管理里选中谱面，点「导出ZIP」。</li>
            <li>把导出的 ZIP 传到这里。曲名、难度、作者等信息取自 ZIP 里的 manifest.json。</li>
          </ol>
          <p className="text-xs text-muted">
            ZIP 里须有 manifest.json、谱面（score.json 或 SUS）和音频（ogg / mp3 / wav），封面与 MV 可选。请只上传你有权分享的内容。
          </p>
          <Uploader maxMb={env().UPLOAD_MAX_MB} />
        </Card>
      )}
    </div>
  );
}

'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { Button, cx, formatBytes, Notice, UploadIcon } from '@/components/ui';

/** Sends the ZIP as the raw body of PUT /api/v1/uploads, with progress. */
export function Uploader({ chartId, maxMb }: { chartId?: string; maxMb: number }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [drag, setDrag] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pick = (f: File | undefined | null) => {
    setError(null);
    if (!f) return;
    if (!/\.zip$/i.test(f.name)) {
      setError('请选择 .zip 文件。');
      return;
    }
    if (f.size > maxMb * 1024 * 1024) {
      setError(`文件太大（上限 ${maxMb} MB）。`);
      return;
    }
    setFile(f);
  };

  const upload = () => {
    if (!file) return;
    setError(null);
    setProgress(0);
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', chartId ? `/api/v1/uploads?chart=${chartId}` : '/api/v1/uploads');
    xhr.setRequestHeader('Content-Type', 'application/zip');
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) setProgress(e.loaded / e.total);
    };
    xhr.upload.onload = () => setProcessing(true);
    xhr.onload = () => {
      setProcessing(false);
      setProgress(null);
      let body: { id?: string; error?: { message?: string } } = {};
      try {
        body = JSON.parse(xhr.responseText);
      } catch {}
      if (xhr.status >= 200 && xhr.status < 300 && body.id) {
        router.push(`/charts/${body.id}`);
        router.refresh();
      } else {
        setError(body.error?.message ?? `上传失败（HTTP ${xhr.status}）。`);
      }
    };
    xhr.onerror = () => {
      setProcessing(false);
      setProgress(null);
      setError('网络错误，上传没有完成。');
    };
    xhr.send(file);
  };

  const busy = progress !== null;

  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        disabled={busy}
        onClick={() => input.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          pick(e.dataTransfer.files[0]);
        }}
        className={cx(
          'flex min-h-56 flex-col items-center justify-center gap-3 rounded-3xl border-2 border-dashed px-6 py-8 text-center transition-colors disabled:opacity-60',
          drag ? 'border-primary bg-secondary' : 'border-primary/40 bg-secondary/50 hover:bg-secondary',
        )}
      >
        <span className="grid size-16 place-items-center rounded-full bg-primary-soft text-on-primary-soft">
          <UploadIcon className="size-7" />
        </span>
        {file ? (
          <>
            <span className="break-all text-[17px] font-semibold">{file.name}</span>
            <span className="text-[13px] text-muted">{formatBytes(file.size)} · 点击更换</span>
          </>
        ) : (
          <>
            <span className="text-[17px] font-semibold">把 ZIP 拖到这里，或点击选择</span>
            <span className="text-[13px] text-muted">OpenSekai 自制谱管理「导出ZIP」得到的文件 · 最大 {maxMb} MB</span>
          </>
        )}
      </button>
      <input
        ref={input}
        type="file"
        accept=".zip,application/zip"
        className="hidden"
        onChange={(e) => {
          pick(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
      {busy && (
        <div className="flex items-center gap-3.5 rounded-[20px] bg-surface-low p-4 shadow-[inset_0_0_0_1px_var(--outline-variant)]">
          <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-primary-soft text-xs font-bold text-on-primary-soft">ZIP</span>
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <div className="flex justify-between gap-2 text-sm">
              <span className="truncate font-semibold">{file?.name}</span>
              <span className="text-muted tabular-nums">{Math.round((progress ?? 0) * 100)}%</span>
            </div>
            <div
              role="progressbar"
              aria-label="上传进度"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round((progress ?? 0) * 100)}
              className="h-2 overflow-hidden rounded-full bg-surface-high"
            >
              <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${Math.round((progress ?? 0) * 100)}%` }} />
            </div>
            <span className="text-xs text-muted">{processing ? '正在检查谱面包…' : '上传中，完成后服务器会检查文件'}</span>
          </div>
        </div>
      )}
      {error && <Notice tone="error">{error}</Notice>}
      <div className="flex justify-end">
        <Button type="button" onClick={upload} disabled={!file || busy}>
          {chartId ? '上传新版本' : '上传'}
        </Button>
      </div>
    </div>
  );
}

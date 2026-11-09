'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { Button, cx, formatBytes, Notice } from '@/components/ui';

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
          'flex min-h-36 flex-col items-center justify-center gap-1 rounded-[14px] border-2 border-dashed px-4 py-8 text-center transition-colors',
          drag ? 'border-outline bg-cream' : 'border-input bg-card hover:bg-cream',
        )}
      >
        {file ? (
          <>
            <span className="break-all font-bold">{file.name}</span>
            <span className="text-xs text-muted">{formatBytes(file.size)} · 点击更换</span>
          </>
        ) : (
          <>
            <span className="font-bold">把 ZIP 拖到这里，或点击选择</span>
            <span className="text-xs text-muted">上限 {maxMb} MB</span>
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
        <div className="flex flex-col gap-1">
          <div className="h-3 overflow-hidden rounded-full border-[1.5px] border-outline bg-card">
            <div className="h-full bg-hero transition-[width]" style={{ width: `${Math.round((progress ?? 0) * 100)}%` }} />
          </div>
          <span className="text-xs text-muted">{processing ? '正在检查谱面包…' : `上传中 ${Math.round((progress ?? 0) * 100)}%`}</span>
        </div>
      )}
      {error && <Notice tone="error">{error}</Notice>}
      <div>
        <Button type="button" onClick={upload} disabled={!file || busy}>
          {chartId ? '上传新版本' : '上传'}
        </Button>
      </div>
    </div>
  );
}

'use client';

import { useState } from 'react';
import { buttonClass, DownloadIcon, formatBytes } from '@/components/ui';
import type { ChartPackage } from '@/lib/charts';

/**
 * 下载 ZIP: the server keeps no ZIP, so the browser fetches the parts from the CDN, checks their hashes, and
 * zips them with JSZip into the same folder layout OpenSekai's 导出ZIP makes (manifest.json at the root).
 */
export function DownloadButton({
  chartId,
  pkg,
  fileName,
  size,
}: {
  chartId: string;
  pkg: ChartPackage | null;
  fileName: string;
  size: number;
}) {
  const [progress, setProgress] = useState<number | null>(null);
  const [zipping, setZipping] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!pkg) {
    return (
      <span className={buttonClass('default', 'min-h-12 px-6 text-[15px] opacity-60')} aria-disabled>
        谱面整理中，请稍后再试
      </span>
    );
  }

  const download = async () => {
    if (progress !== null) return;
    setError(null);
    setProgress(0);
    try {
      const total = pkg.files.reduce((n, f) => n + f.size, 0) || 1;
      let received = 0;
      const parts: { name: string; data: Uint8Array; compress: boolean }[] = [];
      for (const file of pkg.files) {
        const res = await fetch(file.url);
        if (!res.ok || !res.body) throw new Error(`${file.name} 下载失败（${res.status}）。`);
        const reader = res.body.getReader();
        const chunks: Uint8Array[] = [];
        let length = 0;
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(value);
          length += value.length;
          received += value.length;
          setProgress(Math.min(received / total, 1));
        }
        const data = new Uint8Array(length);
        let offset = 0;
        for (const c of chunks) {
          data.set(c, offset);
          offset += c.length;
        }
        const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', data)))
          .map((b) => b.toString(16).padStart(2, '0'))
          .join('');
        if (file.sha256 && digest !== file.sha256) throw new Error(`${file.name} 下载不完整，请重试。`);
        // Audio, images and video are already compressed; only the score is worth deflating.
        parts.push({ name: file.name, data, compress: file.role === 'score' });
      }

      setZipping(true);
      const { default: JSZip } = await import('jszip');
      const zip = new JSZip();
      zip.file('manifest.json', JSON.stringify(pkg.manifest, null, 2), { compression: 'DEFLATE' });
      for (const p of parts) zip.file(p.name, p.data, { compression: p.compress ? 'DEFLATE' : 'STORE' });
      const blob = await zip.generateAsync({ type: 'blob', mimeType: 'application/zip' });

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      fetch(`/api/v1/charts/${chartId}/downloads`, { method: 'POST' }).catch(() => {});
    } catch (e) {
      setError(e instanceof Error ? e.message : '下载失败。');
    } finally {
      setProgress(null);
      setZipping(false);
    }
  };

  const busy = progress !== null;
  return (
    <span className="inline-flex flex-col gap-1">
      <button type="button" onClick={download} disabled={busy} className={buttonClass('default', 'min-h-12 px-6 text-[15px] tabular-nums disabled:opacity-80')}>
        <DownloadIcon className="size-[18px]" />
        {busy ? (zipping ? '正在打包…' : `下载中 ${Math.round((progress ?? 0) * 100)}%`) : `下载 ZIP · ${formatBytes(size)}`}
      </button>
      {error && (
        <span role="alert" className="text-xs text-danger">
          {error}
        </span>
      )}
    </span>
  );
}

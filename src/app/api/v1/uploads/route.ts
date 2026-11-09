import { NextResponse } from 'next/server';
import { createWriteStream } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { ReadableStream as WebReadableStream } from 'node:stream/web';
import { createChart, replaceChart } from '@/lib/charts';
import { env } from '@/lib/env';
import { requireApiViewer } from '@/lib/game-auth';
import { BadRequest, errorResponse } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * PUT the raw ZIP as the request body. `?chart=<id>` replaces that chart's package;
 * without it a new chart is created. The browser sends the file directly (no multipart); the game
 * (自制谱管理 › 上传) sends it with its game session as a Bearer token.
 */
export async function PUT(request: Request) {
  const dir = await mkdtemp(path.join(env().TMP_DIR ?? os.tmpdir(), 'sekai-upload-'));
  try {
    const viewer = await requireApiViewer(request);
    const max = env().UPLOAD_MAX_MB * 1024 * 1024;
    const declared = Number(request.headers.get('content-length') ?? '0');
    if (declared > max) throw new BadRequest(`文件太大（上限 ${env().UPLOAD_MAX_MB} MB）。`);
    if (!request.body) throw new BadRequest('没有收到文件。');

    const file = path.join(dir, 'upload.zip');
    let received = 0;
    const limit = new Transform({
      transform(chunk: Buffer, _enc, cb) {
        received += chunk.length;
        if (received > max) cb(new BadRequest(`文件太大（上限 ${env().UPLOAD_MAX_MB} MB）。`));
        else cb(null, chunk);
      },
    });
    await pipeline(Readable.fromWeb(request.body as unknown as WebReadableStream), limit, createWriteStream(file));
    if (received === 0) throw new BadRequest('没有收到文件。');

    const chartParam = new URL(request.url).searchParams.get('chart');
    if (chartParam) {
      const id = chartParam.trim().toLowerCase();
      if (!/^[0-9a-f]{32}$/.test(id)) throw new BadRequest('谱面 ID 不正确。');
      await replaceChart(viewer, id, file);
      return NextResponse.json({ id });
    }
    const id = await createChart(viewer, file);
    return NextResponse.json({ id }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

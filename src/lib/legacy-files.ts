import 'server-only';
import { and, eq, isNotNull, isNull } from 'drizzle-orm';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { downloadName } from '@/lib/charts';
import { charts, db } from '@/lib/db';
import { env } from '@/lib/env';
import { inFileTransaction, storeFile } from '@/lib/file-store';
import { storage } from '@/lib/storage';

/**
 * Moves charts uploaded before content-addressed storage (keys charts/<number>/r<revision>/...) to
 * `<sha256>.<ext>` files, like Fanmade's migration 038: download, store by hash, point the chart at
 * the files, then delete the old per-chart objects. Runs at start-up; safe to run again.
 */

const AUDIO_TYPES: Record<string, string> = { ogg: 'audio/ogg', mp3: 'audio/mpeg', wav: 'audio/wav' };

function extensionOf(key: string): string {
  return path.posix.extname(key).slice(1).toLowerCase();
}

export async function moveLegacyFiles(): Promise<{ moved: number; cleared: number; failed: number }> {
  const rows = await db()
    .select()
    .from(charts)
    .where(and(isNull(charts.packageFileId), isNotNull(charts.packageKey)));
  let moved = 0;
  let cleared = 0;
  let failed = 0;
  for (const row of rows) {
    if (row.deletedAt) {
      // Deleted before the move: its objects were deleted with it.
      await db()
        .update(charts)
        .set({ packageKey: null, packageSize: null, packageSha256: null, audioKey: null, jacketKey: null })
        .where(eq(charts.id, row.id));
      cleared++;
      continue;
    }
    const dir = await mkdtemp(path.join(env().TMP_DIR ?? os.tmpdir(), 'sekai-legacy-'));
    try {
      const pkgPath = path.join(dir, 'package.zip');
      await storage().download(row.packageKey!, pkgPath);
      const audioExt = extensionOf(row.audioKey!);
      const audioPath = path.join(dir, `audio.${audioExt}`);
      await storage().download(row.audioKey!, audioPath);
      let jacketPath: string | null = null;
      if (row.jacketKey) {
        const raw = path.join(dir, `jacket-src.${extensionOf(row.jacketKey)}`);
        await storage().download(row.jacketKey, raw);
        if (extensionOf(row.jacketKey) === 'jpg') {
          jacketPath = raw;
        } else {
          jacketPath = path.join(dir, 'jacket.jpg');
          await sharp(raw).flatten({ background: '#ffffff' }).jpeg({ quality: 88, mozjpeg: true }).toFile(jacketPath);
        }
      }
      const uploaded: string[] = [];
      const done = await inFileTransaction(uploaded, async (tx) => {
        const pkg = await storeFile(
          tx,
          { path: pkgPath, extension: 'zip', contentType: 'application/zip', downloadName: downloadName(row) },
          uploaded,
        );
        const audio = await storeFile(
          tx,
          { path: audioPath, extension: audioExt, contentType: AUDIO_TYPES[audioExt] ?? 'application/octet-stream' },
          uploaded,
        );
        const jacket = jacketPath
          ? await storeFile(tx, { path: jacketPath, extension: 'jpg', contentType: 'image/jpeg' }, uploaded)
          : null;
        const updated = await tx
          .update(charts)
          .set({
            packageFileId: pkg.id,
            audioFileId: audio.id,
            jacketFileId: jacket?.id ?? null,
            packageKey: null,
            packageSize: null,
            packageSha256: null,
            audioKey: null,
            jacketKey: null,
          })
          .where(and(eq(charts.id, row.id), isNull(charts.packageFileId), eq(charts.packageKey, row.packageKey!)))
          .returning({ id: charts.id });
        return updated.length > 0;
      });
      if (done) {
        for (const key of [row.packageKey, row.audioKey, row.jacketKey]) {
          if (!key) continue;
          await storage()
            .delete(key)
            .catch((err) => console.error('legacy object delete failed', key, err instanceof Error ? err.message : err));
        }
        moved++;
        console.log(`moved chart ${row.numberId} (${row.id}) to content-addressed files`);
      }
    } catch (err) {
      failed++;
      console.error(`could not move chart ${row.numberId} (${row.id})`, err instanceof Error ? err.message : err);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }
  return { moved, cleared, failed };
}

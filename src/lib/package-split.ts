import 'server-only';
import { and, eq, isNotNull, isNull } from 'drizzle-orm';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { prepareFiles, storeParts } from '@/lib/charts';
import { charts, db, files } from '@/lib/db';
import { env } from '@/lib/env';
import { inFileTransaction, releaseFiles } from '@/lib/file-store';
import { parsePackage } from '@/lib/package';
import { storage } from '@/lib/storage';

/**
 * Charts uploaded before the parts were stored separately (migration 0005) still point at a ZIP. This
 * reads each ZIP, stores its parts by hash (the audio and 512px cover are the same bytes as before, so they
 * reuse their objects), points the chart at them and releases the ZIP, which deletes its object. Runs at
 * start-up; safe to run again.
 */
export async function splitPackages(): Promise<{ split: number; failed: number }> {
  const rows = await db()
    .select({ id: charts.id, numberId: charts.numberId, packageFileId: charts.packageFileId, storageKey: files.storageKey })
    .from(charts)
    .innerJoin(files, eq(files.id, charts.packageFileId))
    .where(and(isNotNull(charts.packageFileId), isNull(charts.deletedAt)));
  let split = 0;
  let failed = 0;
  for (const row of rows) {
    const dir = await mkdtemp(path.join(env().TMP_DIR ?? os.tmpdir(), 'sekai-split-'));
    try {
      const zipPath = path.join(dir, 'package.zip');
      await storage().download(row.storageKey, zipPath);
      const parsed = await parsePackage(zipPath, dir);
      const prepared = await prepareFiles(parsed, dir);
      const uploaded: string[] = [];
      const done = await inFileTransaction(uploaded, async (tx) => {
        const parts = await storeParts(tx, prepared, uploaded);
        const updated = await tx
          .update(charts)
          .set(parts)
          .where(and(eq(charts.id, row.id), eq(charts.packageFileId, row.packageFileId!)))
          .returning({ id: charts.id });
        return updated.length > 0;
      });
      if (done) {
        await releaseFiles([row.packageFileId]);
        split++;
        console.log(`split chart ${row.numberId} (${row.id}) into its parts; released ${row.storageKey}`);
      }
    } catch (err) {
      failed++;
      console.error(`could not split chart ${row.numberId} (${row.id})`, err instanceof Error ? err.message : err);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }
  return { split, failed };
}

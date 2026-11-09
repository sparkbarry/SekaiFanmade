import 'server-only';
import { eq, inArray, or, sql } from 'drizzle-orm';
import { charts, db, files, retiredObjects } from '@/lib/db';
import { sha256File } from '@/lib/files';
import { storage } from '@/lib/storage';

/**
 * Content-addressed objects, as in OurTaiko Fanmade: `<sha256>.<extension>` flat under the site's
 * prefix, one `files` row per object. The same bytes uploaded twice share the row and the object.
 *
 * Storing and retiring the same key are serialized with a transaction-level advisory lock on the
 * key, so an object cannot be deleted between "it already exists, reuse it" and the chart row that
 * refers to it being committed.
 */

export type Tx = Parameters<Parameters<ReturnType<typeof db>['transaction']>[0]>[0];

export interface LocalFile {
  path: string;
  extension: string;
  contentType: string;
  /** Content-Disposition name, set when the object is first stored. */
  downloadName?: string;
}

export interface StoredFile {
  id: number;
  storageKey: string;
  byteSize: number;
}

async function lockKey(tx: Tx, key: string) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${key}, 0))`);
}

/**
 * Hashes the file, uploads it unless that object exists, and returns its row. Call inside a transaction;
 * keys it uploaded are appended to `uploaded` so a failed transaction can discard them (discardUnreferenced).
 */
export async function storeFile(tx: Tx, file: LocalFile, uploaded?: string[]): Promise<StoredFile> {
  const extension = file.extension.toLowerCase().replace(/^\./, '');
  if (!/^[a-z0-9]{1,8}$/.test(extension)) throw new Error(`bad extension ${file.extension}`);
  const { sha256, size } = await sha256File(file.path);
  const storageKey = `${sha256}.${extension}`;
  await lockKey(tx, storageKey);
  const [existing] = await tx.select().from(files).where(eq(files.storageKey, storageKey));
  if (existing) return { id: existing.id, storageKey, byteSize: existing.byteSize };
  await storage().put(storageKey, { file: file.path }, { contentType: file.contentType, downloadName: file.downloadName });
  uploaded?.push(storageKey);
  const [row] = await tx
    .insert(files)
    .values({ storageKey, sha256, extension, byteSize: size, contentType: file.contentType })
    .returning();
  return { id: row.id, storageKey, byteSize: row.byteSize };
}

/**
 * Deletes the objects of these file rows that no chart refers to any more. Each one in its own
 * transaction, under the key's lock; an object that cannot be deleted is queued in retired_objects.
 */
export async function releaseFiles(fileIds: (number | null | undefined)[]): Promise<void> {
  const ids = [...new Set(fileIds.filter((id): id is number => typeof id === 'number'))];
  for (const id of ids) {
    const [row] = await db().select().from(files).where(eq(files.id, id));
    if (!row) continue;
    await db().transaction(async (tx) => {
      await lockKey(tx, row.storageKey);
      const [ref] = await tx
        .select({ one: sql`1` })
        .from(charts)
        .where(
          or(
            eq(charts.packageFileId, id),
            eq(charts.scoreFileId, id),
            eq(charts.audioFileId, id),
            eq(charts.jacketFileId, id),
            eq(charts.jacketSourceFileId, id),
            eq(charts.videoFileId, id),
          ),
        )
        .limit(1);
      if (ref) return;
      await tx.delete(files).where(eq(files.id, id));
      try {
        await storage().delete(row.storageKey);
      } catch (err) {
        console.error('storage delete failed', row.storageKey, err instanceof Error ? err.message : err);
        await tx.insert(retiredObjects).values({ key: row.storageKey }).onConflictDoNothing();
      }
    });
  }
}

/**
 * Releases files that no chart refers to and that are older than an hour (a file is inserted in the same
 * transaction as the chart row that uses it, so a younger one may belong to an upload in progress). Catches
 * files left behind by a bug or a crash between a commit and its releaseFiles.
 */
export async function releaseOrphanFiles(): Promise<number> {
  const rows = await db().execute<{ id: string }>(sql`
    select f.id from ${files} f
    where f.created_at < now() - interval '1 hour'
      and not exists (
        select 1 from ${charts} c
        where f.id in (c.package_file_id, c.score_file_id, c.audio_file_id, c.jacket_file_id, c.jacket_source_file_id, c.video_file_id)
      )
    limit 100`);
  const ids = rows.map((r) => Number(r.id));
  await releaseFiles(ids);
  return ids.length;
}

/** After a rolled-back transaction: deletes objects it uploaded that ended up with no files row. */
export async function discardUnreferenced(keys: string[]): Promise<void> {
  for (const key of keys) {
    await db().transaction(async (tx) => {
      await lockKey(tx, key);
      const [row] = await tx.select({ one: sql`1` }).from(files).where(eq(files.storageKey, key));
      if (row) return;
      try {
        await storage().delete(key);
      } catch (err) {
        console.error('discard failed', key, err instanceof Error ? err.message : err);
        await tx.insert(retiredObjects).values({ key }).onConflictDoNothing();
      }
    });
  }
}

/** A transaction that stores files; if it fails, objects it uploaded are discarded again. */
export async function inFileTransaction<T>(uploaded: string[], fn: (tx: Tx) => Promise<T>): Promise<T> {
  try {
    return await db().transaction(fn);
  } catch (err) {
    await discardUnreferenced(uploaded).catch((e) => console.error('discard after rollback failed', e));
    throw err;
  }
}

/** Retries deletions that failed earlier. Keys that were stored again since are left alone. */
export async function retryRetiredObjects(): Promise<number> {
  const pending = await db().select().from(retiredObjects).limit(100);
  let done = 0;
  for (const { key } of pending) {
    await db().transaction(async (tx) => {
      await lockKey(tx, key);
      const [again] = await tx.select({ one: sql`1` }).from(files).where(eq(files.storageKey, key));
      if (!again) {
        try {
          await storage().delete(key);
        } catch (err) {
          console.error('storage delete retry failed', key, err instanceof Error ? err.message : err);
          return;
        }
      }
      await tx.delete(retiredObjects).where(eq(retiredObjects.key, key));
      done++;
    });
  }
  return done;
}

export async function fileKeys(ids: number[]): Promise<Map<number, { storageKey: string; byteSize: number }>> {
  if (ids.length === 0) return new Map();
  const rows = await db()
    .select({ id: files.id, storageKey: files.storageKey, byteSize: files.byteSize })
    .from(files)
    .where(inArray(files.id, ids));
  return new Map(rows.map((r) => [r.id, r]));
}

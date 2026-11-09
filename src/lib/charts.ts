import 'server-only';
import { and, asc, count, desc, eq, gte, ilike, inArray, isNull, or, sql, type SQL } from 'drizzle-orm';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { sha256File } from '@/lib/files';
import { sha256Hex } from '@/lib/crypto';
import { bookmarks, chartLikes, chartPlays, charts, comments, db, DIFFICULTIES, retiredObjects, users, type Difficulty } from '@/lib/db';
import { env } from '@/lib/env';
import { PackageError, parsePackage, type ParsedPackage } from '@/lib/package';
import { Forbidden, type Viewer } from '@/lib/session';
import { storage } from '@/lib/storage';

export const PAGE_SIZE = 24;
/** recommended: likes and plays weighted by age; daily: plays in the last 24 hours; plays: all-time plays; hard: highest level first. */
export const SORTS = ['new', 'popular', 'downloads', 'updated', 'recommended', 'daily', 'plays', 'hard', 'random'] as const;
export type Sort = (typeof SORTS)[number];

export class NotFound extends Error {}
export class Conflict extends Error {}
export class TooMany extends Error {}

const chartColumns = {
  id: charts.id,
  title: charts.title,
  scoreTitle: charts.scoreTitle,
  composer: charts.composer,
  lyricist: charts.lyricist,
  arranger: charts.arranger,
  singer: charts.singer,
  collaborationLabel: charts.collaborationLabel,
  description: charts.description,
  difficulty: charts.difficulty,
  playLevel: charts.playLevel,
  previewStartSec: charts.previewStartSec,
  hasVideo: charts.hasVideo,
  revision: charts.revision,
  packageKey: charts.packageKey,
  packageSize: charts.packageSize,
  jacketKey: charts.jacketKey,
  audioKey: charts.audioKey,
  downloadCount: charts.downloadCount,
  playCount: charts.playCount,
  likeCount: charts.likeCount,
  tags: charts.tags,
  allowDerivative: charts.allowDerivative,
  parentChartId: charts.parentChartId,
  commentCount: charts.commentCount,
  createdAt: charts.createdAt,
  updatedAt: charts.updatedAt,
  uploaderId: charts.uploaderId,
  uploaderName: users.nickname,
  uploaderAvatar: users.avatarUrl,
};

export interface ChartSummary {
  id: number;
  title: string;
  scoreTitle: string;
  composer: string;
  lyricist: string;
  arranger: string;
  singer: string;
  collaborationLabel: string;
  description: string;
  difficulty: Difficulty;
  playLevel: number;
  previewStartSec: number;
  hasVideo: boolean;
  revision: number;
  packageSize: number;
  jacketUrl: string | null;
  audioUrl: string;
  packageUrl: string;
  downloadCount: number;
  playCount: number;
  likeCount: number;
  commentCount: number;
  tags: string[];
  /** 二次利用OK */
  allowDerivative: boolean;
  /** 親譜面, if this chart is derived from another one. */
  parentChartId: number | null;
  /** Only present when the request is signed in. */
  liked?: boolean;
  bookmarked?: boolean;
  createdAt: string;
  updatedAt: string;
  uploader: { id: string; nickname: string; avatarUrl: string | null };
}

type ChartRow = Awaited<ReturnType<typeof selectCharts>>[number];

function toSummary(r: ChartRow): ChartSummary {
  const s = storage();
  return {
    id: r.id,
    title: r.title,
    scoreTitle: r.scoreTitle,
    composer: r.composer,
    lyricist: r.lyricist,
    arranger: r.arranger,
    singer: r.singer,
    collaborationLabel: r.collaborationLabel,
    description: r.description,
    difficulty: r.difficulty,
    playLevel: r.playLevel,
    previewStartSec: r.previewStartSec,
    hasVideo: r.hasVideo,
    revision: r.revision,
    packageSize: r.packageSize,
    jacketUrl: r.jacketKey ? s.publicUrl(r.jacketKey) : null,
    audioUrl: s.publicUrl(r.audioKey),
    packageUrl: s.publicUrl(r.packageKey),
    downloadCount: r.downloadCount,
    playCount: r.playCount,
    likeCount: r.likeCount,
    commentCount: r.commentCount,
    tags: r.tags,
    allowDerivative: r.allowDerivative,
    parentChartId: r.parentChartId,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    uploader: { id: r.uploaderId, nickname: r.uploaderName, avatarUrl: r.uploaderAvatar },
  };
}

function selectCharts() {
  return db().select(chartColumns).from(charts).innerJoin(users, eq(users.id, charts.uploaderId));
}

export interface ListQuery {
  q?: string;
  difficulty?: Difficulty;
  sort?: Sort;
  page?: number;
  uploaderId?: string;
  likedBy?: string;
  bookmarkedBy?: string;
  /** Exact tag match. */
  tag?: string;
  /** Keeps 'random' stable across pages. */
  seed?: string;
  /** Adds liked / bookmarked flags for this user. */
  viewerId?: string;
}

function escapeLike(s: string) {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

export async function listCharts(query: ListQuery): Promise<{ items: ChartSummary[]; total: number; page: number; pages: number }> {
  const where: SQL[] = [isNull(charts.deletedAt)];
  const q = query.q?.trim().slice(0, 100);
  if (q) {
    const like = `%${escapeLike(q)}%`;
    const asId = /^#?\d+$/.test(q) ? Number(q.replace('#', '')) : null;
    where.push(
      or(
        ilike(charts.title, like),
        ilike(charts.scoreTitle, like),
        ilike(charts.composer, like),
        ilike(charts.singer, like),
        ilike(charts.arranger, like),
        ilike(charts.lyricist, like),
        ilike(users.nickname, like),
        ...(asId !== null && Number.isSafeInteger(asId) ? [eq(charts.id, asId)] : []),
      )!,
    );
  }
  if (query.difficulty && (DIFFICULTIES as readonly string[]).includes(query.difficulty)) {
    where.push(eq(charts.difficulty, query.difficulty));
  }
  if (query.uploaderId) where.push(eq(charts.uploaderId, query.uploaderId));
  const tag = query.tag?.trim().slice(0, 20);
  if (tag) where.push(sql`${tag} = any(${charts.tags})`);
  if (query.bookmarkedBy) {
    where.push(
      sql`exists (select 1 from ${bookmarks} where ${bookmarks.chartId} = ${charts.id} and ${bookmarks.userId} = ${query.bookmarkedBy})`,
    );
  }
  if (query.likedBy) {
    where.push(
      sql`exists (select 1 from ${chartLikes} where ${chartLikes.chartId} = ${charts.id} and ${chartLikes.userId} = ${query.likedBy})`,
    );
  }
  const dailyPlays = sql`(select count(*) from ${chartPlays} where ${chartPlays.chartId} = ${charts.id} and ${chartPlays.createdAt} > now() - interval '1 day')`;
  const hot = sql`((${charts.likeCount} * 4 + ${charts.playCount} + ${charts.downloadCount} + 2) / power(extract(epoch from now() - ${charts.createdAt}) / 3600 + 2, 1.2))`;
  const seed = (query.seed ?? '').replace(/[^0-9a-z]/gi, '').slice(0, 16) || 'seed';
  const order = {
    new: [desc(charts.createdAt), desc(charts.id)],
    updated: [desc(charts.updatedAt), desc(charts.id)],
    popular: [desc(charts.likeCount), desc(charts.playCount), desc(charts.id)],
    downloads: [desc(charts.downloadCount), desc(charts.likeCount), desc(charts.id)],
    recommended: [desc(hot), desc(charts.id)],
    daily: [desc(dailyPlays), desc(charts.playCount), desc(charts.likeCount), desc(charts.id)],
    plays: [desc(charts.playCount), desc(charts.likeCount), desc(charts.id)],
    hard: [desc(charts.playLevel), desc(charts.likeCount), desc(charts.id)],
    random: [sql`md5(${charts.id}::text || ${seed})`],
  }[query.sort ?? 'new'];

  const page = Math.max(1, Math.trunc(query.page ?? 1));
  const filter = and(...where);
  const [rows, [{ total }]] = await Promise.all([
    selectCharts()
      .where(filter)
      .orderBy(...order)
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db().select({ total: count() }).from(charts).innerJoin(users, eq(users.id, charts.uploaderId)).where(filter),
  ]);
  const items = rows.map(toSummary);
  if (query.viewerId) await addViewerFlags(items, query.viewerId);
  return { items, total, page, pages: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
}

async function addViewerFlags(items: ChartSummary[], viewerId: string) {
  if (items.length === 0) return;
  const ids = items.map((c) => c.id);
  const [liked, saved] = await Promise.all([
    db()
      .select({ id: chartLikes.chartId })
      .from(chartLikes)
      .where(and(eq(chartLikes.userId, viewerId), inArray(chartLikes.chartId, ids))),
    db()
      .select({ id: bookmarks.chartId })
      .from(bookmarks)
      .where(and(eq(bookmarks.userId, viewerId), inArray(bookmarks.chartId, ids))),
  ]);
  const likedSet = new Set(liked.map((r) => r.id));
  const savedSet = new Set(saved.map((r) => r.id));
  for (const c of items) {
    c.liked = likedSet.has(c.id);
    c.bookmarked = savedSet.has(c.id);
  }
}

export async function getChart(id: number, viewerId?: string): Promise<ChartSummary | null> {
  if (!Number.isSafeInteger(id) || id <= 0) return null;
  const [row] = await selectCharts().where(and(eq(charts.id, id), isNull(charts.deletedAt)));
  if (!row) return null;
  const chart = toSummary(row);
  if (viewerId) await addViewerFlags([chart], viewerId);
  return chart;
}

export async function hasLiked(chartId: number, userId: string): Promise<boolean> {
  const [row] = await db()
    .select({ one: sql`1` })
    .from(chartLikes)
    .where(and(eq(chartLikes.chartId, chartId), eq(chartLikes.userId, userId)));
  return !!row;
}

/* ---------- uploads ---------- */

export function downloadName(c: { scoreTitle: string; difficulty: string; playLevel: number }): string {
  const base = c.scoreTitle.replace(/[\u0000-\u001f<>:"/\\|?*]+/g, '_').trim().slice(0, 80) || 'chart';
  return `${base} [${c.difficulty.toUpperCase()} ${c.playLevel}].zip`;
}

async function withWorkDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(path.join(env().TMP_DIR ?? os.tmpdir(), 'sekai-pkg-'));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

interface StoredObjects {
  packageKey: string;
  packageSize: number;
  packageSha256: string;
  jacketKey: string | null;
  audioKey: string;
}

async function storeObjects(chartId: number, revision: number, parsed: ParsedPackage, workDir: string): Promise<StoredObjects> {
  const s = storage();
  const prefix = `charts/${chartId}/r${revision}`;
  const put: string[] = [];
  try {
    const { manifest } = parsed;
    const pkg = await sha256File(parsed.packagePath);
    const packageKey = `${prefix}/package.zip`;
    await s.put(packageKey, { file: parsed.packagePath }, {
      contentType: 'application/zip',
      downloadName: downloadName({
        scoreTitle: manifest.scoreTitle,
        difficulty: manifest.musicDifficultyType,
        playLevel: manifest.playLevel,
      }),
    });
    put.push(packageKey);

    const audioKey = `${prefix}/audio.${parsed.audio.extension}`;
    await s.put(audioKey, { file: parsed.audio.path }, { contentType: parsed.audio.contentType });
    put.push(audioKey);

    let jacketKey: string | null = null;
    if (parsed.jacket) {
      const webp = path.join(workDir, 'jacket.webp');
      try {
        await sharp(parsed.jacket.path, { limitInputPixels: 64_000_000 })
          .rotate()
          .resize(512, 512, { fit: 'cover' })
          .webp({ quality: 86 })
          .toFile(webp);
      } catch {
        throw new PackageError(`${parsed.jacket.name} 无法解码。`);
      }
      jacketKey = `${prefix}/jacket.webp`;
      await s.put(jacketKey, { file: webp }, { contentType: 'image/webp' });
      put.push(jacketKey);
    }
    return { packageKey, packageSize: pkg.size, packageSha256: pkg.sha256, jacketKey, audioKey };
  } catch (err) {
    await deleteObjects(put);
    throw err;
  }
}

async function deleteObjects(keys: (string | null | undefined)[]) {
  const s = storage();
  for (const key of keys) {
    if (!key) continue;
    try {
      await s.delete(key);
    } catch (err) {
      console.error('storage delete failed', key, err instanceof Error ? err.message : err);
      await db().insert(retiredObjects).values({ key }).onConflictDoNothing();
    }
  }
}

async function checkDailyLimit(userId: string) {
  const since = new Date(Date.now() - 86400_000);
  const [{ n }] = await db()
    .select({ n: count() })
    .from(charts)
    .where(and(eq(charts.uploaderId, userId), gte(charts.updatedAt, since)));
  if (n >= env().UPLOADS_PER_DAY) throw new TooMany(`24 小时内最多上传或更新 ${env().UPLOADS_PER_DAY} 次。`);
}

export async function createChart(viewer: Viewer, zipPath: string): Promise<number> {
  await checkDailyLimit(viewer.id);
  return withWorkDir(async (dir) => {
    const parsed = await parsePackage(zipPath, dir);
    const [{ id }] = await db().execute<{ id: string }>(sql`select nextval(pg_get_serial_sequence('charts', 'id')) as id`);
    const chartId = Number(id);
    const stored = await storeObjects(chartId, 1, parsed, dir);
    const m = parsed.manifest;
    try {
      await db()
        .insert(charts)
        .values({
          id: chartId,
          uploaderId: viewer.id,
          title: m.title.slice(0, 200),
          scoreTitle: m.scoreTitle.slice(0, 200),
          composer: m.composer.slice(0, 200),
          lyricist: m.lyricist.slice(0, 200),
          arranger: m.arranger.slice(0, 200),
          singer: m.singer.slice(0, 200),
          collaborationLabel: m.collaborationLabel.slice(0, 200),
          description: m.description.slice(0, 2000),
          difficulty: m.musicDifficultyType,
          playLevel: m.playLevel,
          previewStartSec: m.previewStartTimeSec,
          hasVideo: parsed.video !== null,
          revision: 1,
          ...stored,
        });
    } catch (err) {
      await deleteObjects([stored.packageKey, stored.audioKey, stored.jacketKey]);
      throw err;
    }
    return chartId;
  });
}

async function ownedChart(viewer: Viewer, chartId: number) {
  const [row] = await db()
    .select()
    .from(charts)
    .where(and(eq(charts.id, chartId), isNull(charts.deletedAt)));
  if (!row) throw new NotFound('谱面不存在。');
  if (row.uploaderId !== viewer.id && !viewer.isAdmin) throw new Forbidden('只有上传者可以修改这份谱面。');
  return row;
}

/** Replaces the package. Song and chart metadata come from the new manifest; the site description is kept. */
export async function replaceChart(viewer: Viewer, chartId: number, zipPath: string): Promise<void> {
  const current = await ownedChart(viewer, chartId);
  if (current.uploaderId === viewer.id) await checkDailyLimit(viewer.id);
  await withWorkDir(async (dir) => {
    const parsed = await parsePackage(zipPath, dir);
    const revision = current.revision + 1;
    const stored = await storeObjects(chartId, revision, parsed, dir);
    const m = parsed.manifest;
    const updated = await db()
      .update(charts)
      .set({
        title: m.title.slice(0, 200),
        scoreTitle: m.scoreTitle.slice(0, 200),
        composer: m.composer.slice(0, 200),
        lyricist: m.lyricist.slice(0, 200),
        arranger: m.arranger.slice(0, 200),
        singer: m.singer.slice(0, 200),
        collaborationLabel: m.collaborationLabel.slice(0, 200),
        difficulty: m.musicDifficultyType,
        playLevel: m.playLevel,
        previewStartSec: m.previewStartTimeSec,
        hasVideo: parsed.video !== null,
        revision,
        updatedAt: new Date(),
        ...stored,
      })
      .where(and(eq(charts.id, chartId), eq(charts.revision, current.revision), isNull(charts.deletedAt)))
      .returning({ id: charts.id });
    if (updated.length === 0) {
      await deleteObjects([stored.packageKey, stored.audioKey, stored.jacketKey]);
      throw new Conflict('谱面刚被修改过，请刷新后再试。');
    }
    await deleteObjects([current.packageKey, current.audioKey, current.jacketKey]);
  });
}

export interface ChartInfoUpdate {
  description: string;
  tags: string[];
  allowDerivative: boolean;
  parentChartId: number | null;
}

export function normalizeTags(input: string[]): string[] {
  const out: string[] = [];
  for (const raw of input) {
    const tag = raw.replace(/[\s,#]+/g, ' ').trim().slice(0, 20);
    if (tag && !out.includes(tag)) out.push(tag);
    if (out.length >= 8) break;
  }
  return out;
}

export async function updateChartInfo(viewer: Viewer, chartId: number, info: ChartInfoUpdate): Promise<void> {
  await ownedChart(viewer, chartId);
  let parent: number | null = null;
  if (info.parentChartId !== null) {
    if (info.parentChartId === chartId) throw new PackageError('親譜面不能是这份谱面自己。');
    const found = await getChart(info.parentChartId);
    if (!found) throw new PackageError(`找不到编号为 ${info.parentChartId} 的谱面。`);
    parent = found.id;
  }
  await db()
    .update(charts)
    .set({
      description: info.description.slice(0, 2000),
      tags: normalizeTags(info.tags),
      allowDerivative: info.allowDerivative,
      parentChartId: parent,
    })
    .where(eq(charts.id, chartId));
}

export async function deleteChart(viewer: Viewer, chartId: number): Promise<void> {
  const row = await ownedChart(viewer, chartId);
  const [done] = await db()
    .update(charts)
    .set({ deletedAt: new Date() })
    .where(and(eq(charts.id, chartId), isNull(charts.deletedAt)))
    .returning({ id: charts.id });
  if (done) await deleteObjects([row.packageKey, row.audioKey, row.jacketKey]);
}

/* ---------- interactions ---------- */

export async function setLike(viewer: Viewer, chartId: number, liked: boolean): Promise<number> {
  return db().transaction(async (tx) => {
    const [chart] = await tx
      .select({ id: charts.id })
      .from(charts)
      .where(and(eq(charts.id, chartId), isNull(charts.deletedAt)))
      .for('update');
    if (!chart) throw new NotFound('谱面不存在。');
    if (liked) {
      await tx.insert(chartLikes).values({ chartId, userId: viewer.id }).onConflictDoNothing();
    } else {
      await tx.delete(chartLikes).where(and(eq(chartLikes.chartId, chartId), eq(chartLikes.userId, viewer.id)));
    }
    const [{ n }] = await tx.select({ n: count() }).from(chartLikes).where(eq(chartLikes.chartId, chartId));
    await tx.update(charts).set({ likeCount: n }).where(eq(charts.id, chartId));
    return n;
  });
}

/** Counts a play reported by the game: one per actor per chart per hour. Returns the new total. */
export async function recordPlay(chartId: number, actor: string): Promise<number | null> {
  return db().transaction(async (tx) => {
    const [chart] = await tx
      .select({ id: charts.id, playCount: charts.playCount })
      .from(charts)
      .where(and(eq(charts.id, chartId), isNull(charts.deletedAt)))
      .for('update');
    if (!chart) return null;
    const since = new Date(Date.now() - 3600_000);
    const [recent] = await tx
      .select({ one: sql`1` })
      .from(chartPlays)
      .where(and(eq(chartPlays.chartId, chartId), eq(chartPlays.actor, actor), gte(chartPlays.createdAt, since)))
      .limit(1);
    if (recent) return chart.playCount;
    await tx.insert(chartPlays).values({ chartId, actor });
    const [updated] = await tx
      .update(charts)
      .set({ playCount: sql`${charts.playCount} + 1` })
      .where(eq(charts.id, chartId))
      .returning({ playCount: charts.playCount });
    return updated.playCount;
  });
}

export function anonymousActor(address: string): string {
  // Hashed with the day so addresses are not kept.
  const day = new Date().toISOString().slice(0, 10);
  return `addr:${sha256Hex(`${day}|${address}`).slice(0, 32)}`;
}

export async function setBookmark(viewer: Viewer, chartId: number, saved: boolean): Promise<void> {
  const chart = await getChart(chartId);
  if (!chart) throw new NotFound('谱面不存在。');
  if (saved) {
    await db().insert(bookmarks).values({ chartId, userId: viewer.id }).onConflictDoNothing();
  } else {
    await db().delete(bookmarks).where(and(eq(bookmarks.chartId, chartId), eq(bookmarks.userId, viewer.id)));
  }
}

export async function listTags(limit = 30): Promise<{ tag: string; count: number }[]> {
  const rows = await db().execute<{ tag: string; count: string }>(
    sql`select t as tag, count(*) as count from ${charts}, unnest(${charts.tags}) t where ${charts.deletedAt} is null group by t order by count(*) desc, t limit ${limit}`,
  );
  return rows.map((r) => ({ tag: r.tag, count: Number(r.count) }));
}

export async function recordDownload(chartId: number): Promise<string | null> {
  const [row] = await db()
    .update(charts)
    .set({ downloadCount: sql`${charts.downloadCount} + 1` })
    .where(and(eq(charts.id, chartId), isNull(charts.deletedAt)))
    .returning({ packageKey: charts.packageKey });
  return row ? storage().publicUrl(row.packageKey) : null;
}

export interface CommentView {
  id: number;
  body: string;
  createdAt: string;
  user: { id: string; nickname: string; avatarUrl: string | null };
}

export async function listComments(chartId: number): Promise<CommentView[]> {
  const rows = await db()
    .select({
      id: comments.id,
      body: comments.body,
      createdAt: comments.createdAt,
      userId: users.id,
      nickname: users.nickname,
      avatarUrl: users.avatarUrl,
    })
    .from(comments)
    .innerJoin(users, eq(users.id, comments.userId))
    .where(and(eq(comments.chartId, chartId), isNull(comments.deletedAt)))
    .orderBy(asc(comments.createdAt))
    .limit(500);
  return rows.map((r) => ({
    id: r.id,
    body: r.body,
    createdAt: r.createdAt.toISOString(),
    user: { id: r.userId, nickname: r.nickname, avatarUrl: r.avatarUrl },
  }));
}

async function syncCommentCount(chartId: number) {
  await db()
    .update(charts)
    .set({
      commentCount: sql`(select count(*) from ${comments} where ${comments.chartId} = ${chartId} and ${comments.deletedAt} is null)`,
    })
    .where(eq(charts.id, chartId));
}

export async function addComment(viewer: Viewer, chartId: number, body: string): Promise<void> {
  const text = body.trim();
  if (!text) throw new PackageError('评论不能为空。');
  if (text.length > 1000) throw new PackageError('评论最多 1000 字。');
  const chart = await getChart(chartId);
  if (!chart) throw new NotFound('谱面不存在。');
  const since = new Date(Date.now() - 60_000);
  const [{ n }] = await db()
    .select({ n: count() })
    .from(comments)
    .where(and(eq(comments.userId, viewer.id), gte(comments.createdAt, since)));
  if (n >= 5) throw new TooMany('评论太频繁，请稍后再试。');
  await db().insert(comments).values({ chartId, userId: viewer.id, body: text });
  await syncCommentCount(chartId);
}

export async function deleteComment(viewer: Viewer, commentId: number): Promise<number> {
  const [row] = await db()
    .select({ chartId: comments.chartId, userId: comments.userId, uploaderId: charts.uploaderId })
    .from(comments)
    .innerJoin(charts, eq(charts.id, comments.chartId))
    .where(and(eq(comments.id, commentId), isNull(comments.deletedAt)));
  if (!row) throw new NotFound('评论不存在。');
  if (row.userId !== viewer.id && row.uploaderId !== viewer.id && !viewer.isAdmin) {
    throw new Forbidden('不能删除别人的评论。');
  }
  await db().update(comments).set({ deletedAt: new Date() }).where(eq(comments.id, commentId));
  await syncCommentCount(row.chartId);
  return row.chartId;
}

export async function getUser(id: string) {
  const [row] = await db()
    .select({ id: users.id, nickname: users.nickname, avatarUrl: users.avatarUrl, createdAt: users.createdAt })
    .from(users)
    .where(eq(users.id, id));
  return row ?? null;
}

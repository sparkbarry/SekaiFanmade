import 'server-only';
import { and, count, desc, eq, gte, ilike, inArray, isNull, or, sql, type SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { randomBytes } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { sha256Hex } from '@/lib/crypto';
import { bookmarks, chartPlays, charts, chartVotes, db, DIFFICULTIES, files, users, type Difficulty } from '@/lib/db';
import { env } from '@/lib/env';
import { inFileTransaction, releaseFiles, storeFile, type StoredFile, type Tx } from '@/lib/file-store';
import { PackageError, parsePackage, type ParsedPackage } from '@/lib/package';
import { Forbidden, type Viewer } from '@/lib/session';
import { storage } from '@/lib/storage';

export const PAGE_SIZE = 24;
/**
 * hot: Reddit's hot ranking, as on OurTaiko Fanmade (popular and recommended are the same);
 * top: score (upvotes - downvotes); comments: comment count; daily: plays in the last 24 hours;
 * plays: all-time plays; hard: highest level first.
 */
export const SORTS = ['new', 'hot', 'top', 'comments', 'popular', 'recommended', 'downloads', 'updated', 'daily', 'plays', 'hard', 'random'] as const;
export type Sort = (typeof SORTS)[number];

export class NotFound extends Error {}
export class Conflict extends Error {}
export class TooMany extends Error {}

const CHART_ID = /^[0-9a-f]{32}$/;

export function newChartId(): string {
  return randomBytes(16).toString('hex');
}

/** A chart reference from a URL or form: the 32-hex id, or the number (optionally written #12). */
export function parseChartRef(raw: string | null | undefined): { id: string } | { numberId: number } | null {
  const value = (raw ?? '').trim().replace(/^#/, '').toLowerCase();
  if (CHART_ID.test(value)) return { id: value };
  if (/^[1-9]\d{0,15}$/.test(value)) {
    const n = Number(value);
    if (Number.isSafeInteger(n)) return { numberId: n };
  }
  return null;
}

function refCondition(ref: { id: string } | { numberId: number }): SQL {
  return 'id' in ref ? eq(charts.id, ref.id) : eq(charts.numberId, ref.numberId);
}

const scoreFile = alias(files, 'score_file');
const audioFile = alias(files, 'audio_file');
const jacketFile = alias(files, 'jacket_file');
const jacketSourceFile = alias(files, 'jacket_source_file');
const videoFile = alias(files, 'video_file');

const chartColumns = {
  id: charts.id,
  numberId: charts.numberId,
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
  packageSize: charts.packageSize,
  manifest: charts.manifest,
  scoreStorageKey: scoreFile.storageKey,
  scoreByteSize: scoreFile.byteSize,
  scoreSha256: scoreFile.sha256,
  audioStorageKey: audioFile.storageKey,
  audioByteSize: audioFile.byteSize,
  audioSha256: audioFile.sha256,
  jacketStorageKey: jacketFile.storageKey,
  jacketSourceStorageKey: jacketSourceFile.storageKey,
  jacketSourceByteSize: jacketSourceFile.byteSize,
  jacketSourceSha256: jacketSourceFile.sha256,
  videoStorageKey: videoFile.storageKey,
  videoByteSize: videoFile.byteSize,
  videoSha256: videoFile.sha256,
  downloadCount: charts.downloadCount,
  playCount: charts.playCount,
  upvotes: charts.upvotes,
  downvotes: charts.downvotes,
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
  /** 32 random hex digits. */
  id: string;
  /** Short public number (譜面ID検索, #12). */
  numberId: number;
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
  /**
   * The chart folder as parts (single-chart reads only): write manifest.json and each file under its
   * name, and the folder is the chart. Null for a chart still waiting to be split from its old ZIP.
   */
  package?: ChartPackage | null;
  downloadCount: number;
  playCount: number;
  /** upvotes - downvotes */
  score: number;
  upvotes: number;
  downvotes: number;
  commentCount: number;
  tags: string[];
  /** 二次利用OK */
  allowDerivative: boolean;
  /** 親譜面 (its id), if this chart is derived from another one. */
  parentChartId: string | null;
  /** Only present when the request is signed in: the viewer's vote (1, 0, -1) and マイリスト. */
  myVote?: -1 | 0 | 1;
  bookmarked?: boolean;
  createdAt: string;
  updatedAt: string;
  uploader: { id: string; nickname: string; avatarUrl: string | null };
}

export interface ChartPackageFile {
  role: 'score' | 'audio' | 'jacket' | 'video';
  /** The file's name in the chart folder, as manifest.json refers to it. */
  name: string;
  url: string;
  size: number;
  sha256: string;
}

export interface ChartPackage {
  manifest: Record<string, unknown>;
  files: ChartPackageFile[];
}

type ChartRow = Awaited<ReturnType<typeof selectCharts>>[number];

function packageOf(r: ChartRow): ChartPackage | null {
  const m = r.manifest;
  if (!m || !r.scoreStorageKey || !r.audioStorageKey) return null;
  const s = storage();
  const name = (key: string) => (typeof m[key] === 'string' ? (m[key] as string) : '');
  const out: ChartPackageFile[] = [
    { role: 'score', name: name('scoreFileName'), url: s.publicUrl(r.scoreStorageKey), size: r.scoreByteSize ?? 0, sha256: r.scoreSha256 ?? '' },
    { role: 'audio', name: name('audioFileName'), url: s.publicUrl(r.audioStorageKey), size: r.audioByteSize ?? 0, sha256: r.audioSha256 ?? '' },
  ];
  if (r.jacketSourceStorageKey && name('jacketFileName')) {
    out.push({ role: 'jacket', name: name('jacketFileName'), url: s.publicUrl(r.jacketSourceStorageKey), size: r.jacketSourceByteSize ?? 0, sha256: r.jacketSourceSha256 ?? '' });
  }
  if (r.videoStorageKey && name('videoFileName')) {
    out.push({ role: 'video', name: name('videoFileName'), url: s.publicUrl(r.videoStorageKey), size: r.videoByteSize ?? 0, sha256: r.videoSha256 ?? '' });
  }
  return { manifest: m, files: out };
}

function toSummary(r: ChartRow, withPackage = false): ChartSummary {
  const s = storage();
  // Live charts always have audio (charts_files_check).
  const audioKey = r.audioStorageKey ?? '';
  const jacketKey = r.jacketStorageKey;
  return {
    id: r.id,
    numberId: r.numberId,
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
    jacketUrl: jacketKey ? s.publicUrl(jacketKey) : null,
    audioUrl: s.publicUrl(audioKey),
    ...(withPackage ? { package: packageOf(r) } : {}),
    downloadCount: r.downloadCount,
    playCount: r.playCount,
    score: r.upvotes - r.downvotes,
    upvotes: r.upvotes,
    downvotes: r.downvotes,
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
  return db()
    .select(chartColumns)
    .from(charts)
    .innerJoin(users, eq(users.id, charts.uploaderId))
    .leftJoin(scoreFile, eq(scoreFile.id, charts.scoreFileId))
    .leftJoin(audioFile, eq(audioFile.id, charts.audioFileId))
    .leftJoin(jacketFile, eq(jacketFile.id, charts.jacketFileId))
    .leftJoin(jacketSourceFile, eq(jacketSourceFile.id, charts.jacketSourceFileId))
    .leftJoin(videoFile, eq(videoFile.id, charts.videoFileId));
}

export interface ListQuery {
  q?: string;
  difficulty?: Difficulty;
  sort?: Sort;
  page?: number;
  uploaderId?: string;
  /** Charts this user upvoted. */
  upvotedBy?: string;
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
    const ref = /^#?[0-9a-f]+$/i.test(q) ? parseChartRef(q) : null;
    where.push(
      or(
        ilike(charts.title, like),
        ilike(charts.scoreTitle, like),
        ilike(charts.composer, like),
        ilike(charts.singer, like),
        ilike(charts.arranger, like),
        ilike(charts.lyricist, like),
        ilike(users.nickname, like),
        ...(ref ? [refCondition(ref)] : []),
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
  if (query.upvotedBy) {
    where.push(
      sql`exists (select 1 from ${chartVotes} where ${chartVotes.chartId} = ${charts.id} and ${chartVotes.userId} = ${query.upvotedBy} and ${chartVotes.value} = 1)`,
    );
  }
  const dailyPlays = sql`(select count(*) from ${chartPlays} where ${chartPlays.chartId} = ${charts.id} and ${chartPlays.createdAt} > now() - interval '1 day')`;
  // Reddit's hot: sign(s)·log10(max(|s|, 1)) + seconds / 45000, so ten times the score counts as 12.5 hours newer.
  const score = sql`(${charts.upvotes} - ${charts.downvotes})`;
  const hot = sql`(sign(${score}) * log(greatest(abs(${score}), 1)) + extract(epoch from ${charts.createdAt}) / 45000)`;
  const seed = (query.seed ?? '').replace(/[^0-9a-z]/gi, '').slice(0, 16) || 'seed';
  const order = {
    new: [desc(charts.createdAt), desc(charts.numberId)],
    updated: [desc(charts.updatedAt), desc(charts.numberId)],
    hot: [desc(hot), desc(charts.createdAt), desc(charts.numberId)],
    popular: [desc(hot), desc(charts.createdAt), desc(charts.numberId)],
    recommended: [desc(hot), desc(charts.createdAt), desc(charts.numberId)],
    top: [desc(score), desc(charts.createdAt), desc(charts.numberId)],
    comments: [desc(charts.commentCount), desc(charts.createdAt), desc(charts.numberId)],
    downloads: [desc(charts.downloadCount), desc(score), desc(charts.numberId)],
    daily: [desc(dailyPlays), desc(charts.playCount), desc(score), desc(charts.numberId)],
    plays: [desc(charts.playCount), desc(score), desc(charts.numberId)],
    hard: [desc(charts.playLevel), desc(score), desc(charts.numberId)],
    random: [sql`md5(${charts.id} || ${seed})`],
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
  const items = rows.map((r) => toSummary(r));
  if (query.viewerId) await addViewerFlags(items, query.viewerId);
  return { items, total, page, pages: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
}

async function addViewerFlags(items: ChartSummary[], viewerId: string) {
  if (items.length === 0) return;
  const ids = items.map((c) => c.id);
  const [votes, saved] = await Promise.all([
    db()
      .select({ id: chartVotes.chartId, value: chartVotes.value })
      .from(chartVotes)
      .where(and(eq(chartVotes.userId, viewerId), inArray(chartVotes.chartId, ids))),
    db()
      .select({ id: bookmarks.chartId })
      .from(bookmarks)
      .where(and(eq(bookmarks.userId, viewerId), inArray(bookmarks.chartId, ids))),
  ]);
  const voteOf = new Map(votes.map((r) => [r.id, r.value as -1 | 1]));
  const savedSet = new Set(saved.map((r) => r.id));
  for (const c of items) {
    c.myVote = voteOf.get(c.id) ?? 0;
    c.bookmarked = savedSet.has(c.id);
  }
}

/** By 32-hex id or by number. */
export async function getChart(ref: string, viewerId?: string): Promise<ChartSummary | null> {
  const parsed = parseChartRef(ref);
  if (!parsed) return null;
  const [row] = await selectCharts().where(and(refCondition(parsed), isNull(charts.deletedAt)));
  if (!row) return null;
  const chart = toSummary(row, true);
  if (viewerId) await addViewerFlags([chart], viewerId);
  return chart;
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

const SCORE_TYPES: Record<string, string> = { json: 'application/json', sus: 'text/plain; charset=utf-8' };

/**
 * The package's parts, ready to store: the score, the audio, the cover as uploaded plus a 512px JPEG of it
 * (lists and the game's browser), and the MV. No ZIP: the game and the website assemble the folder.
 */
export async function prepareFiles(parsed: ParsedPackage, workDir: string) {
  let thumb: string | null = null;
  if (parsed.jacket) {
    // JPEG rather than WebP: the game decodes jackets with Texture2D.LoadImage (PNG / JPEG only).
    thumb = path.join(workDir, 'jacket-512.jpg');
    try {
      await sharp(parsed.jacket.path, { limitInputPixels: 64_000_000 })
        .rotate()
        .resize(512, 512, { fit: 'cover' })
        .flatten({ background: '#ffffff' })
        .jpeg({ quality: 88, mozjpeg: true })
        .toFile(thumb);
    } catch {
      throw new PackageError(`${parsed.jacket.name} 无法解码。`);
    }
  }
  const scoreExtension = path.extname(parsed.score.name).slice(1).toLowerCase();
  const manifestBytes = Buffer.byteLength(JSON.stringify(parsed.manifest, null, 2));
  return {
    manifest: parsed.manifest as Record<string, unknown>,
    packageSize: manifestBytes + parsed.score.size + parsed.audio.size + (parsed.jacket?.size ?? 0) + (parsed.video?.size ?? 0),
    score: { path: parsed.score.path, extension: scoreExtension, contentType: SCORE_TYPES[scoreExtension] ?? 'application/octet-stream' },
    audio: { path: parsed.audio.path, extension: parsed.audio.extension, contentType: parsed.audio.contentType },
    jacket: thumb ? { path: thumb, extension: 'jpg', contentType: 'image/jpeg' } : null,
    jacketSource: parsed.jacket
      ? { path: parsed.jacket.path, extension: parsed.jacket.contentType === 'image/png' ? 'png' : 'jpg', contentType: parsed.jacket.contentType }
      : null,
    video: parsed.video ? { path: parsed.video.path, extension: 'mp4', contentType: 'video/mp4' } : null,
  };
}

/** Stores the parts (each by hash) and returns the chart columns that point at them. */
export async function storeParts(tx: Tx, prepared: Awaited<ReturnType<typeof prepareFiles>>, uploaded: string[]) {
  const score = await storeFile(tx, prepared.score, uploaded);
  const audio = await storeFile(tx, prepared.audio, uploaded);
  const jacket: StoredFile | null = prepared.jacket ? await storeFile(tx, prepared.jacket, uploaded) : null;
  const jacketSource: StoredFile | null = prepared.jacketSource ? await storeFile(tx, prepared.jacketSource, uploaded) : null;
  const video: StoredFile | null = prepared.video ? await storeFile(tx, prepared.video, uploaded) : null;
  return {
    manifest: prepared.manifest,
    packageSize: prepared.packageSize,
    scoreFileId: score.id,
    audioFileId: audio.id,
    jacketFileId: jacket?.id ?? null,
    jacketSourceFileId: jacketSource?.id ?? null,
    videoFileId: video?.id ?? null,
  };
}

/** Every file a chart row refers to, for releaseFiles. */
export function chartFileIds(row: {
  scoreFileId: number | null;
  audioFileId: number | null;
  jacketFileId: number | null;
  jacketSourceFileId: number | null;
  videoFileId: number | null;
}) {
  return [row.scoreFileId, row.audioFileId, row.jacketFileId, row.jacketSourceFileId, row.videoFileId];
}

function metadataFrom(parsed: ParsedPackage) {
  const m = parsed.manifest;
  return {
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
  };
}

async function checkDailyLimit(userId: string) {
  const since = new Date(Date.now() - 86400_000);
  const [{ n }] = await db()
    .select({ n: count() })
    .from(charts)
    .where(and(eq(charts.uploaderId, userId), gte(charts.updatedAt, since)));
  if (n >= env().UPLOADS_PER_DAY) throw new TooMany(`24 小时内最多上传或更新 ${env().UPLOADS_PER_DAY} 次。`);
}

/** Returns the new chart's id. */
export async function createChart(viewer: Viewer, zipPath: string): Promise<string> {
  await checkDailyLimit(viewer.id);
  return withWorkDir(async (dir) => {
    const parsed = await parsePackage(zipPath, dir);
    const prepared = await prepareFiles(parsed, dir);
    const id = newChartId();
    const uploaded: string[] = [];
    await inFileTransaction(uploaded, async (tx) => {
      const parts = await storeParts(tx, prepared, uploaded);
      await tx.insert(charts).values({
        id,
        uploaderId: viewer.id,
        ...metadataFrom(parsed),
        description: parsed.manifest.description.slice(0, 2000),
        revision: 1,
        ...parts,
      });
    });
    return id;
  });
}

async function ownedChart(viewer: Viewer, chartId: string) {
  const ref = parseChartRef(chartId);
  if (!ref) throw new NotFound('谱面不存在。');
  const [row] = await db()
    .select()
    .from(charts)
    .where(and(refCondition(ref), isNull(charts.deletedAt)));
  if (!row) throw new NotFound('谱面不存在。');
  if (row.uploaderId !== viewer.id && !viewer.isAdmin) throw new Forbidden('只有上传者可以修改这份谱面。');
  return row;
}

/** Replaces the package. Song and chart metadata come from the new manifest; the site description is kept. */
export async function replaceChart(viewer: Viewer, chartId: string, zipPath: string): Promise<void> {
  const current = await ownedChart(viewer, chartId);
  if (current.uploaderId === viewer.id) await checkDailyLimit(viewer.id);
  await withWorkDir(async (dir) => {
    const parsed = await parsePackage(zipPath, dir);
    const prepared = await prepareFiles(parsed, dir);
    const uploaded: string[] = [];
    await inFileTransaction(uploaded, async (tx) => {
      const parts = await storeParts(tx, prepared, uploaded);
      const updated = await tx
        .update(charts)
        .set({
          ...metadataFrom(parsed),
          revision: current.revision + 1,
          updatedAt: new Date(),
          ...parts,
        })
        .where(and(eq(charts.id, current.id), eq(charts.revision, current.revision), isNull(charts.deletedAt)))
        .returning({ id: charts.id });
      if (updated.length === 0) throw new Conflict('谱面刚被修改过，请刷新后再试。');
    });
  });
  // After the commit: the old files are released unless another chart (or the new revision) still uses them.
  await releaseFiles(chartFileIds(current));
}

export interface ChartInfoUpdate {
  description: string;
  tags: string[];
  allowDerivative: boolean;
  /** The parent's id or number, or null. */
  parentChart: string | null;
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

export async function updateChartInfo(viewer: Viewer, chartId: string, info: ChartInfoUpdate): Promise<void> {
  const row = await ownedChart(viewer, chartId);
  let parent: string | null = null;
  if (info.parentChart) {
    const found = await getChart(info.parentChart);
    if (!found) throw new PackageError(`找不到谱面 ${info.parentChart}。`);
    if (found.id === row.id) throw new PackageError('親譜面不能是这份谱面自己。');
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
    .where(eq(charts.id, row.id));
}

export async function deleteChart(viewer: Viewer, chartId: string): Promise<void> {
  const row = await ownedChart(viewer, chartId);
  const [done] = await db()
    .update(charts)
    .set({
      deletedAt: new Date(),
      manifest: null,
      scoreFileId: null,
      audioFileId: null,
      jacketFileId: null,
      jacketSourceFileId: null,
      videoFileId: null,
    })
    .where(and(eq(charts.id, row.id), isNull(charts.deletedAt)))
    .returning({ id: charts.id });
  if (!done) return;
  await releaseFiles(chartFileIds(row));
}

/* ---------- interactions ---------- */

async function liveChartId(ref: string): Promise<string | null> {
  const parsed = parseChartRef(ref);
  if (!parsed) return null;
  const [row] = await db()
    .select({ id: charts.id })
    .from(charts)
    .where(and(refCondition(parsed), isNull(charts.deletedAt)));
  return row?.id ?? null;
}

/** Counts a play reported by the game: one per actor per chart per hour. Returns the new total. */
export async function recordPlay(ref: string, actor: string): Promise<number | null> {
  const chartId = await liveChartId(ref);
  if (!chartId) return null;
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

export async function setBookmark(viewer: Viewer, ref: string, saved: boolean): Promise<void> {
  const chartId = await liveChartId(ref);
  if (!chartId) throw new NotFound('谱面不存在。');
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

/** Counts a download (the website's ZIP or the game's). False when the chart does not exist. */
export async function recordDownload(ref: string): Promise<boolean> {
  const chartId = await liveChartId(ref);
  if (!chartId) return false;
  await db()
    .update(charts)
    .set({ downloadCount: sql`${charts.downloadCount} + 1` })
    .where(eq(charts.id, chartId));
  return true;
}

export async function getUser(id: string) {
  const [row] = await db()
    .select({ id: users.id, nickname: users.nickname, avatarUrl: users.avatarUrl, createdAt: users.createdAt })
    .from(users)
    .where(eq(users.id, id));
  return row ?? null;
}

/* ---------- co-op live (src/lib/multiplay) ---------- */

/** What a co-op room needs to know about a chart. Charts with the same audio are one song. */
export interface PlayableChart {
  id: string;
  numberId: number;
  title: string;
  difficulty: Difficulty;
  playLevel: number;
  jacketUrl: string | null;
  audioSha256: string;
  composer: string;
  uploader: string;
}

function toPlayable(r: ChartRow): PlayableChart | null {
  if (!r.audioSha256 || !r.manifest) return null;
  return {
    id: r.id,
    numberId: r.numberId,
    title: r.title,
    difficulty: r.difficulty,
    playLevel: r.playLevel,
    jacketUrl: r.jacketStorageKey ? storage().publicUrl(r.jacketStorageKey) : null,
    audioSha256: r.audioSha256,
    composer: r.composer,
    uploader: r.uploaderName,
  };
}

/** A live chart by id or number. */
export async function getPlayableChart(ref: string): Promise<PlayableChart | null> {
  const parsed = parseChartRef(ref);
  if (!parsed) return null;
  const [row] = await selectCharts().where(and(refCondition(parsed), isNull(charts.deletedAt)));
  return row ? toPlayable(row) : null;
}

/** おまかせ: any live chart. */
export async function randomPlayableChart(): Promise<PlayableChart | null> {
  const [row] = await selectCharts()
    .where(and(isNull(charts.deletedAt), sql`${charts.audioFileId} is not null`))
    .orderBy(sql`random()`)
    .limit(1);
  return row ? toPlayable(row) : null;
}

/** The charts of one song (the same audio bytes), easiest first. */
export async function playableChartsOfSong(audioSha256: string, limit = 24): Promise<PlayableChart[]> {
  if (!/^[0-9a-f]{64}$/.test(audioSha256)) return [];
  const rows = await selectCharts()
    .where(and(isNull(charts.deletedAt), eq(audioFile.sha256, audioSha256)))
    .orderBy(
      sql`array_position(array['easy','normal','hard','expert','master','append']::text[], ${charts.difficulty})`,
      charts.playLevel,
      desc(sql`${charts.upvotes} - ${charts.downvotes}`),
      charts.createdAt,
    )
    .limit(limit);
  return rows.map(toPlayable).filter((c): c is PlayableChart => c !== null);
}

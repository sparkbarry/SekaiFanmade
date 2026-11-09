import { createWriteStream } from 'node:fs';
import { mkdir, open, readFile } from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import yauzl from 'yauzl';
import { DIFFICULTIES, type Difficulty } from '@/lib/db/schema';

/**
 * Reads a chart package exported by OpenSekai's custom chart manager (导出ZIP):
 * a folder with manifest.json, score.json (or SUS), the audio, the jacket and an
 * optional mp4. The game finds the folder by looking for manifest.json, first at
 * the ZIP root and then in subfolders, so this does the same. The parts are kept apart (never
 * re-zipped): the game and the website put the folder together again from them.
 */

export class PackageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PackageError';
  }
}

export interface PackageLimits {
  maxEntries: number;
  maxTotalBytes: number;
  maxManifestBytes: number;
  maxScoreBytes: number;
  maxAudioBytes: number;
  maxJacketBytes: number;
  maxVideoBytes: number;
}

export const DEFAULT_LIMITS: PackageLimits = {
  maxEntries: 200,
  maxTotalBytes: 400 * 1024 * 1024,
  maxManifestBytes: 256 * 1024,
  maxScoreBytes: 32 * 1024 * 1024,
  maxAudioBytes: 60 * 1024 * 1024,
  maxJacketBytes: 16 * 1024 * 1024,
  maxVideoBytes: 300 * 1024 * 1024,
};

export interface ChartManifest {
  formatVersion: number;
  id: string;
  title: string;
  scoreTitle: string;
  composer: string;
  lyricist: string;
  arranger: string;
  singer: string;
  collaborationLabel: string;
  /** 谱师署名. */
  noteDesigner: string;
  description: string;
  audioFileName: string;
  jacketFileName: string;
  scoreFileName: string;
  videoFileName: string;
  fillerSec: number;
  previewStartTimeSec: number;
  musicDifficultyType: Difficulty;
  playLevel: number;
  [key: string]: unknown;
}

export interface ExtractedFile {
  name: string;
  path: string;
  size: number;
}

export interface ParsedPackage {
  manifest: ChartManifest;
  score: ExtractedFile;
  audio: ExtractedFile & { extension: 'ogg' | 'mp3' | 'wav'; contentType: string };
  jacket: (ExtractedFile & { contentType: string }) | null;
  video: ExtractedFile | null;
}

const AUDIO_EXTENSIONS = ['.ogg', '.mp3', '.wav'];
const JACKET_EXTENSIONS = ['.png', '.jpg', '.jpeg'];
const SCORE_EXTENSIONS = ['.json', '.txt', '.sus'];

function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}

function num(v: unknown, fallback = 0): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

/** Same defaults as CustomMusicScoreManifest.Normalize() in the game. */
export function normalizeManifest(raw: unknown): ChartManifest {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new PackageError('manifest.json 不是 JSON 对象。');
  }
  const m = raw as Record<string, unknown>;
  const title = str(m.title).trim() || 'Untitled';
  const difficulty = str(m.musicDifficultyType).trim().toLowerCase() || 'master';
  if (!(DIFFICULTIES as readonly string[]).includes(difficulty)) {
    throw new PackageError(`不认识的难度「${difficulty}」。`);
  }
  const playLevel = Math.trunc(num(m.playLevel));
  if (playLevel < 0 || playLevel > 99) {
    throw new PackageError('难度等级要在 0 到 99 之间。');
  }
  return {
    ...m,
    formatVersion: Math.max(1, Math.trunc(num(m.formatVersion, 1))),
    id: str(m.id),
    title,
    scoreTitle: str(m.scoreTitle).trim() || title,
    composer: str(m.composer).trim(),
    lyricist: str(m.lyricist).trim(),
    arranger: str(m.arranger).trim(),
    singer: str(m.singer).trim(),
    collaborationLabel: str(m.collaborationLabel).trim(),
    noteDesigner: str(m.noteDesigner).trim(),
    description: str(m.description),
    audioFileName: str(m.audioFileName, 'audio.ogg') || 'audio.ogg',
    jacketFileName: str(m.jacketFileName, 'jacket.png'),
    scoreFileName: str(m.scoreFileName, 'score.json'),
    videoFileName: str(m.videoFileName),
    fillerSec: Math.max(0, num(m.fillerSec)),
    previewStartTimeSec: Math.max(0, num(m.previewStartTimeSec)),
    musicDifficultyType: difficulty as Difficulty,
    playLevel,
  };
}

interface ZipEntryInfo {
  name: string;
  size: number;
  entry: yauzl.Entry;
}

function openZip(file: string): Promise<yauzl.ZipFile> {
  return new Promise((resolve, reject) => {
    yauzl.open(file, { lazyEntries: true, autoClose: false, strictFileNames: false }, (err, zip) => {
      if (err || !zip) reject(new PackageError('无法读取 ZIP：文件不是 ZIP 或已损坏。'));
      else resolve(zip);
    });
  });
}

function listEntries(zip: yauzl.ZipFile, limits: PackageLimits): Promise<ZipEntryInfo[]> {
  return new Promise((resolve, reject) => {
    const entries: ZipEntryInfo[] = [];
    let total = 0;
    zip.on('entry', (entry: yauzl.Entry) => {
      const name = entry.fileName.replace(/\\/g, '/');
      if (!name.endsWith('/')) {
        if (entries.length >= limits.maxEntries) {
          reject(new PackageError(`ZIP 里的文件太多（上限 ${limits.maxEntries} 个）。`));
          zip.close();
          return;
        }
        total += entry.uncompressedSize;
        if (total > limits.maxTotalBytes) {
          reject(new PackageError('ZIP 解压后太大。'));
          zip.close();
          return;
        }
        entries.push({ name, size: entry.uncompressedSize, entry });
      }
      zip.readEntry();
    });
    zip.on('end', () => resolve(entries));
    zip.on('error', (err: Error) => reject(new PackageError(`ZIP 已损坏：${err.message}`)));
    zip.readEntry();
  });
}

function isJunk(name: string): boolean {
  return name.startsWith('__MACOSX/') || name.includes('/__MACOSX/') || path.posix.basename(name) === '.DS_Store';
}

function safeFileName(name: string): boolean {
  return name.length > 0 && name.length <= 200 && !/[\\/]/.test(name) && name !== '.' && name !== '..';
}

async function extract(zip: yauzl.ZipFile, info: ZipEntryInfo, dest: string, maxBytes: number): Promise<void> {
  if (info.size > maxBytes) {
    throw new PackageError(`${path.posix.basename(info.name)} 太大（上限 ${Math.round(maxBytes / 1024 / 1024)} MB）。`);
  }
  const stream = await new Promise<NodeJS.ReadableStream>((resolve, reject) => {
    zip.openReadStream(info.entry, (err, s) => (err || !s ? reject(new PackageError(`无法解压 ${info.name}`)) : resolve(s)));
  });
  // yauzl checks the declared size while streaming, so a lying header errors out here.
  await pipeline(stream, createWriteStream(dest, { flags: 'wx' }));
}

async function readHead(file: string, length = 16): Promise<Buffer> {
  const handle = await open(file, 'r');
  try {
    const buf = Buffer.alloc(length);
    const { bytesRead } = await handle.read(buf, 0, length, 0);
    return buf.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}

export function sniffAudio(head: Buffer): { extension: 'ogg' | 'mp3' | 'wav'; contentType: string } | null {
  if (head.subarray(0, 4).toString('latin1') === 'OggS') return { extension: 'ogg', contentType: 'audio/ogg' };
  if (head.subarray(0, 4).toString('latin1') === 'RIFF' && head.subarray(8, 12).toString('latin1') === 'WAVE')
    return { extension: 'wav', contentType: 'audio/wav' };
  if (head.subarray(0, 3).toString('latin1') === 'ID3' || (head[0] === 0xff && (head[1] & 0xe0) === 0xe0))
    return { extension: 'mp3', contentType: 'audio/mpeg' };
  return null;
}

export function sniffImage(head: Buffer): string | null {
  if (head.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return 'image/jpeg';
  return null;
}

function sniffMp4(head: Buffer): boolean {
  return head.subarray(4, 8).toString('latin1') === 'ftyp';
}

/**
 * Validates the ZIP at `zipPath` and writes the files it keeps, plus a normalized
 * package.zip, into `workDir` (which must exist and be empty).
 */
export async function parsePackage(
  zipPath: string,
  workDir: string,
  limits: PackageLimits = DEFAULT_LIMITS,
): Promise<ParsedPackage> {
  const zip = await openZip(zipPath);
  try {
    const entries = (await listEntries(zip, limits)).filter((e) => !isJunk(e.name));

    const manifests = entries
      .filter((e) => path.posix.basename(e.name) === 'manifest.json')
      .sort((a, b) => a.name.split('/').length - b.name.split('/').length || a.name.localeCompare(b.name));
    if (manifests.length === 0) {
      throw new PackageError('ZIP 里没有 manifest.json。请上传 OpenSekai 自制谱管理里「导出ZIP」得到的文件。');
    }
    const manifestEntry = manifests[0];
    const root = path.posix.dirname(manifestEntry.name);
    const inRoot = new Map<string, ZipEntryInfo>();
    for (const e of entries) {
      if (path.posix.dirname(e.name) === root) inRoot.set(path.posix.basename(e.name).toLowerCase(), e);
    }
    const find = (name: string) => (safeFileName(name) ? inRoot.get(name.toLowerCase()) : undefined);

    const filesDir = path.join(workDir, 'files');
    await mkdir(filesDir);

    // manifest
    const manifestPath = path.join(workDir, 'manifest.original.json');
    await extract(zip, manifestEntry, manifestPath, limits.maxManifestBytes);
    let rawManifest: unknown;
    try {
      rawManifest = JSON.parse((await readFile(manifestPath, 'utf8')).replace(/^﻿/, ''));
    } catch {
      throw new PackageError('manifest.json 不是有效的 JSON。');
    }
    const manifest = normalizeManifest(rawManifest);

    // score: the manifest's file, then score.json / score.sus like the game.
    let scoreEntry = find(manifest.scoreFileName);
    if (!scoreEntry) scoreEntry = find('score.json') ?? find('score.sus');
    if (!scoreEntry || !SCORE_EXTENSIONS.includes(path.posix.extname(scoreEntry.name).toLowerCase())) {
      throw new PackageError('找不到谱面文件（score.json 或 SUS）。');
    }
    const scoreName = path.posix.basename(scoreEntry.name);
    const scorePath = path.join(filesDir, scoreName);
    await extract(zip, scoreEntry, scorePath, limits.maxScoreBytes);
    const scoreText = (await readFile(scorePath, 'utf8')).replace(/^﻿/, '');
    if (scoreName.toLowerCase().endsWith('.json')) {
      try {
        const parsed = JSON.parse(scoreText);
        if (!parsed || typeof parsed !== 'object') throw new Error();
      } catch {
        throw new PackageError(`${scoreName} 不是有效的 JSON。`);
      }
    } else if (!/^#/m.test(scoreText)) {
      throw new PackageError(`${scoreName} 不像 SUS 谱面。`);
    }
    manifest.scoreFileName = scoreName;

    // audio
    const audioEntry =
      find(manifest.audioFileName) ??
      AUDIO_EXTENSIONS.map((ext) => find(`audio${ext}`)).find((e) => e !== undefined);
    if (!audioEntry || !AUDIO_EXTENSIONS.includes(path.posix.extname(audioEntry.name).toLowerCase())) {
      throw new PackageError('找不到音频文件（ogg、mp3 或 wav）。');
    }
    const audioName = path.posix.basename(audioEntry.name);
    const audioPath = path.join(filesDir, audioName);
    await extract(zip, audioEntry, audioPath, limits.maxAudioBytes);
    const audioType = sniffAudio(await readHead(audioPath));
    if (!audioType) throw new PackageError(`${audioName} 不是可识别的 ogg、mp3 或 wav 音频。`);
    manifest.audioFileName = audioName;

    // jacket (optional)
    let jacket: ParsedPackage['jacket'] = null;
    const jacketEntry =
      (manifest.jacketFileName ? find(manifest.jacketFileName) : undefined) ??
      JACKET_EXTENSIONS.map((ext) => find(`jacket${ext}`)).find((e) => e !== undefined);
    if (jacketEntry && JACKET_EXTENSIONS.includes(path.posix.extname(jacketEntry.name).toLowerCase())) {
      const name = path.posix.basename(jacketEntry.name);
      const p = path.join(filesDir, name);
      await extract(zip, jacketEntry, p, limits.maxJacketBytes);
      const type = sniffImage(await readHead(p));
      if (!type) throw new PackageError(`${name} 不是 PNG 或 JPEG 图片。`);
      jacket = { name, path: p, size: jacketEntry.size, contentType: type };
      manifest.jacketFileName = name;
    } else {
      manifest.jacketFileName = '';
    }

    // video (optional)
    let video: ParsedPackage['video'] = null;
    const videoEntry = manifest.videoFileName ? find(manifest.videoFileName) : undefined;
    if (videoEntry && path.posix.extname(videoEntry.name).toLowerCase() === '.mp4') {
      const name = path.posix.basename(videoEntry.name);
      const p = path.join(filesDir, name);
      await extract(zip, videoEntry, p, limits.maxVideoBytes);
      if (!sniffMp4(await readHead(p, 12))) throw new PackageError(`${name} 不是 MP4 视频。`);
      video = { name, path: p, size: videoEntry.size };
      manifest.videoFileName = name;
    } else {
      manifest.videoFileName = '';
    }

    return {
      manifest,
      score: { name: scoreName, path: scorePath, size: scoreEntry.size },
      audio: { name: audioName, path: audioPath, size: audioEntry.size, ...audioType },
      jacket,
      video,
    };
  } finally {
    zip.close();
  }
}

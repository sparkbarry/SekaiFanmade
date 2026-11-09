import { createWriteStream } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import yazl from 'yazl';
import { normalizeManifest, PackageError, parsePackage } from './package';

const OGG = Buffer.concat([Buffer.from('OggS'), Buffer.alloc(60, 1)]);
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(60, 2)]);
const MANIFEST = {
  formatVersion: 1,
  id: 'abc123',
  title: '夢の降る日に',
  scoreTitle: '自制 MASTER',
  composer: 'someone',
  audioFileName: 'audio.ogg',
  jacketFileName: 'jacket.png',
  scoreFileName: 'score.json',
  videoFileName: '',
  previewStartTimeSec: 42.5,
  musicDifficultyType: 'expert',
  playLevel: 28,
};

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), 'pkg-test-'));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

async function makeZip(files: Record<string, Buffer | string>): Promise<string> {
  const zip = new yazl.ZipFile();
  for (const [name, content] of Object.entries(files)) {
    zip.addBuffer(Buffer.isBuffer(content) ? content : Buffer.from(content), name);
  }
  zip.end();
  const file = path.join(dir, `in-${Math.random().toString(36).slice(2)}.zip`);
  await pipeline(zip.outputStream, createWriteStream(file));
  return file;
}

async function work() {
  return mkdtemp(path.join(dir, 'work-'));
}

describe('parsePackage', () => {
  it('reads a package nested in a folder and keeps only the chart files', async () => {
    const zip = await makeZip({
      '夢の降る日に_l9x2/manifest.json': JSON.stringify(MANIFEST),
      '夢の降る日に_l9x2/score.json': '{"notes":[]}',
      '夢の降る日に_l9x2/audio.ogg': OGG,
      '夢の降る日に_l9x2/jacket.png': PNG,
      '夢の降る日に_l9x2/notes.txt': 'junk',
      '__MACOSX/夢の降る日に_l9x2/._audio.ogg': 'junk',
    });
    const parsed = await parsePackage(zip, await work());
    expect(parsed.manifest.musicDifficultyType).toBe('expert');
    expect(parsed.manifest.playLevel).toBe(28);
    expect(parsed.manifest.previewStartTimeSec).toBe(42.5);
    expect(parsed.audio.extension).toBe('ogg');
    expect(parsed.jacket?.contentType).toBe('image/png');
    expect([parsed.score.name, parsed.audio.name, parsed.jacket?.name, parsed.video]).toEqual(['score.json', 'audio.ogg', 'jacket.png', null]);
    expect(await readFile(parsed.score.path, 'utf8')).toBe('{"notes":[]}');
  });

  it('falls back to score.sus and audio.* like the game, and drops a missing jacket', async () => {
    const zip = await makeZip({
      'manifest.json': JSON.stringify({ ...MANIFEST, scoreFileName: 'missing.json', audioFileName: 'gone.ogg' }),
      'score.sus': '#00002: 4\n#BPM01: 120\n',
      'audio.ogg': OGG,
    });
    const parsed = await parsePackage(zip, await work());
    expect(parsed.score.name).toBe('score.sus');
    expect(parsed.manifest.scoreFileName).toBe('score.sus');
    expect(parsed.manifest.audioFileName).toBe('audio.ogg');
    expect(parsed.jacket).toBeNull();
    expect(parsed.manifest.jacketFileName).toBe('');
    const written = JSON.parse(await readFile(path.join(path.dirname(path.dirname(parsed.score.path)), 'manifest.original.json'), 'utf8'));
    expect(written.scoreFileName).toBe('missing.json');
  });

  it('rejects a ZIP without manifest.json', async () => {
    const zip = await makeZip({ 'score.json': '{}', 'audio.ogg': OGG });
    await expect(parsePackage(zip, await work())).rejects.toThrow(PackageError);
  });

  it('rejects audio that is not audio', async () => {
    const zip = await makeZip({ 'manifest.json': JSON.stringify(MANIFEST), 'score.json': '{}', 'audio.ogg': 'not audio' });
    await expect(parsePackage(zip, await work())).rejects.toThrow(/不是可识别/);
  });

  it('rejects broken score JSON', async () => {
    const zip = await makeZip({ 'manifest.json': JSON.stringify(MANIFEST), 'score.json': '{oops', 'audio.ogg': OGG });
    await expect(parsePackage(zip, await work())).rejects.toThrow(/score.json/);
  });

  it('does not follow file names that leave the folder', async () => {
    const zip = await makeZip({
      'pkg/manifest.json': JSON.stringify({ ...MANIFEST, audioFileName: '../audio.ogg' }),
      'pkg/score.json': '{}',
      'audio.ogg': OGG,
    });
    await expect(parsePackage(zip, await work())).rejects.toThrow(/音频/);
  });

  it('enforces the entry count limit', async () => {
    const files: Record<string, string> = { 'manifest.json': JSON.stringify(MANIFEST) };
    for (let i = 0; i < 10; i++) files[`f${i}.txt`] = 'x';
    const zip = await makeZip(files);
    await expect(
      parsePackage(zip, await work(), {
        maxEntries: 5,
        maxTotalBytes: 1e9,
        maxManifestBytes: 1e6,
        maxScoreBytes: 1e6,
        maxAudioBytes: 1e6,
        maxJacketBytes: 1e6,
        maxVideoBytes: 1e6,
      }),
    ).rejects.toThrow(/太多/);
  });

  it('rejects a file that is not a ZIP', async () => {
    const file = path.join(dir, 'x.zip');
    await import('node:fs/promises').then((fs) => fs.writeFile(file, 'hello'));
    await expect(parsePackage(file, await work())).rejects.toThrow(PackageError);
  });
});

describe('normalizeManifest', () => {
  it('applies the game defaults', () => {
    const m = normalizeManifest({});
    expect(m.title).toBe('Untitled');
    expect(m.scoreTitle).toBe('Untitled');
    expect(m.musicDifficultyType).toBe('master');
    expect(m.audioFileName).toBe('audio.ogg');
  });

  it('rejects unknown difficulties and out-of-range levels', () => {
    expect(() => normalizeManifest({ musicDifficultyType: 'inferno' })).toThrow(PackageError);
    expect(() => normalizeManifest({ playLevel: 120 })).toThrow(PackageError);
  });

  it('keeps fields it does not know about', () => {
    expect(normalizeManifest({ secForMusicScoreMaker: 120 }).secForMusicScoreMaker).toBe(120);
  });
});

import 'server-only';
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { createReadStream, createWriteStream } from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { mkdir, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { env } from '@/lib/env';

export interface PutOptions {
  contentType: string;
  /** Sets Content-Disposition so the CDN download keeps a readable file name. */
  downloadName?: string;
}

export interface Storage {
  /** Uploads a local file or buffer. Keys are relative to the site's prefix. */
  put(key: string, body: Buffer | { file: string }, options: PutOptions): Promise<void>;
  delete(key: string): Promise<void>;
  /** Copies an object to a local file. */
  download(key: string, file: string): Promise<void>;
  publicUrl(key: string): string;
}

/** Keys are content hashes, so an object never changes and can be cached for a year. */
const CACHE_CONTROL = 'public, max-age=31536000, immutable';

export function contentDisposition(name: string): string {
  const ascii = name.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

function assertKey(key: string) {
  if (!/^[a-z0-9][a-z0-9/_.-]*$/.test(key) || key.includes('..')) {
    throw new Error(`invalid storage key: ${key}`);
  }
}

class S3Storage implements Storage {
  private client: S3Client;
  constructor(
    private bucket: string,
    region: string,
    private prefix: string,
    private baseUrl: string,
  ) {
    // Credentials come from AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY.
    this.client = new S3Client({ region });
  }

  private full(key: string) {
    assertKey(key);
    return `${this.prefix.replace(/\/+$/, '')}/${key}`;
  }

  async put(key: string, body: Buffer | { file: string }, options: PutOptions) {
    const isFile = !Buffer.isBuffer(body);
    const length = isFile ? (await stat(body.file)).size : body.length;
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: this.full(key),
        Body: isFile ? createReadStream(body.file) : body,
        ContentLength: length,
        ContentType: options.contentType,
        CacheControl: CACHE_CONTROL,
        ContentDisposition: options.downloadName ? contentDisposition(options.downloadName) : undefined,
      }),
    );
  }

  async delete(key: string) {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: this.full(key) }));
  }

  async download(key: string, file: string) {
    const res = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: this.full(key) }));
    if (!res.Body) throw new Error(`empty object ${key}`);
    await pipeline(res.Body as Readable, createWriteStream(file));
  }

  publicUrl(key: string) {
    assertKey(key);
    return `${this.baseUrl.replace(/\/+$/, '')}/${key}`;
  }
}

/** Development backend: files under STORAGE_DIR, served by /files/[...key]. */
class LocalStorage implements Storage {
  constructor(private root: string) {}

  resolve(key: string) {
    assertKey(key);
    return path.join(path.resolve(this.root), key);
  }

  async put(key: string, body: Buffer | { file: string }, options: PutOptions) {
    const target = this.resolve(key);
    await mkdir(path.dirname(target), { recursive: true });
    if (Buffer.isBuffer(body)) {
      await writeFile(target, body);
    } else {
      const { copyFile } = await import('node:fs/promises');
      await copyFile(body.file, target);
    }
    await writeFile(`${target}.meta.json`, JSON.stringify(options));
  }

  async delete(key: string) {
    const target = this.resolve(key);
    await rm(target, { force: true });
    await rm(`${target}.meta.json`, { force: true });
  }

  async download(key: string, file: string) {
    const { copyFile } = await import('node:fs/promises');
    await copyFile(this.resolve(key), file);
  }

  publicUrl(key: string) {
    assertKey(key);
    return `${env().APP_ORIGIN}/files/${key}`;
  }
}

let cached: Storage | undefined;

export function storage(): Storage {
  if (!cached) {
    const e = env();
    cached =
      e.STORAGE_BACKEND === 's3'
        ? new S3Storage(e.S3_BUCKET!, e.AWS_REGION, e.S3_PREFIX, e.S3_PUBLIC_BASE_URL!)
        : new LocalStorage(e.STORAGE_DIR);
  }
  return cached;
}

export function localStorageBackend(): LocalStorage | null {
  const s = storage();
  return s instanceof LocalStorage ? s : null;
}

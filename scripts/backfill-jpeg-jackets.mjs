// One-off: re-encodes WebP jackets (charts uploaded before JPEG jackets) as JPEG, because the game
// can only decode PNG and JPEG. Run inside the production container:
//   docker exec sekai-fanmade node scripts/backfill-jpeg-jackets.mjs
// Uses the container's DATABASE_URL, S3_* and AWS_* settings. Safe to run again.
import { DeleteObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import postgres from 'postgres';
import sharp from 'sharp';

const { DATABASE_URL, S3_BUCKET, S3_PREFIX = 'sekai-fanmade', S3_PUBLIC_BASE_URL, AWS_REGION = 'ap-northeast-1' } = process.env;
if (!DATABASE_URL || !S3_BUCKET || !S3_PUBLIC_BASE_URL) {
  console.error('needs DATABASE_URL, S3_BUCKET and S3_PUBLIC_BASE_URL (STORAGE_BACKEND=s3)');
  process.exit(1);
}
const sql = postgres(DATABASE_URL, { max: 1 });
const s3 = new S3Client({ region: AWS_REGION });
const full = (key) => `${S3_PREFIX.replace(/\/+$/, '')}/${key}`;
try {
  const rows = await sql`select id, jacket_key from charts where jacket_key like '%.webp'`;
  console.log(`${rows.length} WebP jacket(s)`);
  for (const { id, jacket_key: oldKey } of rows) {
    const res = await fetch(`${S3_PUBLIC_BASE_URL.replace(/\/+$/, '')}/${oldKey}`);
    if (!res.ok) {
      console.error(`chart ${id}: ${oldKey} -> HTTP ${res.status}, skipped`);
      continue;
    }
    const jpeg = await sharp(Buffer.from(await res.arrayBuffer()))
      .flatten({ background: '#ffffff' })
      .jpeg({ quality: 88, mozjpeg: true })
      .toBuffer();
    const newKey = oldKey.replace(/\.webp$/, '.jpg');
    await s3.send(
      new PutObjectCommand({
        Bucket: S3_BUCKET,
        Key: full(newKey),
        Body: jpeg,
        ContentType: 'image/jpeg',
        CacheControl: 'public, max-age=31536000, immutable',
      }),
    );
    await sql`update charts set jacket_key = ${newKey} where id = ${id} and jacket_key = ${oldKey}`;
    await s3.send(new DeleteObjectCommand({ Bucket: S3_BUCKET, Key: full(oldKey) }));
    console.log(`chart ${id}: ${oldKey} -> ${newKey} (${jpeg.length} bytes)`);
  }
} finally {
  await sql.end();
}

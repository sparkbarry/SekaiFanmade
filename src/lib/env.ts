import 'server-only';
import { z } from 'zod';

const hex64 = z.string().regex(/^[0-9a-f]{64}$/, 'must be 64 lowercase hex characters');

const schema = z
  .object({
    APP_ORIGIN: z.url(),
    DATABASE_URL: z.string().min(1),

    SSO_ISSUER: z.url(),
    SSO_CLIENT_ID: z.string().min(1),
    SSO_CLIENT_SECRET: z.string().min(1),
    /** Comma-separated SSO user IDs that may moderate every chart and comment. */
    ADMIN_USER_IDS: z.string().default(''),

    SESSION_ENCRYPTION_KEY: hex64,
    /** Absolute session lifetime. Activity does not extend it. */
    SESSION_DAYS: z.coerce.number().int().min(1).max(30).default(7),
    /** How long a successful SSO UserInfo check is trusted before asking again. */
    SESSION_RECHECK_SECONDS: z.coerce.number().int().min(0).max(3600).default(60),

    STORAGE_BACKEND: z.enum(['local', 's3']).default('local'),
    STORAGE_DIR: z.string().default('.data/storage'),
    S3_BUCKET: z.string().optional(),
    AWS_REGION: z.string().default('ap-northeast-1'),
    S3_PREFIX: z.string().default('sekai-fanmade'),
    /** Public URL that maps to S3_PREFIX, e.g. https://distrib.ourtaiko.org/sekai-fanmade */
    S3_PUBLIC_BASE_URL: z.string().optional(),

    UPLOAD_MAX_MB: z.coerce.number().int().min(1).max(1024).default(100),
    UPLOADS_PER_DAY: z.coerce.number().int().min(1).default(20),
    TMP_DIR: z.string().optional(),

    /** Co-op live gRPC server (src/lib/multiplay). Port 0 turns it off. */
    MULTIPLAY_GRPC_HOST: z.string().default('127.0.0.1'),
    MULTIPLAY_GRPC_PORT: z.coerce.number().int().min(0).max(65535).default(50051),
    /** Where the game connects, sent in /api/v1/meta. Defaults to APP_ORIGIN (the proxy routes gRPC). */
    MULTIPLAY_PUBLIC_URL: z.url().optional(),
    /** Fewest players a round needs (the original game: 2). */
    MULTIPLAY_MIN_PLAYERS: z.coerce.number().int().min(1).max(5).default(2),
  })
  .superRefine((v, ctx) => {
    if (v.STORAGE_BACKEND === 's3') {
      if (!v.S3_BUCKET) ctx.addIssue({ code: 'custom', path: ['S3_BUCKET'], message: 'required for s3' });
      if (!v.S3_PUBLIC_BASE_URL)
        ctx.addIssue({ code: 'custom', path: ['S3_PUBLIC_BASE_URL'], message: 'required for s3' });
    }
  });

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

export function env(): Env {
  if (!cached) {
    const parsed = schema.safeParse(process.env);
    if (!parsed.success) {
      throw new Error(`Invalid environment: ${z.prettifyError(parsed.error)}`);
    }
    cached = parsed.data;
  }
  return cached;
}

export function isSecureOrigin(): boolean {
  return env().APP_ORIGIN.startsWith('https://');
}

export function adminIds(): Set<string> {
  return new Set(
    env()
      .ADMIN_USER_IDS.split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  );
}

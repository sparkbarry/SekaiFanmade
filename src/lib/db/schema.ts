import { sql } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import {
  bigint,
  bigserial,
  boolean,
  check,
  index,
  integer,
  pgTable,
  primaryKey,
  real,
  smallint,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';

export const DIFFICULTIES = ['easy', 'normal', 'hard', 'expert', 'master', 'append'] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

const now = () => timestamp({ withTimezone: true }).notNull().defaultNow();

/** One row per OurTaiko SSO account that has signed in. `id` is the OIDC `sub`. */
export const users = pgTable('users', {
  id: text().primaryKey(),
  nickname: text().notNull(),
  avatarUrl: text(),
  createdAt: now(),
  lastSeenAt: now(),
  bannedAt: timestamp({ withTimezone: true }),
});

/**
 * Website sessions. The cookie holds a random token; only its SHA-256 is stored.
 * The upstream SSO tokens are AES-256-GCM encrypted with SESSION_ENCRYPTION_KEY.
 */
export const sessions = pgTable(
  'sessions',
  {
    id: text().primaryKey(),
    userId: text()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    accessToken: text().notNull(),
    refreshToken: text(),
    accessExpiresAt: timestamp({ withTimezone: true }).notNull(),
    checkedAt: now(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    createdAt: now(),
  },
  (t) => [index('sessions_user_idx').on(t.userId)],
);

/**
 * Stored objects, content-addressed like OurTaiko Fanmade: the key is `<sha256>.<extension>` under the
 * site's prefix, flat in the bucket. Charts that upload the same bytes share one row and one object;
 * an object is deleted once no chart refers to it.
 */
export const files = pgTable(
  'files',
  {
    id: bigserial({ mode: 'number' }).primaryKey(),
    storageKey: text().notNull().unique(),
    sha256: text().notNull(),
    extension: text().notNull(),
    byteSize: bigint({ mode: 'number' }).notNull(),
    contentType: text().notNull(),
    createdAt: now(),
  },
  (t) => [
    check('files_sha256_check', sql`${t.sha256} ~ '^[0-9a-f]{64}$'`),
    check('files_storage_key_check', sql`${t.storageKey} = ${t.sha256} || '.' || ${t.extension}`),
  ],
);

export const charts = pgTable(
  'charts',
  {
    /** 32 random lowercase hex digits, like OurTaiko Fanmade and SSO user IDs. */
    id: text().primaryKey(),
    /** Short public number for typing (譜面ID検索, #12 in search). Existing charts kept their old numbers. */
    numberId: bigint({ mode: 'number' }).notNull().unique().generatedByDefaultAsIdentity(),
    uploaderId: text()
      .notNull()
      .references(() => users.id),
    title: text().notNull(),
    scoreTitle: text().notNull(),
    composer: text().notNull().default(''),
    lyricist: text().notNull().default(''),
    arranger: text().notNull().default(''),
    singer: text().notNull().default(''),
    collaborationLabel: text().notNull().default(''),
    description: text().notNull().default(''),
    difficulty: text().$type<Difficulty>().notNull(),
    playLevel: integer().notNull(),
    previewStartSec: real().notNull().default(0),
    hasVideo: boolean().notNull().default(false),
    /** Bumped every time the package is replaced, so the game can tell an installed copy is outdated. */
    revision: integer().notNull().default(1),
    /** Free tags set by the uploader (スタンダード, ネタ譜面, ...). */
    tags: text().array().notNull().default(sql`'{}'::text[]`),
    /** 二次利用OK: others may base their charts on this one. */
    allowDerivative: boolean().notNull().default(false),
    /** 親譜面: the chart this one was derived from. */
    parentChartId: text().references((): AnyPgColumn => charts.id, { onDelete: 'set null' }),
    /** Null only on deleted charts, whose files are released (charts_files_check). */
    packageFileId: bigint({ mode: 'number' }).references(() => files.id),
    audioFileId: bigint({ mode: 'number' }).references(() => files.id),
    jacketFileId: bigint({ mode: 'number' }).references(() => files.id),
    downloadCount: integer().notNull().default(0),
    /** Plays reported by the game (POST /api/v1/charts/<id>/plays), at most one per player per hour. */
    playCount: integer().notNull().default(0),
    /** Reddit-style votes; score = upvotes - downvotes. Kept in step with chart_votes by lib/votes.ts. */
    upvotes: integer().notNull().default(0),
    downvotes: integer().notNull().default(0),
    commentCount: integer().notNull().default(0),
    createdAt: now(),
    updatedAt: now(),
    deletedAt: timestamp({ withTimezone: true }),
  },
  (t) => [
    index('charts_list_idx').on(t.createdAt.desc()).where(sql`${t.deletedAt} is null`),
    index('charts_uploader_idx').on(t.uploaderId),
    check('charts_id_check', sql`${t.id} ~ '^[0-9a-f]{32}$'`),
    check(
      'charts_files_check',
      sql`${t.deletedAt} is not null or (${t.packageFileId} is not null and ${t.audioFileId} is not null)`,
    ),
    check('charts_difficulty_check', sql`${t.difficulty} in ('easy','normal','hard','expert','master','append')`),
    check('charts_level_check', sql`${t.playLevel} between 0 and 99`),
    check('charts_tags_check', sql`cardinality(${t.tags}) <= 8`),
    check('charts_votes_check', sql`${t.upvotes} >= 0 and ${t.downvotes} >= 0`),
    index('charts_tags_idx').using('gin', t.tags),
  ],
);

/** One vote per user and chart, as on Reddit: 1 or -1; withdrawing deletes the row. */
export const chartVotes = pgTable(
  'chart_votes',
  {
    chartId: text()
      .notNull()
      .references(() => charts.id, { onDelete: 'cascade' }),
    userId: text()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    value: smallint().notNull(),
    createdAt: now(),
  },
  (t) => [
    primaryKey({ columns: [t.chartId, t.userId] }),
    index('chart_votes_user_idx').on(t.userId),
    check('chart_votes_value_check', sql`${t.value} in (-1, 1)`),
  ],
);

/**
 * Threaded comments, as on Fanmade: replies point at their parent, root_id is the top-level ancestor.
 * A deleted (by its author) or removed (by an admin) comment with replies stays as an empty placeholder;
 * without replies the row goes.
 */
export const comments = pgTable(
  'comments',
  {
    id: bigserial({ mode: 'number' }).primaryKey(),
    chartId: text()
      .notNull()
      .references(() => charts.id, { onDelete: 'cascade' }),
    parentId: bigint({ mode: 'number' }).references((): AnyPgColumn => comments.id, { onDelete: 'cascade' }),
    rootId: bigint({ mode: 'number' }),
    depth: integer().notNull().default(0),
    userId: text()
      .notNull()
      .references(() => users.id),
    body: text(),
    upvotes: integer().notNull().default(0),
    downvotes: integer().notNull().default(0),
    replyCount: integer().notNull().default(0),
    createdAt: now(),
    editedAt: timestamp({ withTimezone: true }),
    deletedAt: timestamp({ withTimezone: true }),
    removedAt: timestamp({ withTimezone: true }),
  },
  (t) => [
    index('comments_chart_idx').on(t.chartId, t.createdAt),
    index('comments_root_idx').on(t.rootId),
    index('comments_user_idx').on(t.userId, t.createdAt),
    check(
      'comments_body_check',
      sql`(${t.deletedAt} is null and ${t.removedAt} is null and char_length(${t.body}) between 1 and 10000) or ((${t.deletedAt} is not null or ${t.removedAt} is not null) and ${t.body} is null)`,
    ),
    check('comments_depth_check', sql`${t.depth} between 0 and 1000`),
    check('comments_votes_check', sql`${t.upvotes} >= 0 and ${t.downvotes} >= 0 and ${t.replyCount} >= 0`),
  ],
);

export const commentVotes = pgTable(
  'comment_votes',
  {
    commentId: bigint({ mode: 'number' })
      .notNull()
      .references(() => comments.id, { onDelete: 'cascade' }),
    userId: text()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    value: smallint().notNull(),
    createdAt: now(),
  },
  (t) => [
    primaryKey({ columns: [t.commentId, t.userId] }),
    check('comment_votes_value_check', sql`${t.value} in (-1, 1)`),
  ],
);

/** Storage objects that are no longer referenced and could not be deleted right away. */
export const retiredObjects = pgTable('retired_objects', {
  key: text().primaryKey(),
  retiredAt: now(),
});

/** One row per counted play; ranking 'daily' counts the last 24 hours. `actor` is a user ID or a hashed address. */
export const chartPlays = pgTable(
  'chart_plays',
  {
    id: bigserial({ mode: 'number' }).primaryKey(),
    chartId: text()
      .notNull()
      .references(() => charts.id, { onDelete: 'cascade' }),
    actor: text().notNull(),
    createdAt: now(),
  },
  (t) => [index('chart_plays_chart_idx').on(t.chartId, t.createdAt), index('chart_plays_time_idx').on(t.createdAt)],
);

/** マイリスト: charts a user saved for later. */
export const bookmarks = pgTable(
  'bookmarks',
  {
    chartId: text()
      .notNull()
      .references(() => charts.id, { onDelete: 'cascade' }),
    userId: text()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: now(),
  },
  (t) => [primaryKey({ columns: [t.chartId, t.userId] }), index('bookmarks_user_idx').on(t.userId, t.createdAt)],
);

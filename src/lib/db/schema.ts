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

export const charts = pgTable(
  'charts',
  {
    id: bigserial({ mode: 'number' }).primaryKey(),
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
    /** Bumped every time the package is replaced; storage keys include it. */
    revision: integer().notNull().default(1),
    /** Free tags set by the uploader (スタンダード, ネタ譜面, ...). */
    tags: text().array().notNull().default(sql`'{}'::text[]`),
    /** 二次利用OK: others may base their charts on this one. */
    allowDerivative: boolean().notNull().default(false),
    /** 親譜面: the chart this one was derived from. */
    parentChartId: bigint({ mode: 'number' }).references((): AnyPgColumn => charts.id, { onDelete: 'set null' }),
    packageKey: text().notNull(),
    packageSize: bigint({ mode: 'number' }).notNull(),
    packageSha256: text().notNull(),
    jacketKey: text(),
    audioKey: text().notNull(),
    downloadCount: integer().notNull().default(0),
    /** Plays reported by the game (POST /api/v1/charts/<id>/plays), at most one per player per hour. */
    playCount: integer().notNull().default(0),
    likeCount: integer().notNull().default(0),
    commentCount: integer().notNull().default(0),
    createdAt: now(),
    updatedAt: now(),
    deletedAt: timestamp({ withTimezone: true }),
  },
  (t) => [
    index('charts_list_idx').on(t.createdAt.desc()).where(sql`${t.deletedAt} is null`),
    index('charts_uploader_idx').on(t.uploaderId),
    check('charts_difficulty_check', sql`${t.difficulty} in ('easy','normal','hard','expert','master','append')`),
    check('charts_level_check', sql`${t.playLevel} between 0 and 99`),
    check('charts_tags_check', sql`cardinality(${t.tags}) <= 8`),
    index('charts_tags_idx').using('gin', t.tags),
  ],
);

export const chartLikes = pgTable(
  'chart_likes',
  {
    chartId: bigint({ mode: 'number' })
      .notNull()
      .references(() => charts.id, { onDelete: 'cascade' }),
    userId: text()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: now(),
  },
  (t) => [primaryKey({ columns: [t.chartId, t.userId] }), index('chart_likes_user_idx').on(t.userId)],
);

export const comments = pgTable(
  'comments',
  {
    id: bigserial({ mode: 'number' }).primaryKey(),
    chartId: bigint({ mode: 'number' })
      .notNull()
      .references(() => charts.id, { onDelete: 'cascade' }),
    userId: text()
      .notNull()
      .references(() => users.id),
    body: text().notNull(),
    createdAt: now(),
    deletedAt: timestamp({ withTimezone: true }),
  },
  (t) => [
    index('comments_chart_idx').on(t.chartId, t.createdAt),
    check('comments_body_check', sql`char_length(${t.body}) between 1 and 1000`),
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
    chartId: bigint({ mode: 'number' })
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
    chartId: bigint({ mode: 'number' })
      .notNull()
      .references(() => charts.id, { onDelete: 'cascade' }),
    userId: text()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: now(),
  },
  (t) => [primaryKey({ columns: [t.chartId, t.userId] }), index('bookmarks_user_idx').on(t.userId, t.createdAt)],
);

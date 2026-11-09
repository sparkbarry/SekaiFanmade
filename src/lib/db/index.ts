import 'server-only';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { env } from '@/lib/env';
import * as schema from './schema';

type Db = ReturnType<typeof create>;

const globalForDb = globalThis as unknown as { sekaiDb?: Db };

function create() {
  const client = postgres(env().DATABASE_URL, { max: 10, idle_timeout: 30 });
  return drizzle(client, { schema, casing: 'snake_case' });
}

/** Lazily created so `next build` does not need a database. */
export function db(): Db {
  if (!globalForDb.sekaiDb) globalForDb.sekaiDb = create();
  return globalForDb.sekaiDb;
}

export * from './schema';

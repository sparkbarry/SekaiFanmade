// Applies the SQL migrations in ./drizzle before the server starts.
// Runs in the production image with only the standalone node_modules, so it uses
// drizzle-orm's migrator (bundled there) and nothing from drizzle-kit.
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set');
  process.exit(1);
}

const here = path.dirname(fileURLToPath(import.meta.url));
const client = postgres(url, { max: 1, onnotice: () => {} });
try {
  await migrate(drizzle(client), { migrationsFolder: path.join(here, '..', 'drizzle') });
  console.log('migrations applied');
} finally {
  await client.end();
}

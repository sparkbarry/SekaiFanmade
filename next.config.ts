import type { NextConfig } from 'next';

const config: NextConfig = {
  output: 'standalone',
  poweredByHeader: false,
  serverExternalPackages: ['sharp'],
  // scripts/migrate.mjs runs before server.js and needs drizzle-orm's migrator.
  outputFileTracingIncludes: { '/readyz': ['./node_modules/drizzle-orm/**/*', './node_modules/postgres/**/*'] },
  experimental: {
    // Chart metadata edits go through server actions; packages go through /api/v1/uploads.
    serverActions: { bodySizeLimit: '1mb' },
  },
};

export default config;

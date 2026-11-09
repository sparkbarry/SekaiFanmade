import next from 'eslint-config-next/core-web-vitals';
import ts from 'eslint-config-next/typescript';

const config = [
  { ignores: ['.next/**', 'node_modules/**', 'drizzle/**', 'next-env.d.ts', 'src/lib/multiplay/proto/**'] },
  ...next,
  ...ts,
];

export default config;

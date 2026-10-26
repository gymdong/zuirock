import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

// Integration tests TRUNCATE their database, so two runners on one database break each other (fake 401/404,
// deadlocks — docs/contracts.md). Unless TEST_DATABASE_URL pins one, every run gets its own throwaway
// database `zuirock_test_run_<epoch>_<rand>`; test/support/global-setup.ts creates it and drops it afterwards.
if (!process.env.TEST_DATABASE_URL) {
  const name = `zuirock_test_run_${Math.floor(Date.now() / 1000)}_${Math.random().toString(36).slice(2, 6)}`;
  process.env.TEST_DATABASE_URL = `postgresql://zuirock:zuirock@localhost:5432/${name}`;
  process.env.ZR_TEST_DB_EPHEMERAL = '1';
}
const TEST_DB = process.env.TEST_DATABASE_URL;

// SWC keeps decorator metadata (Nest DI); esbuild would drop it.
export default defineConfig({
  plugins: [swc.vite({ module: { type: 'es6' } })],
  test: {
    include: ['test/**/*.{spec,int-spec,sim-spec,prop-spec}.ts'],
    environment: 'node',
    testTimeout: 30_000,
    hookTimeout: 60_000,
    // Integration specs share one database; run files one at a time.
    fileParallelism: false,
    globalSetup: ['test/support/global-setup.ts'],
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: TEST_DB,
      DIRECT_URL: TEST_DB,
      JWT_SECRET: 'test-jwt-secret',
      STATE_SECRET: 'test-state-secret',
      GUEST_TOKEN_SECRET: 'test-guest-secret',
      PUBLIC_ORIGIN: 'https://zuirock.test',
      PRISMA_QUERY_EVENTS: '1',
    },
  },
});

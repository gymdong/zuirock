import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

// LB integration tests use their own database so lanes sharing the compose Postgres don't collide.
const TEST_DB = process.env.TEST_DATABASE_URL ?? 'postgresql://zuirock:zuirock@localhost:5432/zuirock_test_lb';

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
    },
  },
});

import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

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
  },
});

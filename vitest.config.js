import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    include: ['test/**/*.js'],
    exclude: ['test/setup.js', 'test/**/*.bench.js'],
    globalSetup: ['test/setup.js'],
    benchmark: {
      include: ['test/**/*.bench.js'],
    },
  },
});

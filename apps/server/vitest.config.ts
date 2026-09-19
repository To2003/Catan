import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'server',
    include: ['test/**/*.test.ts'],
    // Real sockets: a little slower than a pure unit test, and worth it.
    testTimeout: 20_000,
    hookTimeout: 20_000,
  },
});

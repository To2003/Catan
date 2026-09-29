import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'server',
    include: ['test/**/*.test.ts'],
    // Real sockets: a little slower than a pure unit test, and worth it.
    testTimeout: 30_000,
    hookTimeout: 30_000,
    /**
     * One file at a time. These suites each run a server and several real
     * clients; in parallel they compete for the same CPU and the slowest one —
     * rolling dice until a seven turns up — starts timing out. Sequential
     * costs a few seconds and removes a whole class of false failures.
     */
    fileParallelism: false,
  },
});

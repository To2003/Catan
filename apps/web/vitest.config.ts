import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  test: {
    name: 'web',
    // `.tsx` as well now: the lobby's pieces are worth testing as pieces.
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    environment: 'jsdom',
    setupFiles: ['./test/setup.ts'],
  },
});

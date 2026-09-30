import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    // REGLAS.md lives at the root of the repo, above this app: the rules are a
    // document of the project, not an asset of the client, and the client
    // renders that one file rather than keeping a copy.
    fs: { allow: ['../..'] },
  },
});

import { defineConfig } from 'tsup';

/**
 * Production build for the server.
 *
 * The engine is consumed by source (M0), so `node dist/index.js` cannot resolve
 * it on its own — that was the debt M0 wrote down. Bundling settles it: the
 * engine is compiled into the output and the only runtime dependency left is
 * Node itself plus what express and socket.io need.
 */
export default defineConfig({
  entry: ['src/index.ts'],
  outDir: 'build',
  format: ['esm'],
  platform: 'node',
  target: 'node24',
  // Bundled: the workspace engine. External: everything with a real package in
  // node_modules, which the image installs anyway.
  noExternal: ['@tierra-austral/engine'],
  external: ['express', 'cors', 'socket.io'],
  /**
   * `node:sqlite` is newer than esbuild's list of Node builtins, so esbuild
   * treated it as a package, stripped the prefix and emitted `import
   * "sqlite"` — which only failed at startup. This keeps every `node:` import
   * exactly as written.
   */
  esbuildPlugins: [
    {
      name: 'keep-node-builtins',
      setup(build) {
        build.onResolve({ filter: /^node:/ }, (args) => ({ path: args.path, external: true }));
      },
    },
  ],
  clean: true,
  sourcemap: true,
  // The build is a deploy artifact, not a library: no type declarations.
  dts: false,
});

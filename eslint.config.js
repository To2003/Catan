// @ts-check
import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

/**
 * The engine must stay pure: no wall clock, no ambient randomness, no I/O.
 * These are architectural constraints (see SPEC.md §6), so the linter enforces
 * them instead of relying on review.
 */
const forbiddenInEngine = {
  'no-restricted-globals': [
    'error',
    { name: 'Date', message: 'The engine must be deterministic: no wall clock.' },
    { name: 'performance', message: 'The engine must be deterministic: no wall clock.' },
    { name: 'crypto', message: 'Randomness must come from the seeded PRNG in rng.ts.' },
    { name: 'process', message: 'The engine must not touch the host environment.' },
    { name: 'fetch', message: 'The engine must not perform I/O.' },
    { name: 'console', message: 'The engine must not perform I/O.' },
  ],
  'no-restricted-properties': [
    'error',
    {
      object: 'Math',
      property: 'random',
      message: 'Randomness must come from the seeded PRNG in rng.ts.',
    },
    {
      object: 'Date',
      property: 'now',
      message: 'The engine must be deterministic: no wall clock.',
    },
  ],
  'no-restricted-imports': [
    'error',
    {
      patterns: [
        { group: ['node:*', 'fs', 'path', 'crypto'], message: 'The engine must not perform I/O.' },
      ],
    },
  ],
};

export default defineConfig(
  {
    ignores: ['**/dist/**', '**/coverage/**', '**/node_modules/**', '**/*.tsbuildinfo'],
  },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: {
          // Config files live outside every package's tsconfig graph.
          allowDefaultProject: ['*.config.js', '*.config.ts', 'packages/*/vitest.config.ts'],
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
    },
  },
  {
    files: ['packages/engine/src/**/*.ts'],
    rules: forbiddenInEngine,
  },
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    extends: [reactHooks.configs.flat['recommended-latest']],
  },
  {
    // Config files are not part of any package's tsconfig graph, so there is no
    // type information for them: lint them syntactically only.
    files: ['*.config.{js,ts}', '**/*.config.{js,ts}'],
    extends: [tseslint.configs.disableTypeChecked],
  },
);

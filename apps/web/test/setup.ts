import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Every test gets an empty document, so one test's lobby cannot be found by
// the next one's query.
afterEach(cleanup);

// jsdom lays nothing out, so it has no ResizeObserver. The board measures its
// box with one; in a test it simply never fires, which leaves the board at its
// fallback square viewBox — fine, since nothing here asserts on its size.
if (!('ResizeObserver' in globalThis)) {
  globalThis.ResizeObserver = class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  };
}

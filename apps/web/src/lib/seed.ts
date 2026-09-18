/**
 * Seed handling for the board screen.
 *
 * The seed lives in the URL so any board you are looking at can be reproduced
 * by copying the link. Randomness here is fine: this is the app, not the engine.
 */

const UINT32 = 0x100000000;

/** Parses a seed from user input, normalising it to uint32. */
export const parseSeed = (raw: string | null): number | undefined => {
  if (raw === null || raw.trim() === '') return undefined;
  const value = Number(raw);
  if (!Number.isFinite(value)) return undefined;
  return Math.trunc(value) >>> 0;
};

export const randomSeed = (): number => Math.floor(Math.random() * UINT32) >>> 0;

export const readSeedFromUrl = (): number | undefined =>
  parseSeed(new URLSearchParams(window.location.search).get('seed'));

/** Reflects the seed in the address bar without adding a history entry. */
export const writeSeedToUrl = (seed: number): void => {
  const url = new URL(window.location.href);
  url.searchParams.set('seed', String(seed));
  window.history.replaceState(null, '', url);
};

/** Whether to open the hot-seat debug tool, from `?debug=1` (SPEC.md §6, M2). */
export const readHotSeatFromUrl = (): boolean =>
  new URLSearchParams(window.location.search).get('debug') === '1';

/** Whether the debug id overlay should start on, from `?ids=1`. Handy for sharing a link. */
export const readDebugFromUrl = (): boolean =>
  new URLSearchParams(window.location.search).get('ids') === '1';

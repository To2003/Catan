/**
 * Seeded PRNG (mulberry32).
 *
 * The engine never reaches for ambient randomness: every draw threads the RNG
 * state through the return value, so a game is fully reproducible from
 * `seed + actions[]` (SPEC.md §6). Callers must always keep the returned state.
 */

/** The whole generator state: a 32-bit integer. */
export type RngState = number;

export interface Draw<T> {
  readonly value: T;
  readonly state: RngState;
}

const UINT32 = 0x100000000;

export const createRng = (seed: number): RngState => seed >>> 0;

/** One step of mulberry32: a float in [0, 1). */
export const nextFloat = (state: RngState): Draw<number> => {
  let t = (state + 0x6d2b79f5) >>> 0;
  const nextState = t;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return { value: ((t ^ (t >>> 14)) >>> 0) / UINT32, state: nextState };
};

/** An integer in [0, bound). Throws on a non-positive bound: that is a caller bug, not a game rule. */
export const nextInt = (state: RngState, bound: number): Draw<number> => {
  if (!Number.isInteger(bound) || bound <= 0) {
    throw new RangeError(`bound must be a positive integer, got ${bound}`);
  }
  const draw = nextFloat(state);
  return { value: Math.floor(draw.value * bound), state: draw.state };
};

/** A die face in [1, 6]. */
export const rollDie = (state: RngState): Draw<number> => {
  const draw = nextInt(state, 6);
  return { value: draw.value + 1, state: draw.state };
};

/** Fisher-Yates over a copy: the input array is never touched. */
export const shuffle = <T>(state: RngState, items: readonly T[]): Draw<T[]> => {
  const result = [...items];
  let current = state;
  for (let i = result.length - 1; i > 0; i -= 1) {
    const draw = nextInt(current, i + 1);
    current = draw.state;
    const j = draw.value;
    // The casts are safe by construction: both indices are in range.
    const tmp = result[i] as T;
    result[i] = result[j] as T;
    result[j] = tmp;
  }
  return { value: result, state: current };
};

/** Picks one element, or undefined when the list is empty. */
export const pick = <T>(state: RngState, items: readonly T[]): Draw<T | undefined> => {
  if (items.length === 0) return { value: undefined, state };
  const draw = nextInt(state, items.length);
  return { value: items[draw.value], state: draw.state };
};

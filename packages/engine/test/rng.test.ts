import { describe, expect, it } from 'vitest';
import { createRng, nextFloat, nextInt, pick, rollDie, shuffle } from '../src/rng.js';

describe('rng', () => {
  it('is deterministic for a given seed', () => {
    const a = nextFloat(createRng(12345));
    const b = nextFloat(createRng(12345));
    expect(a).toEqual(b);
  });

  it('produces different sequences for different seeds', () => {
    expect(nextFloat(createRng(1)).value).not.toBe(nextFloat(createRng(2)).value);
  });

  it('replays an identical sequence from the same seed', () => {
    const run = (seed: number): number[] => {
      let state = createRng(seed);
      const values: number[] = [];
      for (let i = 0; i < 50; i += 1) {
        const draw = nextFloat(state);
        state = draw.state;
        values.push(draw.value);
      }
      return values;
    };
    expect(run(99)).toEqual(run(99));
  });

  it('returns floats in [0, 1)', () => {
    let state = createRng(7);
    for (let i = 0; i < 1000; i += 1) {
      const draw = nextFloat(state);
      state = draw.state;
      expect(draw.value).toBeGreaterThanOrEqual(0);
      expect(draw.value).toBeLessThan(1);
    }
  });

  it('advances the state on every draw', () => {
    const first = nextFloat(createRng(42));
    const second = nextFloat(first.state);
    expect(second.state).not.toBe(first.state);
    expect(second.value).not.toBe(first.value);
  });

  describe('nextInt', () => {
    it('stays within [0, bound)', () => {
      let state = createRng(3);
      for (let i = 0; i < 1000; i += 1) {
        const draw = nextInt(state, 19);
        state = draw.state;
        expect(Number.isInteger(draw.value)).toBe(true);
        expect(draw.value).toBeGreaterThanOrEqual(0);
        expect(draw.value).toBeLessThan(19);
      }
    });

    it('rejects a non-positive bound', () => {
      expect(() => nextInt(createRng(1), 0)).toThrow(RangeError);
      expect(() => nextInt(createRng(1), -5)).toThrow(RangeError);
    });
  });

  describe('rollDie', () => {
    it('only ever yields faces 1 to 6', () => {
      let state = createRng(2024);
      const seen = new Set<number>();
      for (let i = 0; i < 2000; i += 1) {
        const draw = rollDie(state);
        state = draw.state;
        seen.add(draw.value);
      }
      expect([...seen].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6]);
    });
  });

  describe('shuffle', () => {
    const items = Array.from({ length: 19 }, (_, i) => i);

    it('does not mutate the input', () => {
      const original = [...items];
      shuffle(createRng(5), items);
      expect(items).toEqual(original);
    });

    it('is a permutation of the input', () => {
      const { value } = shuffle(createRng(5), items);
      expect([...value].sort((a, b) => a - b)).toEqual(items);
    });

    it('is deterministic for a given seed', () => {
      expect(shuffle(createRng(5), items).value).toEqual(shuffle(createRng(5), items).value);
    });

    it('actually reorders', () => {
      expect(shuffle(createRng(5), items).value).not.toEqual(items);
    });

    it('handles empty and single-element lists', () => {
      expect(shuffle(createRng(5), []).value).toEqual([]);
      expect(shuffle(createRng(5), ['only']).value).toEqual(['only']);
    });
  });

  describe('pick', () => {
    it('returns undefined and an untouched state for an empty list', () => {
      const state = createRng(8);
      const draw = pick(state, []);
      expect(draw.value).toBeUndefined();
      expect(draw.state).toBe(state);
    });

    it('returns an element of the list', () => {
      const draw = pick(createRng(8), ['a', 'b', 'c']);
      expect(['a', 'b', 'c']).toContain(draw.value);
    });
  });
});

import { describe, expect, it } from 'vitest';
import { parseSeed } from './seed.js';

describe('parseSeed', () => {
  it('accepts a plain number', () => {
    expect(parseSeed('20260918')).toBe(20260918);
  });

  it('normalises to uint32', () => {
    expect(parseSeed('-1')).toBe(0xffffffff);
    expect(parseSeed(String(0x100000000 + 7))).toBe(7);
    expect(parseSeed('12.9')).toBe(12);
  });

  it('rejects anything that is not a number, so the caller picks a fresh seed', () => {
    expect(parseSeed(null)).toBeUndefined();
    expect(parseSeed('')).toBeUndefined();
    expect(parseSeed('   ')).toBeUndefined();
    expect(parseSeed('pizza')).toBeUndefined();
    expect(parseSeed('NaN')).toBeUndefined();
    expect(parseSeed('Infinity')).toBeUndefined();
  });
});

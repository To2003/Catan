import { describe, expect, it } from 'vitest';
import {
  DEV_DECK_COMPOSITION,
  DEV_DECK_SIZE,
  EDGE_COUNT,
  HEX_COUNT,
  NUMBER_TOKENS,
  PORT_COUNT,
  PORT_TYPES,
  RESOURCES,
  TERRAIN_COUNTS,
  TERRAIN_RESOURCE,
  VERTEX_COUNT,
  emptyBundle,
} from '../src/constants.js';

const sum = (values: readonly number[]): number => values.reduce((a, b) => a + b, 0);

describe('constants', () => {
  it('has 19 hexes, one of them the desert', () => {
    expect(sum(Object.values(TERRAIN_COUNTS))).toBe(HEX_COUNT);
    expect(TERRAIN_COUNTS.desert).toBe(1);
  });

  it('has one number token per non-desert hex', () => {
    expect(NUMBER_TOKENS).toHaveLength(HEX_COUNT - TERRAIN_COUNTS.desert);
  });

  it('never places a 7 as a number token', () => {
    expect(NUMBER_TOKENS).not.toContain(7);
  });

  it('maps every terrain except the desert to a distinct resource', () => {
    const produced = Object.values(TERRAIN_RESOURCE).filter((r) => r !== null);
    expect(new Set(produced)).toEqual(new Set(RESOURCES));
    expect(TERRAIN_RESOURCE.desert).toBeNull();
  });

  it('has 9 ports: 4 generic and one 2:1 per resource', () => {
    expect(PORT_TYPES).toHaveLength(PORT_COUNT);
    expect(PORT_TYPES.filter((p) => p === '3:1')).toHaveLength(4);
    const specific = PORT_TYPES.filter((p) => p !== '3:1');
    expect(new Set(specific)).toEqual(new Set(RESOURCES));
  });

  it('has a 25-card development deck', () => {
    expect(sum(Object.values(DEV_DECK_COMPOSITION))).toBe(DEV_DECK_SIZE);
  });

  it('describes a radius-2 board graph', () => {
    expect(VERTEX_COUNT).toBe(54);
    expect(EDGE_COUNT).toBe(72);
  });

  it('hands out a fresh zeroed bundle each call', () => {
    const first = emptyBundle();
    first.wood = 5;
    expect(emptyBundle().wood).toBe(0);
  });
});

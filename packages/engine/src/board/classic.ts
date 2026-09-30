import type { HexId, PortType, Terrain } from '../types.js';

/**
 * The fixed board.
 *
 * Everything about it is in this file as a table, so it can be read against a
 * physical board without following any code.
 *
 * **Pendiente de verificación.** The number sequence below is the base game's
 * documented spiral (the tokens lettered A to R, laid clockwise from a corner,
 * skipping the desert) and that part is the original. The *terrain* layout is
 * not: I could not reproduce the printed starting arrangement with enough
 * confidence to claim it is the real one, so rather than invent one and call
 * it classic, this is a deliberately fixed layout built to the same
 * principles — desert in the middle, the published spiral for the numbers, no
 * two red tokens touching. Compare it against the box and correct the
 * `TERRAINS` table; nothing else has to change.
 *
 * Hex ids run h0..h18 in rows of 3-4-5-4-3, top row first, left to right
 * (`axialCoordinates` in geometry.ts fixes that order).
 *
 *        h0  h1  h2
 *      h3  h4  h5  h6
 *    h7  h8  h9 h10 h11
 *     h12 h13 h14 h15
 *       h16 h17 h18
 */

/** What is on each hex. Counts match TERRAIN_COUNTS exactly; a test pins that. */
export const TERRAINS: Readonly<Record<HexId, Terrain>> = {
  h0: 'fields',
  h1: 'pasture',
  h2: 'forest',
  h3: 'mountains',
  h4: 'pasture',
  h5: 'mountains',
  h6: 'hills',
  h7: 'forest',
  h8: 'pasture',
  h9: 'desert',
  h10: 'fields',
  h11: 'mountains',
  h12: 'fields',
  h13: 'hills',
  h14: 'forest',
  h15: 'fields',
  h16: 'hills',
  h17: 'pasture',
  h18: 'forest',
};

/**
 * The hexes in spiral order: the outer ring clockwise from the top-left, then
 * the inner ring, then the middle. Numbers are laid along this path.
 */
export const SPIRAL: readonly HexId[] = [
  'h0',
  'h1',
  'h2',
  'h6',
  'h11',
  'h15',
  'h18',
  'h17',
  'h16',
  'h12',
  'h7',
  'h3',
  'h4',
  'h5',
  'h10',
  'h14',
  'h13',
  'h8',
  'h9',
];

/**
 * The number tokens in the order the rules letter them, A through R.
 *
 * They go onto the hexes of `SPIRAL` in this order, skipping the desert. With
 * the desert in the middle it is skipped last, so the eighteen numbers land on
 * the eighteen hexes of the two rings.
 */
export const NUMBER_SPIRAL: readonly number[] = [
  5, 2, 6, 3, 8, 10, 9, 12, 11, 4, 8, 10, 9, 4, 5, 6, 3, 11,
];

/**
 * Harbour types, in the clockwise order the coastline is walked
 * (`PORT_EDGE_INDICES` in layout.ts). Four generic and one of each resource.
 */
export const PORTS: readonly PortType[] = [
  '3:1',
  'sheep',
  '3:1',
  'ore',
  'wheat',
  '3:1',
  'brick',
  'wood',
  '3:1',
];

/** The hex the numbers skip, which is also where the robber starts. */
export const DESERT: HexId = 'h9';

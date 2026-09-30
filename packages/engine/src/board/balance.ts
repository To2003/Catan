import type { EdgeId, HexId, PortType, Terrain } from '../types.js';
import { RESOURCES, TERRAIN_RESOURCE } from '../constants.js';
import { adjacentHexes, type BoardGeometry } from './geometry.js';

/**
 * What makes a board worth playing on.
 *
 * None of this is a rule of the game: a board that fails every check here is
 * perfectly legal and the `'random'` mode will happily deal one. These are the
 * things that make a table groan — the three wheat hexes in a row, the two
 * eights on the same corner, the ore that never comes up — written down so a
 * mode can reject them and draw again.
 */

/** How often each number comes up, in dots on the token. */
export const PIPS: Readonly<Record<number, number>> = {
  2: 1,
  3: 2,
  4: 3,
  5: 4,
  6: 5,
  8: 5,
  9: 4,
  10: 3,
  11: 2,
  12: 1,
};

export interface BalanceLimits {
  /** Smallest acceptable share of the board's pips for one resource, as a fraction of its fair share. */
  readonly minShare: number;
  /** Largest acceptable share, same units. */
  readonly maxShare: number;
}

/**
 * Calibrated over 1000 seeds.
 *
 * On plain random boards a resource's share of the pips runs from 0.41 to
 * 1.55 of its fair share, with the middle half between about 0.85 and 1.15.
 * This band cuts off roughly the worst tenth at each end. Together with the
 * other three rules it accepts about one board in seventy-seven, which takes
 * 2.2 ms and 71 draws on average, 470 in the worst of those thousand seeds.
 */
export const DEFAULT_LIMITS: BalanceLimits = { minShare: 0.72, maxShare: 1.3 };

export interface BalanceInput {
  readonly geometry: BoardGeometry;
  readonly terrains: ReadonlyMap<HexId, Terrain>;
  readonly numbers: ReadonlyMap<HexId, number>;
  /** Harbour type per coast edge, and the single hex that edge belongs to. */
  readonly ports: readonly { readonly type: PortType; readonly hex: HexId }[];
}

/** Rule 2: no two hexes carrying the same number may touch. */
export const hasAdjacentEqualNumbers = (input: BalanceInput): boolean =>
  [...input.numbers.entries()].some(([hexId, value]) =>
    adjacentHexes(input.geometry, hexId).some((other) => input.numbers.get(other) === value),
  );

/**
 * Rule 3: no three hexes of the same terrain joined in a chain.
 *
 * Two touching is ordinary; three is a corner of the board that only ever pays
 * one thing. The desert is excluded — there is only one.
 */
export const hasTerrainClump = (input: BalanceInput): boolean => {
  const seen = new Set<HexId>();

  for (const start of input.geometry.hexIds) {
    if (seen.has(start)) continue;
    const terrain = input.terrains.get(start);
    if (terrain === undefined || terrain === 'desert') continue;

    // Flood fill across hexes of the same terrain.
    const group: HexId[] = [start];
    seen.add(start);
    for (let index = 0; index < group.length; index += 1) {
      const hexId = group[index] as HexId;
      for (const other of adjacentHexes(input.geometry, hexId)) {
        if (seen.has(other) || input.terrains.get(other) !== terrain) continue;
        seen.add(other);
        group.push(other);
      }
    }
    if (group.length > 2) return true;
  }

  return false;
};

/** The pips each resource pays out across the whole board. */
export const pipsByResource = (input: BalanceInput): Record<string, number> => {
  const totals: Record<string, number> = Object.fromEntries(
    RESOURCES.map((resource) => [resource, 0]),
  );
  for (const [hexId, terrain] of input.terrains) {
    if (terrain === 'desert') continue;
    const number = input.numbers.get(hexId);
    if (number === undefined) continue;
    totals[TERRAIN_RESOURCE[terrain]] =
      (totals[TERRAIN_RESOURCE[terrain]] ?? 0) + (PIPS[number] ?? 0);
  }
  return totals;
};

/**
 * Rule 4: nobody's resource is starved or flooded.
 *
 * A resource's fair share is proportional to how many hexes produce it, so
 * wood on four hexes is expected to pay more than ore on three. The band is a
 * multiple of that share rather than a flat number.
 */
export const hasLopsidedPips = (input: BalanceInput, limits: BalanceLimits): boolean => {
  const totals = pipsByResource(input);
  const all = Object.values(totals).reduce((sum, value) => sum + value, 0);

  const hexesOf: Record<string, number> = Object.fromEntries(
    RESOURCES.map((resource) => [resource, 0]),
  );
  let numbered = 0;
  for (const [hexId, terrain] of input.terrains) {
    if (terrain === 'desert' || input.numbers.get(hexId) === undefined) continue;
    numbered += 1;
    hexesOf[TERRAIN_RESOURCE[terrain]] = (hexesOf[TERRAIN_RESOURCE[terrain]] ?? 0) + 1;
  }
  if (numbered === 0) return false;

  return RESOURCES.some((resource) => {
    const fair = (all * (hexesOf[resource] ?? 0)) / numbered;
    const got = totals[resource] ?? 0;
    return got < fair * limits.minShare || got > fair * limits.maxShare;
  });
};

/**
 * Rule 5: a 2:1 harbour may not sit on a red hex of its own resource.
 *
 * That corner is already the best one on the board; handing it the harbour
 * that doubles it as well is how a game is decided in the first placement.
 */
export const hasHotPortOnItsOwn = (input: BalanceInput): boolean =>
  input.ports.some((port) => {
    if (port.type === '3:1') return false;
    const terrain = input.terrains.get(port.hex);
    if (terrain === undefined || terrain === 'desert') return false;
    if (TERRAIN_RESOURCE[terrain] !== port.type) return false;
    const number = input.numbers.get(port.hex);
    return number === 6 || number === 8;
  });

/** Every reason a board might be sent back, for reporting. */
export const complaints = (input: BalanceInput, limits: BalanceLimits): string[] => {
  const found: string[] = [];
  if (hasAdjacentEqualNumbers(input)) found.push('equalNumbers');
  if (hasTerrainClump(input)) found.push('terrainClump');
  if (hasLopsidedPips(input, limits)) found.push('lopsidedPips');
  if (hasHotPortOnItsOwn(input)) found.push('hotPort');
  return found;
};

export const isBalanced = (input: BalanceInput, limits: BalanceLimits): boolean =>
  complaints(input, limits).length === 0;

/** The single hex a coast edge belongs to, for the harbour rule. */
export const hexOfCoastEdge = (geometry: BoardGeometry, edgeId: EdgeId): HexId => {
  const hex = geometry.edges[edgeId]?.hexes[0];
  if (hex === undefined) throw new Error(`no hex for coast edge ${edgeId}`);
  return hex;
};

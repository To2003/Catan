import type { DevCard, Resource, ResourceBundle, Terrain } from './types.js';

export const RESOURCES = [
  'wood',
  'brick',
  'sheep',
  'wheat',
  'ore',
] as const satisfies readonly Resource[];

/** Cards of each resource held by the bank at the start of a game (SPEC.md §4.1). */
export const BANK_RESOURCE_COUNT = 19;

export const MIN_PLAYERS = 3;
export const MAX_PLAYERS = 4;

/** Axial radius of the board: 19 hexes (SPEC.md §5.1). */
export const BOARD_RADIUS = 2;
export const HEX_COUNT = 19;
export const VERTEX_COUNT = 54;
export const EDGE_COUNT = 72;
export const PORT_COUNT = 9;

/** Which terrain each resource comes from. The desert produces nothing. */
export const TERRAIN_RESOURCE = {
  forest: 'wood',
  hills: 'brick',
  pasture: 'sheep',
  fields: 'wheat',
  mountains: 'ore',
  desert: null,
} as const satisfies Record<Terrain, Resource | null>;

/** How many hexes of each terrain go on the board (SPEC.md §4.1). */
export const TERRAIN_COUNTS = {
  forest: 4,
  hills: 3,
  pasture: 4,
  fields: 4,
  mountains: 3,
  desert: 1,
} as const satisfies Record<Terrain, number>;

/** The 18 number tokens, one per non-desert hex (SPEC.md §4.1). */
export const NUMBER_TOKENS = [2, 3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 11, 12] as const;

/** Numbers that may not sit on adjacent hexes (SPEC.md §4.1). */
export const HOT_NUMBERS = [6, 8] as const;

/** The 9 harbours: 4 generic and one 2:1 per resource (SPEC.md §4.1). */
export const PORT_TYPES = [
  '3:1',
  '3:1',
  '3:1',
  '3:1',
  'wood',
  'brick',
  'sheep',
  'wheat',
  'ore',
] as const;

/** Pieces each player starts with (SPEC.md §4.2). */
export const PIECE_STOCK = {
  roads: 15,
  settlements: 5,
  cities: 4,
} as const;

/** Build costs (SPEC.md §4.3). */
export const COSTS = {
  road: { wood: 1, brick: 1, sheep: 0, wheat: 0, ore: 0 },
  settlement: { wood: 1, brick: 1, sheep: 1, wheat: 1, ore: 0 },
  city: { wood: 0, brick: 0, sheep: 0, wheat: 2, ore: 3 },
  devCard: { wood: 0, brick: 0, sheep: 1, wheat: 1, ore: 1 },
} as const satisfies Record<string, ResourceBundle>;

/** Composition of the 25-card development deck (SPEC.md §4.10). */
export const DEV_DECK_COMPOSITION = {
  knight: 14,
  vp: 5,
  roadBuilding: 2,
  yearOfPlenty: 2,
  monopoly: 2,
} as const satisfies Record<DevCard, number>;

export const DEV_DECK_SIZE = 25;

/** The card types, in a fixed order for anything that iterates them. */
export const DEV_CARDS = [
  'knight',
  'vp',
  'roadBuilding',
  'yearOfPlenty',
  'monopoly',
] as const satisfies readonly DevCard[];

/** Victory points awarded by each source (SPEC.md §4.12). */
export const VICTORY_POINTS = {
  settlement: 1,
  city: 2,
  vpCard: 1,
  largestArmy: 2,
  longestRoad: 2,
} as const;

export const VICTORY_POINTS_TO_WIN = 10;

/** Knights needed to first claim Largest Army (SPEC.md §4.11). */
export const LARGEST_ARMY_MIN_KNIGHTS = 3;

/** Road segments needed to first claim Longest Road (SPEC.md §4.11, §12.2). */
export const LONGEST_ROAD_MIN_LENGTH = 5;

/** Holding more than this many cards on a 7 forces a discard (SPEC.md §4.8). */
export const DISCARD_THRESHOLD = 7;

/** Open offers the active player may have at once; counteroffers do not count (SPEC.md §12.6). */
export const MAX_OPEN_OFFERS = 3;

/** Maritime trade rates (SPEC.md §4.9). */
export const BANK_TRADE_RATE = 4;
export const GENERIC_PORT_RATE = 3;
export const SPECIFIC_PORT_RATE = 2;

/** A fresh zeroed bundle. A function, not a shared constant, so callers cannot alias it. */
export const emptyBundle = (): ResourceBundle => ({
  wood: 0,
  brick: 0,
  sheep: 0,
  wheat: 0,
  ore: 0,
});

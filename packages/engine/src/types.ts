/**
 * Types shared by the engine, the server and the web client: the board domain,
 * the game state (SPEC.md §5.2) and the action union (SPEC.md §5.3).
 */

import type { RngState } from './rng.js';

export type Resource = 'wood' | 'brick' | 'sheep' | 'wheat' | 'ore';

/** A count for every resource. Always total, never partial, so arithmetic is safe. */
export type ResourceBundle = Record<Resource, number>;

export type Terrain = 'forest' | 'hills' | 'pasture' | 'fields' | 'mountains' | 'desert';

/** A generic 3:1 harbour, or a 2:1 harbour for one specific resource. */
export type PortType = '3:1' | Resource;

export type DevCard = 'knight' | 'vp' | 'roadBuilding' | 'yearOfPlenty' | 'monopoly';

export type PlayerColor = 'celeste' | 'bordo' | 'verde' | 'amarillo';

/**
 * Board element ids. The literal shapes double as documentation of the id
 * format produced by the board generator (SPEC.md §5.1).
 */
export type HexId = `h${number}`;
export type VertexId = `v${number}`;
export type EdgeId = `e${number}`;

/** Opaque id handed out by the server when a player takes a seat. */
export type PlayerId = string;

/**
 * Every rejected action carries one of these instead of throwing.
 * The union grows as milestones add actions; the client maps codes to copy.
 */
export type ErrorCode =
  | 'NOT_YOUR_TURN'
  | 'WRONG_PHASE'
  | 'INSUFFICIENT_RESOURCES'
  | 'DISTANCE_RULE'
  | 'NOT_CONNECTED'
  | 'STALE_STATE'
  /** The piece stock for that building type is empty (SPEC.md §4.2). */
  | 'NOT_ENOUGH_PIECES'
  /** A building or road is already on that vertex or edge. */
  | 'OCCUPIED'
  /** Upgrading a vertex that holds no settlement. */
  | 'NO_SETTLEMENT'
  /** The piece on that spot belongs to somebody else. */
  | 'NOT_OWNER'
  /** Upgrading a vertex that already holds a city. */
  | 'ALREADY_CITY'
  /** An id that is not on the board, or a player that is not in the game. */
  | 'INVALID_TARGET'
  /** The game is already decided; no further actions apply. */
  | 'GAME_OVER'
  /** The action exists in the union but its milestone has not landed yet. */
  | 'NOT_IMPLEMENTED';

/**
 * Recursively readonly. The engine hands state out as `DeepReadonly<GameState>`
 * so no consumer can mutate a state it was given; inside the reducer the draft
 * is a plain mutable GameState (SPEC.md §6).
 */
export type DeepReadonly<T> = T extends object
  ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
  : T;

/** Result of any engine operation that can legally fail. */
export type Result<T> = { ok: true; value: T } | { ok: false; error: ErrorCode };

export const ok = <T>(value: T): Result<T> => ({ ok: true, value });

export const err = <T>(error: ErrorCode): Result<T> => ({ ok: false, error });

/** A position in unit space (hex circumradius = 1). y grows downward, as in SVG. */
export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface Hex {
  readonly id: HexId;
  readonly q: number;
  readonly r: number;
  readonly center: Point;
  readonly terrain: Terrain;
  /** Absent on the desert, which produces nothing. */
  readonly number?: number;
  /** The 6 corners in drawing order. */
  readonly corners: readonly VertexId[];
  /** The 6 sides, where side i joins corners i and i+1. */
  readonly edges: readonly EdgeId[];
}

export interface Vertex {
  readonly id: VertexId;
  readonly x: number;
  readonly y: number;
  readonly hexes: readonly HexId[];
  readonly edges: readonly EdgeId[];
  readonly neighbors: readonly VertexId[];
  /** Set on both endpoints of a port edge: this is what the trade rules read. */
  readonly port?: PortType;
}

export interface Edge {
  readonly id: EdgeId;
  readonly vertices: readonly [VertexId, VertexId];
  readonly hexes: readonly HexId[];
}

/** A harbour, kept edge-first so the renderer knows where to draw the dock. */
export interface Port {
  readonly edge: EdgeId;
  readonly type: PortType;
  readonly vertices: readonly [VertexId, VertexId];
}

/**
 * The board as generated: topology plus terrain, numbers and ports.
 * Immutable for the whole game. The robber lives in GameState.robberHex,
 * not here (SPEC.md §5.2).
 */
export interface BoardGraph {
  readonly hexes: Readonly<Record<HexId, Hex>>;
  readonly vertices: Readonly<Record<VertexId, Vertex>>;
  readonly edges: Readonly<Record<EdgeId, Edge>>;
  readonly ports: readonly Port[];
  /** Ids in canonical order, so callers can iterate deterministically. */
  readonly hexIds: readonly HexId[];
  readonly vertexIds: readonly VertexId[];
  readonly edgeIds: readonly EdgeId[];
}

/* ------------------------------------------------------------------ *
 * Game state (SPEC.md §5.2)
 *
 * These interfaces are deliberately mutable. `applyAction` structuredClones
 * the state it receives and mutates the clone, so the caller's state is never
 * touched; the tests deep-freeze their input to prove it. Making the whole
 * tree readonly would only push casts into every handler.
 *
 * The board is the exception: it is generated once and shared by reference
 * across every state, so it stays deeply readonly.
 * ------------------------------------------------------------------ */

/** A seat as handed to `createGame`, before the turn order is drawn. */
export interface PlayerSeat {
  readonly id: PlayerId;
  readonly name: string;
  readonly color: PlayerColor;
}

export interface Player {
  readonly id: PlayerId;
  readonly name: string;
  readonly color: PlayerColor;
  resources: ResourceBundle;
  /** In hand. Hidden from other players by view.ts (M6). */
  devCards: DevCard[];
  /** Bought this turn, so they cannot be played yet (SPEC.md §4.10). */
  devCardsBoughtThisTurn: DevCard[];
  knightsPlayed: number;
  stock: { roads: number; settlements: number; cities: number };
  connected: boolean;
}

export interface Building {
  owner: PlayerId;
  type: 'settlement' | 'city';
}

export type Phase =
  | { readonly kind: 'lobby' }
  | {
      readonly kind: 'setup';
      readonly round: 1 | 2;
      readonly step: 'settlement' | 'road';
      /** The settlement just placed: the setup road must start from it (SPEC.md §4.5). */
      readonly lastSettlement?: VertexId;
    }
  | { readonly kind: 'preRoll' }
  | { readonly kind: 'discard'; readonly pending: Readonly<Record<PlayerId, number>> }
  | {
      readonly kind: 'moveRobber';
      readonly source: 'seven' | 'knight';
      readonly returnTo: 'preRoll' | 'main';
    }
  | {
      readonly kind: 'steal';
      readonly candidates: readonly PlayerId[];
      readonly returnTo: 'preRoll' | 'main';
    }
  | { readonly kind: 'main' }
  | { readonly kind: 'roadBuilding'; readonly remaining: 1 | 2 }
  | { readonly kind: 'gameOver'; readonly winner: PlayerId };

export interface TradeOffer {
  readonly id: string;
  /** Who proposed it. */
  readonly from: PlayerId;
  readonly give: Partial<ResourceBundle>;
  readonly want: Partial<ResourceBundle>;
  readonly to: readonly PlayerId[];
  responses: Record<PlayerId, 'pending' | 'accepted' | 'rejected'>;
  /** Set when this offer is a counteroffer (SPEC.md §12.6). */
  readonly parentOfferId?: string;
}

/**
 * The whole game. Reconstructible from `seed` plus the list of applied actions,
 * which is why there is no log in here: `applyAction` returns its events and the
 * consumer accumulates them (SPEC.md §5.2, §6).
 */
export interface GameState {
  /** Incremented on every applied action. The client sends it back as `expectedVersion`. */
  version: number;
  readonly seed: number;
  rngState: RngState;
  readonly board: BoardGraph;
  robberHex: HexId;
  buildings: Record<VertexId, Building>;
  roads: Record<EdgeId, PlayerId>;
  players: Player[];
  /** Drawn once at `createGame`; setup round 2 walks it backwards. */
  readonly turnOrder: readonly PlayerId[];
  currentPlayer: PlayerId;
  phase: Phase;
  lastRoll?: [number, number];
  bank: ResourceBundle;
  devDeck: DevCard[];
  devCardPlayedThisTurn: boolean;
  tradeOffers: TradeOffer[];
  largestArmy?: PlayerId;
  longestRoad?: { owner: PlayerId; length: number };
}

/* ------------------------------------------------------------------ *
 * Actions (SPEC.md §5.3)
 *
 * The union is complete from M2 on, even though M2 only implements setup,
 * dice, production, building and end of turn. Everything else is rejected by
 * validate.ts until its milestone lands.
 * ------------------------------------------------------------------ */

export type Action =
  | { readonly type: 'placeSettlement'; readonly vertex: VertexId }
  | { readonly type: 'placeRoad'; readonly edge: EdgeId }
  | { readonly type: 'upgradeCity'; readonly vertex: VertexId }
  | { readonly type: 'rollDice' }
  | { readonly type: 'discard'; readonly cards: Partial<ResourceBundle> }
  | { readonly type: 'moveRobber'; readonly hex: HexId }
  | { readonly type: 'steal'; readonly target: PlayerId }
  | { readonly type: 'buyDevCard' }
  | { readonly type: 'playKnight' }
  | { readonly type: 'playRoadBuilding' }
  | { readonly type: 'playYearOfPlenty'; readonly resources: readonly [Resource, Resource] }
  | { readonly type: 'playMonopoly'; readonly resource: Resource }
  | { readonly type: 'maritimeTrade'; readonly give: Resource; readonly want: Resource }
  | {
      readonly type: 'createOffer';
      readonly give: Partial<ResourceBundle>;
      readonly want: Partial<ResourceBundle>;
      readonly to: readonly PlayerId[] | 'all';
    }
  | {
      readonly type: 'respondOffer';
      readonly offerId: string;
      readonly response: 'accept' | 'reject';
    }
  | {
      readonly type: 'counterOffer';
      readonly offerId: string;
      readonly give: Partial<ResourceBundle>;
      readonly want: Partial<ResourceBundle>;
    }
  | { readonly type: 'confirmTrade'; readonly offerId: string; readonly withPlayer: PlayerId }
  | { readonly type: 'cancelOffer'; readonly offerId: string }
  | { readonly type: 'endTurn' };

export type ActionType = Action['type'];

/** A game state as handed to the outside world: nothing in it can be mutated. */
export type ReadonlyGameState = DeepReadonly<GameState>;

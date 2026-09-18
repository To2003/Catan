/**
 * Base domain types shared by the engine, the server and the web client.
 * Rule-specific state (GameState, Action, Phase...) lands in later milestones.
 */

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
  | 'STALE_STATE';

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

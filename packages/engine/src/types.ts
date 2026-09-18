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

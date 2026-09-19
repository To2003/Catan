import type {
  ErrorCode,
  GameEvent,
  PlayerColor,
  PlayerId,
  PlayerView,
} from '@tierra-austral/engine';

/**
 * The wire protocol (SPEC.md §7.2).
 *
 * Transport failures are their own union: they are a different layer from the
 * engine's ErrorCode and must not be confused with a rule saying no.
 */
export type TransportError =
  | 'BAD_PAYLOAD'
  | 'RATE_LIMITED'
  | 'NO_SESSION'
  | 'ROOM_NOT_FOUND'
  | 'ROOM_FULL'
  | 'NOT_HOST'
  | 'NOT_ENOUGH_PLAYERS'
  | 'NOT_READY'
  | 'COLOR_TAKEN'
  | 'GAME_IN_PROGRESS'
  | 'GAME_NOT_STARTED'
  | 'NOTHING_TO_FORCE'
  | 'GAME_NOT_OVER'
  | 'TOO_SOON';

export type ErrorPayload = { readonly code: ErrorCode | TransportError; readonly message: string };

/** A seat as everybody in the room may see it. Never carries the token. */
export interface PublicSeat {
  readonly playerId: PlayerId;
  readonly name: string;
  readonly color?: PlayerColor;
  readonly ready: boolean;
  readonly connected: boolean;
}

export interface RoomState {
  readonly code: string;
  readonly seats: readonly PublicSeat[];
  readonly hostId: PlayerId;
  readonly started: boolean;
  /** Who the room is waiting on, and since when, for the force-turn button. */
  readonly blockedBy?: { readonly playerId: PlayerId; readonly since: number };
}

/**
 * Inbound events. Payloads are `unknown` on purpose: the only thing that may
 * narrow them is the schema, at the edge.
 */
export interface ClientToServer {
  'room:create': (payload: unknown) => void;
  'room:join': (payload: unknown) => void;
  'room:setColor': (payload: unknown) => void;
  'room:ready': (payload: unknown) => void;
  'room:start': () => void;
  'room:forceTurn': () => void;
  'room:rematch': () => void;
  'game:action': (payload: unknown) => void;
  'chat:send': (payload: unknown) => void;
}

/** What the server remembers about a socket: the whole of a player's identity. */
export interface SocketData {
  code?: string;
  playerId?: PlayerId;
}

export interface ServerToClient {
  session: (payload: { playerId: PlayerId; token: string; code: string }) => void;
  'session:replaced': () => void;
  'room:state': (state: RoomState) => void;
  'game:state': (view: PlayerView) => void;
  'game:events': (events: readonly GameEvent[]) => void;
  'game:error': (error: ErrorPayload) => void;
  'chat:message': (message: { from: PlayerId; text: string; at: number }) => void;
}

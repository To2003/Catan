import type {
  BoardMode,
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
  | 'VOTE_OPEN'
  | 'NO_VOTE'
  | 'ALREADY_VOTED'
  | 'ON_COOLDOWN'
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

/** A vote to start over, as everybody in the room sees it. */
export interface RestartVoteState {
  readonly by: PlayerId;
  readonly deadline: number;
  readonly votes: Readonly<Record<PlayerId, 'yes' | 'no'>>;
  /** Who still has to answer: the players who are actually here. */
  readonly needed: readonly PlayerId[];
}

export interface RoomState {
  readonly code: string;
  readonly seats: readonly PublicSeat[];
  readonly hostId: PlayerId;
  readonly started: boolean;
  /** Who the room is waiting on, and since when, for the force-turn button. */
  readonly blockedBy?: { readonly playerId: PlayerId; readonly since: number };
  /** The board the lobby is showing; the client draws it from the seed. */
  readonly previewSeed: number;
  /** How the lobby's board is laid out; the host picks it before starting. */
  readonly boardMode: BoardMode;
  /** Games won per player, across every game this room has played. */
  readonly wins: Readonly<Record<PlayerId, number>>;
  readonly gamesPlayed: number;
  readonly restartVote?: RestartVoteState;
  /** When each player may proponer otra vez a restart again, after one was refused. */
  readonly restartCooldown: Readonly<Record<PlayerId, number>>;
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
  /** Lobby only, host only: draw a different board before starting. */
  'room:newBoard': () => void;
  /** Lobby only, host only: pick how the board is laid out. */
  'room:setBoardMode': (payload: unknown) => void;
  'room:proposeRestart': () => void;
  'room:voteRestart': (payload: unknown) => void;
  'game:action': (payload: unknown) => void;
  'chat:send': (payload: unknown) => void;
}

/**
 * A line in a room's conversation.
 *
 * The chat belongs to the room, not to the game: it survives a start, a
 * restart, a rematch and a reconnection, because the people talking are the
 * same people. `from` is resolved by the server from the socket's session and
 * never read off the payload.
 *
 * System lines carry no author and arrive with their wording already decided,
 * so what is stored is what is shown. Everything renders as plain text.
 */
export interface ChatMessage {
  /** Monotonic within a room: the order to show them in, and a stable key. */
  readonly id: number;
  readonly at: number;
  readonly kind: 'player' | 'system';
  readonly from?: PlayerId;
  readonly text: string;
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
  'chat:message': (message: ChatMessage) => void;
  /** The whole conversation, on joining or coming back. */
  'chat:history': (messages: readonly ChatMessage[]) => void;
}

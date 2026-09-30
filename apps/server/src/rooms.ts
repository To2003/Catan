import { randomInt, randomUUID } from 'node:crypto';
import {
  MAX_PLAYERS,
  MIN_PLAYERS,
  applyAction,
  createGame,
  type Action,
  type PlayerColor,
  type PlayerId,
  type BoardMode,
  type ReadonlyGameState,
} from '@tierra-austral/engine';
import type { ChatMessage, PublicSeat, RoomState, SeatState } from './protocol.js';
import { memoryStore, type Store } from './persistence.js';

/**
 * Rooms, in memory.
 *
 * A room keeps `seed` plus the list of applied actions, which is the whole of
 * what M8 has to persist: replaying them rebuilds the state exactly.
 *
 * Room codes and game seeds come from `node:crypto`, never from the engine's
 * PRNG. That one is the game's, it is deterministic on purpose, and a
 * predictable room code would let anyone walk into a private game.
 */

/** No I, O, 0 or 1: codes get read out loud over a call. */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 5;

export interface Seat {
  readonly playerId: PlayerId;
  name: string;
  color?: PlayerColor;
  ready: boolean;
  connected: boolean;
  /** Secret. Never leaves the server except to its own socket, once. */
  readonly token: string;
  /** When this player became both disconnected and in the way (SPEC.md §7.1). */
  blockingSince?: number;
  /**
   * Which number arrival this was, counting from 1 and never reused.
   *
   * The host passes down this order, not down the seat list. They are
   * different things: somebody leaves, the list closes up, and the seat that
   * is now second was never the second to arrive.
   */
  readonly joined: number;
  /** Set only when it is final. Absent means the seat is still somebody's. */
  gone?: 'left' | 'kicked';
}

export const seatState = (seat: Seat): SeatState =>
  seat.gone ?? (seat.connected ? 'active' : 'disconnected');

/** Seats that are still somebody's, oldest arrival first. */
export const presentSeats = (room: Room): Seat[] =>
  room.seats.filter((seat) => seat.gone === undefined).sort((a, b) => a.joined - b.joined);

/** A vote to start over, while a game is in progress (SPEC.md §7.1). */
export interface RestartVote {
  readonly by: PlayerId;
  readonly startedAt: number;
  readonly deadline: number;
  votes: Record<PlayerId, 'yes' | 'no'>;
}

export interface Room {
  readonly code: string;
  seats: Seat[];
  hostId: PlayerId;
  started: boolean;
  /** Set when the game starts. */
  seed?: number;
  state?: ReadonlyGameState;
  readonly actions: { playerId: PlayerId; action: Action }[];
  readonly createdAt: number;
  lastActivity: number;
  /**
   * The board the lobby is showing. It becomes the game's seed on start, so
   * what everybody looked at is what they play.
   */
  previewSeed: number;
  /**
   * How the board is laid out, for this room's games. Chosen by the host in
   * the lobby and kept across a restart and a rematch, because it is the
   * table's choice rather than one game's.
   */
  boardMode: BoardMode;
  /** Finished games, oldest first. A room outlives its games. */
  games: {
    seed: number;
    actions: { playerId: PlayerId; action: Action }[];
    winner?: PlayerId;
    endedAt: number;
  }[];
  wins: Record<PlayerId, number>;
  restartVote?: RestartVote;
  /** When each player may propose a restart again, after one was turned down. */
  restartCooldown: Record<PlayerId, number>;
  /**
   * Tokens that may not come back: the ones the host threw out, and the ones
   * whose owners walked out for good.
   *
   * Kept as tokens rather than as player ids because a token is what a
   * reconnection presents. It is a short list — at most four — and it goes
   * away with the room.
   */
  blockedTokens: string[];
  /** The next arrival number to hand out. Never goes down. */
  nextJoined: number;
  /**
   * The conversation. It belongs to the room, so a start, a restart, a
   * rematch and a reconnection all leave it alone; only the room's own 24h
   * cleanup takes it away.
   */
  chat: ChatMessage[];
  /** Next id to hand out. Kept past the trim so ids never repeat. */
  nextChatId: number;
}

/**
 * How much of the conversation a room keeps.
 *
 * Enough that nobody scrolling back loses the trade they were arguing about,
 * and little enough that a room is still cheap to hold and to send on a join.
 */
export const CHAT_HISTORY = 200;

/** Adds a line and drops the oldest once the room is over its limit. */
export const pushChat = (
  room: Room,
  message: Omit<ChatMessage, 'id' | 'at'> & { at?: number },
): ChatMessage => {
  const stored: ChatMessage = {
    id: room.nextChatId,
    at: message.at ?? Date.now(),
    kind: message.kind,
    ...(message.from === undefined ? {} : { from: message.from }),
    text: message.text,
  };
  room.nextChatId += 1;
  room.chat.push(stored);

  const overflow = room.chat.length - CHAT_HISTORY;
  if (overflow > 0) room.chat.splice(0, overflow);

  store.appendChat(room.code, stored, room.chat[0]?.id ?? stored.id);
  return stored;
};

const rooms = new Map<string, Room>();

/** Where rooms are written down. Swapped for SQLite at boot (SPEC.md §7.1). */
let store: Store = memoryStore();

export const useStore = (next: Store): void => {
  store = next;
};

export const persistRoom = (room: Room): void => {
  store.saveRoom({
    code: room.code,
    seed: room.seed,
    hostId: room.hostId,
    started: room.started,
    createdAt: room.createdAt,
    lastActivity: room.lastActivity,
    previewSeed: room.previewSeed,
    boardMode: room.boardMode,
    wins: room.wins,
    blockedTokens: room.blockedTokens,
    seats: room.seats.map((seat) => ({
      playerId: seat.playerId,
      name: seat.name,
      ...(seat.color === undefined ? {} : { color: seat.color }),
      ready: seat.ready,
      token: seat.token,
      joined: seat.joined,
      ...(seat.gone === undefined ? {} : { gone: seat.gone }),
    })),
  });
};

/** Records an applied action, in the order it was applied. */
export const persistAction = (
  room: Room,
  index: number,
  playerId: PlayerId,
  action: Action,
): void => {
  store.appendAction(room.code, index, playerId, action);
  persistRoom(room);
};

/**
 * Brings back every room from the database, replaying its actions.
 *
 * A game is `seed + actions`, so this is a replay and nothing else: no stored
 * state can disagree with the rules as they are today.
 */
export const restoreRooms = (): { restored: number; failed: string[] } => {
  const failed: string[] = [];
  let restored = 0;

  for (const stored of store.loadRooms()) {
    const room: Room = {
      code: stored.code,
      previewSeed: stored.previewSeed,
      boardMode: stored.boardMode,
      games: stored.games.map((game) => ({ ...game })),
      wins: { ...stored.wins },
      restartCooldown: {},
      chat: [...stored.chat],
      nextChatId: (stored.chat[stored.chat.length - 1]?.id ?? 0) + 1,
      blockedTokens: [...stored.blockedTokens],
      nextJoined:
        stored.seats.reduce((top, seat, index) => Math.max(top, seat.joined ?? index + 1), 0) + 1,
      seats: stored.seats.map((seat, index) => ({
        playerId: seat.playerId,
        name: seat.name,
        ...(seat.color === undefined ? {} : { color: seat.color }),
        ready: seat.ready,
        // Nobody is connected right after a restart; they come back with their
        // tokens.
        connected: false,
        token: seat.token,
        // A room saved before arrival order existed: the order it was stored
        // in is the best evidence there is, and it is the right one for every
        // room nobody had left yet.
        joined: seat.joined ?? index + 1,
        ...(seat.gone === undefined ? {} : { gone: seat.gone }),
      })),
      hostId: stored.hostId,
      started: stored.started,
      ...(stored.seed === undefined ? {} : { seed: stored.seed }),
      actions: [],
      createdAt: stored.createdAt,
      lastActivity: stored.lastActivity,
    };

    if (stored.started && stored.seed !== undefined) {
      let state = createGame(
        stored.seed,
        room.seats.map((seat) => ({
          id: seat.playerId,
          name: seat.name,
          color: seat.color as PlayerColor,
        })),
        stored.boardMode,
      );

      let broken = false;
      for (const entry of stored.actions) {
        const result = applyAction(state, entry.playerId, entry.action);
        if (!result.ok) {
          broken = true;
          break;
        }
        state = result.state;
        room.actions.push(entry);
      }

      if (broken) {
        failed.push(stored.code);
        continue;
      }
      room.state = state;
    }

    rooms.set(room.code, room);
    restored += 1;
  }

  return { restored, failed };
};

/** Drops rooms nobody has touched for a day, in memory and on disk (SPEC.md §7.1). */
export const sweepIdleRooms = (maxIdleMs: number, now = Date.now()): string[] => {
  const cutoff = now - maxIdleMs;
  const dropped: string[] = [];

  for (const [code, room] of rooms) {
    if (room.lastActivity < cutoff) {
      rooms.delete(code);
      dropped.push(code);
    }
  }
  for (const code of store.deleteIdleRooms(cutoff)) {
    if (!dropped.includes(code)) dropped.push(code);
  }
  return dropped;
};

const newCode = (): string => {
  for (let attempt = 0; attempt < 1000; attempt += 1) {
    let code = '';
    for (let i = 0; i < CODE_LENGTH; i += 1) {
      code += CODE_ALPHABET.charAt(randomInt(CODE_ALPHABET.length));
    }
    if (!rooms.has(code)) return code;
  }
  throw new Error('could not find a free room code');
};

export const createRoom = (hostName: string): { room: Room; seat: Seat } => {
  const code = newCode();
  const seat = newSeat(hostName, 1);
  const room: Room = {
    code,
    seats: [seat],
    hostId: seat.playerId,
    started: false,
    actions: [],
    createdAt: Date.now(),
    lastActivity: Date.now(),
    previewSeed: randomInt(0, 0xffffffff),
    boardMode: 'random',
    games: [],
    wins: {},
    restartCooldown: {},
    chat: [],
    nextChatId: 1,
    blockedTokens: [],
    nextJoined: 2,
  };
  rooms.set(code, room);
  return { room, seat };
};

export const newSeat = (name: string, joined: number): Seat => ({
  playerId: randomUUID(),
  name,
  ready: false,
  connected: true,
  token: randomUUID(),
  joined,
});

/** Seats somebody, handing out the next arrival number. */
export const seatSomebody = (room: Room, name: string): Seat => {
  const seat = newSeat(name, room.nextJoined);
  room.nextJoined += 1;
  room.seats.push(seat);
  room.lastActivity = Date.now();
  return seat;
};

export const getRoom = (code: string): Room | undefined => rooms.get(code);

/** Puts a room straight into the registry. Only the dev fixture needs this. */
export const putRoom = (room: Room): void => {
  rooms.set(room.code, room);
};

export const seatOf = (room: Room, playerId: PlayerId): Seat | undefined =>
  room.seats.find((seat) => seat.playerId === playerId);

export const seatByToken = (room: Room, token: string): Seat | undefined =>
  room.seats.find((seat) => seat.token === token);

export const roomIsFull = (room: Room): boolean => presentSeats(room).length >= MAX_PLAYERS;

export const canStart = (room: Room): boolean =>
  !room.started &&
  presentSeats(room).length >= MIN_PLAYERS &&
  presentSeats(room).every((seat) => seat.ready && seat.color !== undefined);

/** A fresh board for the lobby to look at. Only the host may ask for one. */
export const rerollPreview = (room: Room): void => {
  room.previewSeed = randomInt(0, 0xffffffff);
  room.lastActivity = Date.now();
};

/**
 * Starts the game on the board the lobby was showing.
 *
 * The seed comes from crypto, not from anything guessable, and it is the one
 * everybody has been looking at: pressing start should not change the board.
 */
export const startGame = (room: Room): ReadonlyGameState => {
  const seed = room.previewSeed;
  const state = createGame(
    seed,
    presentSeats(room).map((seat) => ({
      id: seat.playerId,
      name: seat.name,
      // Colours are required to start, so this cast only covers the impossible.
      color: seat.color as PlayerColor,
    })),
    room.boardMode,
  );
  room.seed = seed;
  room.started = true;
  room.state = state;
  return state;
};

/**
 * Ends the running game without a winner and puts the room back in the lobby.
 *
 * Used when there is nobody left to play against. The game is archived like
 * any other — it happened, and its actions replay — but with no winner, so
 * the room's scoreboard does not move.
 */
export const abandonGame = (room: Room): void => {
  if (room.seed !== undefined && room.actions.length > 0) {
    const archived = { seed: room.seed, actions: [...room.actions], endedAt: Date.now() };
    room.games.push(archived);
    store.archiveGame(room.code, room.games.length - 1, archived);
  }

  room.actions.length = 0;
  room.started = false;
  delete room.state;
  delete room.seed;
  delete room.restartVote;
  room.seats = room.seats.filter((seat) => seat.gone === undefined);
  for (const seat of room.seats) {
    delete seat.blockingSince;
    seat.ready = false;
  }
  rerollPreview(room);
  store.clearActions(room.code);
  persistRoom(room);
};

/**
 * A new game in the same room: same seats, same colours, a new board.
 *
 * The one that was being played is **archived, not overwritten**. A room is
 * seed + actions per game, so writing a restart into the running list would
 * make the replay produce something that never happened. Used by both the
 * rematch after a win and the voted restart mid-game.
 */
export const restartGame = (room: Room): ReadonlyGameState => {
  if (room.seed !== undefined && room.actions.length > 0) {
    const winner = room.state?.phase.kind === 'gameOver' ? room.state.phase.winner : undefined;
    const archived = {
      seed: room.seed,
      actions: [...room.actions],
      ...(winner === undefined ? {} : { winner }),
      endedAt: Date.now(),
    };
    room.games.push(archived);
    store.archiveGame(room.code, room.games.length - 1, archived);
  }

  room.actions.length = 0;
  room.started = false;
  delete room.restartVote;
  // Whoever walked out or was thrown out does not come back for the next one.
  // Their token stays blocked, so the empty chair is a real empty chair.
  room.seats = room.seats.filter((seat) => seat.gone === undefined);
  for (const seat of room.seats) delete seat.blockingSince;

  rerollPreview(room);
  const state = startGame(room);
  // Only the finished game's move rows go: the archive of it, and the room
  // itself, stay. Deleting the whole room here would have thrown away the
  // history this method just wrote.
  store.clearActions(room.code);
  persistRoom(room);
  return state;
};

/** Counts a win for the scoreboard the room keeps across games. */
export const recordWin = (room: Room, playerId: PlayerId): void => {
  room.wins[playerId] = (room.wins[playerId] ?? 0) + 1;
};

/** Hands the host role to the next connected seat. */
/**
 * Hands the room to whoever should have it.
 *
 * Down the order people arrived in, not down the seat list. They stop being
 * the same thing the moment somebody leaves: the list closes up, and the seat
 * that is now second was never the second to arrive. Among the ones still in
 * the room, somebody connected comes before somebody who is merely away.
 */
export const migrateHost = (room: Room): void => {
  const host = seatOf(room, room.hostId);
  if (host !== undefined && host.gone === undefined && host.connected) return;

  const byArrival = presentSeats(room);
  const next = byArrival.find((seat) => seat.connected) ?? byArrival[0];
  if (next) room.hostId = next.playerId;
};

/** Marks a seat as gone for good and spends its token. */
export const retireSeat = (room: Room, playerId: PlayerId, how: 'left' | 'kicked'): void => {
  const seat = seatOf(room, playerId);
  if (!seat || seat.gone !== undefined) return;
  seat.gone = how;
  seat.connected = false;
  seat.ready = false;
  delete seat.blockingSince;
  if (!room.blockedTokens.includes(seat.token)) room.blockedTokens.push(seat.token);
  room.lastActivity = Date.now();
};

/** Whether the room has anybody left in it at all. */
export const roomIsEmpty = (room: Room): boolean => presentSeats(room).length === 0;

export const publicSeat = (seat: Seat): PublicSeat => ({
  playerId: seat.playerId,
  name: seat.name,
  ...(seat.color === undefined ? {} : { color: seat.color }),
  ready: seat.ready,
  connected: seat.connected,
  state: seatState(seat),
});

export const roomState = (room: Room): RoomState => {
  const blocked = room.seats.find((seat) => seat.blockingSince !== undefined);
  return {
    code: room.code,
    seats: room.seats.map(publicSeat),
    hostId: room.hostId,
    started: room.started,
    previewSeed: room.previewSeed,
    boardMode: room.boardMode,
    wins: { ...room.wins },
    gamesPlayed: room.games.length,
    restartCooldown: { ...room.restartCooldown },
    ...(room.restartVote === undefined
      ? {}
      : {
          restartVote: {
            by: room.restartVote.by,
            deadline: room.restartVote.deadline,
            votes: { ...room.restartVote.votes },
            // Only people who are here can hold up a restart.
            needed: room.seats.filter((seat) => seat.connected).map((seat) => seat.playerId),
          },
        }),
    ...(blocked?.blockingSince === undefined
      ? {}
      : { blockedBy: { playerId: blocked.playerId, since: blocked.blockingSince } }),
  };
};

/**
 * Takes somebody out of a room they have not started playing in.
 *
 * Only before the game starts. Once it has, the seats are baked into the
 * state — a game is `seed + actions` over a fixed list of players — so
 * leaving a game in progress means going away, not vacating the chair.
 *
 * Returns whether the room is now empty, which is the caller's cue to throw
 * it away rather than leave a room nobody is in holding a code.
 */
export const removeSeat = (room: Room, playerId: PlayerId): { empty: boolean } => {
  room.seats = room.seats.filter((seat) => seat.playerId !== playerId);
  room.lastActivity = Date.now();
  if (room.seats.length === 0) return { empty: true };

  // The host walking out hands the room to whoever arrived next.
  if (room.hostId === playerId) migrateHost(room);
  // A vote nobody can finish, because one of the voters is gone.
  if (room.restartVote?.by === playerId) delete room.restartVote;

  return { empty: false };
};

export const dropRoom = (code: string): void => {
  rooms.delete(code);
  store.deleteRoom(code);
};

/** Only for tests: forget everything between runs. */
export const resetRooms = (): void => {
  rooms.clear();
  store = memoryStore();
};

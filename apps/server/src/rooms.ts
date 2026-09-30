import { randomInt, randomUUID } from 'node:crypto';
import {
  MAX_PLAYERS,
  MIN_PLAYERS,
  applyAction,
  createGame,
  type Action,
  type PlayerColor,
  type PlayerId,
  type ReadonlyGameState,
} from '@tierra-austral/engine';
import type { ChatMessage, PublicSeat, RoomState } from './protocol.js';
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
}

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
    wins: room.wins,
    seats: room.seats.map((seat) => ({
      playerId: seat.playerId,
      name: seat.name,
      ...(seat.color === undefined ? {} : { color: seat.color }),
      ready: seat.ready,
      token: seat.token,
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
      games: stored.games.map((game) => ({ ...game })),
      wins: { ...stored.wins },
      restartCooldown: {},
      chat: [...stored.chat],
      nextChatId: (stored.chat[stored.chat.length - 1]?.id ?? 0) + 1,
      seats: stored.seats.map((seat) => ({
        playerId: seat.playerId,
        name: seat.name,
        ...(seat.color === undefined ? {} : { color: seat.color }),
        ready: seat.ready,
        // Nobody is connected right after a restart; they come back with their
        // tokens.
        connected: false,
        token: seat.token,
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
  const seat = newSeat(hostName);
  const room: Room = {
    code,
    seats: [seat],
    hostId: seat.playerId,
    started: false,
    actions: [],
    createdAt: Date.now(),
    lastActivity: Date.now(),
    previewSeed: randomInt(0, 0xffffffff),
    games: [],
    wins: {},
    restartCooldown: {},
    chat: [],
    nextChatId: 1,
  };
  rooms.set(code, room);
  return { room, seat };
};

export const newSeat = (name: string): Seat => ({
  playerId: randomUUID(),
  name,
  ready: false,
  connected: true,
  token: randomUUID(),
});

export const getRoom = (code: string): Room | undefined => rooms.get(code);

/** Puts a room straight into the registry. Only the dev fixture needs this. */
export const putRoom = (room: Room): void => {
  rooms.set(room.code, room);
};

export const seatOf = (room: Room, playerId: PlayerId): Seat | undefined =>
  room.seats.find((seat) => seat.playerId === playerId);

export const seatByToken = (room: Room, token: string): Seat | undefined =>
  room.seats.find((seat) => seat.token === token);

export const roomIsFull = (room: Room): boolean => room.seats.length >= MAX_PLAYERS;

export const canStart = (room: Room): boolean =>
  !room.started &&
  room.seats.length >= MIN_PLAYERS &&
  room.seats.every((seat) => seat.ready && seat.color !== undefined);

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
    room.seats.map((seat) => ({
      id: seat.playerId,
      name: seat.name,
      // Colours are required to start, so this cast only covers the impossible.
      color: seat.color as PlayerColor,
    })),
  );
  room.seed = seed;
  room.started = true;
  room.state = state;
  return state;
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
export const migrateHost = (room: Room): void => {
  const host = seatOf(room, room.hostId);
  if (host?.connected) return;
  const next = room.seats.find((seat) => seat.connected);
  if (next) room.hostId = next.playerId;
};

export const publicSeat = (seat: Seat): PublicSeat => ({
  playerId: seat.playerId,
  name: seat.name,
  ...(seat.color === undefined ? {} : { color: seat.color }),
  ready: seat.ready,
  connected: seat.connected,
});

export const roomState = (room: Room): RoomState => {
  const blocked = room.seats.find((seat) => seat.blockingSince !== undefined);
  return {
    code: room.code,
    seats: room.seats.map(publicSeat),
    hostId: room.hostId,
    started: room.started,
    previewSeed: room.previewSeed,
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

export const dropRoom = (code: string): void => {
  rooms.delete(code);
  store.deleteRoom(code);
};

/** Only for tests: forget everything between runs. */
export const resetRooms = (): void => {
  rooms.clear();
  store = memoryStore();
};

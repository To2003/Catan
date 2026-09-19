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
import type { PublicSeat, RoomState } from './protocol.js';
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
}

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

export const seatOf = (room: Room, playerId: PlayerId): Seat | undefined =>
  room.seats.find((seat) => seat.playerId === playerId);

export const seatByToken = (room: Room, token: string): Seat | undefined =>
  room.seats.find((seat) => seat.token === token);

export const roomIsFull = (room: Room): boolean => room.seats.length >= MAX_PLAYERS;

export const canStart = (room: Room): boolean =>
  !room.started &&
  room.seats.length >= MIN_PLAYERS &&
  room.seats.every((seat) => seat.ready && seat.color !== undefined);

/** Starts the game. The seed comes from crypto, not from anything guessable. */
export const startGame = (room: Room): ReadonlyGameState => {
  const seed = randomInt(0, 0xffffffff);
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
 * A rematch: same room, same seats, a new game.
 *
 * The action list starts empty and a fresh seed is drawn, so the new game is
 * as replayable as the old one was. Nothing about the previous game is kept —
 * that is what "rematch" means.
 */
export const restartGame = (room: Room): ReadonlyGameState => {
  room.actions.length = 0;
  room.started = false;
  for (const seat of room.seats) delete seat.blockingSince;
  const state = startGame(room);
  store.deleteRoom(room.code);
  persistRoom(room);
  return state;
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

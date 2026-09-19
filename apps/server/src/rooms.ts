import { randomInt, randomUUID } from 'node:crypto';
import {
  MAX_PLAYERS,
  MIN_PLAYERS,
  createGame,
  type Action,
  type PlayerColor,
  type PlayerId,
  type ReadonlyGameState,
} from '@tierra-austral/engine';
import type { PublicSeat, RoomState } from './protocol.js';

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
};

/** Only for tests: forget everything between runs. */
export const resetRooms = (): void => {
  rooms.clear();
};

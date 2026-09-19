import { getPlayerView, isVisibleTo, type GameEvent } from '@tierra-austral/engine';
import type { Server, Socket } from 'socket.io';
import type { ClientToServer, ServerToClient, SocketData } from './protocol.js';
import { roomState, type Room } from './rooms.js';

/**
 * What each socket is told.
 *
 * Every player gets their own view and their own slice of the events: the
 * filtering happens here, once, on the way out. Nothing downstream has to
 * remember that an event might be private.
 */

export type GameServer = Server<ClientToServer, ServerToClient, Record<string, never>, SocketData>;
export type GameSocket = Socket<ClientToServer, ServerToClient, Record<string, never>, SocketData>;

/** socketId by playerId, for the room the player is in. */
export type Connections = Map<string, string>;

export const sendRoomState = (io: GameServer, room: Room): void => {
  io.to(room.code).emit('room:state', roomState(room));
};

export const sendViews = (io: GameServer, room: Room, connections: Connections): void => {
  const state = room.state;
  if (!state) return;

  for (const seat of room.seats) {
    const socketId = connections.get(seat.playerId);
    if (!socketId) continue;
    io.to(socketId).emit('game:state', getPlayerView(state, seat.playerId));
  }
};

export const sendEvents = (
  io: GameServer,
  room: Room,
  connections: Connections,
  events: readonly GameEvent[],
): void => {
  if (events.length === 0) return;

  for (const seat of room.seats) {
    const socketId = connections.get(seat.playerId);
    if (!socketId) continue;
    const visible = events.filter((event) => isVisibleTo(event, seat.playerId));
    if (visible.length > 0) io.to(socketId).emit('game:events', visible);
  }
};

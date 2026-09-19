import { create } from 'zustand';
import type { Action, GameEvent, PlayerView } from '@tierra-austral/engine';
import { socket } from '../net/socket.js';
import {
  readLastRoom,
  readName,
  readToken,
  writeLastRoom,
  writeName,
  writeToken,
} from '../lib/tokens.js';
import { ERROR_TEXT } from '../lib/errorText.js';
import { sounds } from '../lib/sounds.js';

/**
 * Everything the client knows, which is only ever what the server told it.
 *
 * The client never applies a rule: it sends actions and renders the view it
 * gets back, including the list of legal moves the server worked out.
 */

export interface RoomSeat {
  readonly playerId: string;
  readonly name: string;
  readonly color?: string;
  readonly ready: boolean;
  readonly connected: boolean;
}

export interface RoomState {
  readonly code: string;
  readonly seats: readonly RoomSeat[];
  readonly hostId: string;
  readonly started: boolean;
  readonly blockedBy?: { readonly playerId: string; readonly since: number };
}

interface ChatMessage {
  readonly from: string;
  readonly text: string;
  readonly at: number;
}

interface GameStore {
  connected: boolean;
  // `| undefined` rather than optional: exactOptionalPropertyTypes is on, and
  // these are cleared by being set back to undefined.
  playerId: string | undefined;
  room: RoomState | undefined;
  view: PlayerView | undefined;
  events: GameEvent[];
  chat: ChatMessage[];
  error: string | undefined;
  createRoom: (name: string) => void;
  joinRoom: (code: string, name: string) => void;
  setColor: (color: string) => void;
  setReady: (ready: boolean) => void;
  start: () => void;
  forceTurn: () => void;
  /** Walks back into the last room if this browser still holds a seat there. */
  resume: () => void;
  send: (action: Action) => void;
  sendChat: (text: string) => void;
  rematch: () => void;
  clearError: () => void;
}

export const useGame = create<GameStore>((set, get) => {
  socket.on('connect', () => {
    set({ connected: true });
  });
  socket.on('disconnect', () => {
    set({ connected: false });
  });
  socket.on('session', (payload: { playerId: string; token: string; code: string }) => {
    writeToken(payload.code, payload.token);
    writeLastRoom(payload.code);
    set({ playerId: payload.playerId });
  });
  socket.on('session:replaced', () => {
    set({ error: 'Abriste la partida en otra pestaña' });
  });
  socket.on('room:state', (room: RoomState) => {
    set({ room });
  });
  socket.on('game:state', (view: PlayerView) => {
    set({ view });
  });
  socket.on('game:events', (events: GameEvent[]) => {
    // A sound per kind of thing that happened, at most one of each per batch.
    const kinds = new Set(events.map((event) => event.type));
    if (kinds.has('DiceRolled')) sounds.dice();
    if (kinds.has('ResourcesProduced') || kinds.has('SetupResourcesGranted')) sounds.production();
    if (kinds.has('BuildingPlaced') || kinds.has('RoadPlaced') || kinds.has('CityUpgraded')) {
      sounds.build();
    }
    if (kinds.has('TradeConfirmed') || kinds.has('MaritimeTraded')) sounds.trade();
    if (kinds.has('GameWon')) sounds.win();

    set((state) => ({ events: [...state.events, ...events] }));
  });
  socket.on('chat:message', (message: ChatMessage) => {
    set((state) => ({ chat: [...state.chat, message] }));
  });
  socket.on('game:error', (error: { code: string; message: string }) => {
    // Engine codes get the wording the UI already has; transport codes arrive
    // with a message of their own.
    const known: string | undefined = Object.prototype.hasOwnProperty.call(ERROR_TEXT, error.code)
      ? ERROR_TEXT[error.code as keyof typeof ERROR_TEXT]
      : undefined;
    set({ error: known ?? error.message });
  });

  return {
    connected: socket.connected,
    playerId: undefined,
    room: undefined,
    view: undefined,
    error: undefined,
    events: [],
    chat: [],

    createRoom: (name) => {
      writeName(name);
      set({ error: undefined, events: [] });
      socket.emit('room:create', { name });
    },
    joinRoom: (code, name) => {
      writeName(name);
      set({ error: undefined, events: [] });
      const token = readToken(code);
      socket.emit('room:join', { code: code.toUpperCase(), name, ...(token ? { token } : {}) });
    },
    resume: () => {
      // A reload should put you back at the table rather than at the front
      // door: the seat is still yours as long as the token is.
      const code = readLastRoom();
      const name = readName();
      if (!code || !name) return;
      const token = readToken(code);
      if (!token) return;
      socket.emit('room:join', { code, name, token });
    },
    setColor: (color) => {
      socket.emit('room:setColor', { color });
    },
    setReady: (ready) => {
      socket.emit('room:ready', { ready });
    },
    start: () => {
      socket.emit('room:start');
    },
    forceTurn: () => {
      socket.emit('room:forceTurn');
    },
    send: (action) => {
      const version = get().view?.version;
      if (version === undefined) return;
      set({ error: undefined });
      socket.emit('game:action', { action, expectedVersion: version });
    },
    sendChat: (text) => {
      socket.emit('chat:send', { text });
    },
    rematch: () => {
      set({ events: [], error: undefined });
      socket.emit('room:rematch');
    },
    clearError: () => {
      set({ error: undefined });
    },
  };
});

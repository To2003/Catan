import { create } from 'zustand';
import type { Action, BoardMode, GameEvent, PlayerView } from '@tierra-austral/engine';
import { socket } from '../net/socket.js';
import {
  forgetLastRoom,
  forgetToken,
  readLastRoom,
  readName,
  readRoomFromUrl,
  readToken,
  writeLastRoom,
  writeName,
  writeToken,
} from '../lib/tokens.js';
import { ERROR_TEXT } from '../lib/errorText.js';
import { sounds } from '../lib/sounds.js';
import { effectsFrom, mergeEffects, stillAlive, type Effect } from '../lib/effects.js';
import {
  readAnimationSpeed,
  speedScale,
  writeAnimationSpeed,
  type AnimationSpeed,
} from '../lib/animation.js';

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

export interface RestartVoteState {
  readonly by: string;
  readonly deadline: number;
  readonly votes: Readonly<Record<string, 'yes' | 'no'>>;
  readonly needed: readonly string[];
}

export interface RoomState {
  readonly code: string;
  readonly seats: readonly RoomSeat[];
  readonly hostId: string;
  readonly started: boolean;
  readonly blockedBy?: { readonly playerId: string; readonly since: number };
  readonly previewSeed: number;
  readonly boardMode: BoardMode;
  readonly wins: Readonly<Record<string, number>>;
  readonly gamesPlayed: number;
  readonly restartVote?: RestartVoteState;
  readonly restartCooldown: Readonly<Record<string, number>>;
}

/**
 * A line in the room's conversation.
 *
 * It mirrors the server's shape exactly. The chat belongs to the room, so
 * nothing here is ever cleared by a game starting, restarting or being played
 * again — only by walking into a different room.
 */
export interface ChatMessage {
  readonly id: number;
  readonly at: number;
  readonly kind: 'player' | 'system';
  /** Absent on system lines. */
  readonly from?: string;
  readonly text: string;
}

interface GameStore {
  connected: boolean;
  /** Short-lived visuals derived from the events, never a source of truth. */
  effects: Effect[];
  animation: AnimationSpeed;
  setAnimation: (speed: AnimationSpeed) => void;
  pruneEffects: () => void;
  // `| undefined` rather than optional: exactOptionalPropertyTypes is on, and
  // these are cleared by being set back to undefined.
  playerId: string | undefined;
  room: RoomState | undefined;
  view: PlayerView | undefined;
  events: GameEvent[];
  chat: ChatMessage[];
  /**
   * How much of the conversation has been looked at, as a count.
   *
   * It lives here rather than in the screen because the history arrives from
   * the server after the screen has mounted: a panel counting from zero would
   * greet everybody who reconnects with two hundred unread messages.
   */
  chatSeen: number;
  markChatSeen: () => void;
  error: string | undefined;
  /**
   * The code of the room you walked out of, this session.
   *
   * Two jobs: it stops the automatic "walk back into your last room" from
   * dragging you straight back in — which it would, since leaving is exactly
   * the state that rule looks for — and it puts the code back in the join box
   * so coming back is one click.
   */
  leftRoom: string | undefined;
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
  newBoard: () => void;
  setBoardMode: (mode: BoardMode) => void;
  /**
   * Walk out. In the lobby the seat is given up; in a game it is kept, so the
   * token still brings you back to it.
   */
  leaveRoom: (options?: { readonly forget?: boolean }) => void;
  proposeRestart: () => void;
  voteRestart: (approve: boolean) => void;
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
    // A restart clears the running game's events: they belong to the game that
    // just ended, which is archived now.
    set((state) =>
      (state.room?.gamesPlayed ?? 0) !== room.gamesPlayed ? { room, events: [] } : { room },
    );
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

    set((state) => {
      const you = state.view?.you;
      const born = you === undefined ? [] : effectsFrom(events, you, speedScale(state.animation));
      return {
        events: [...state.events, ...events],
        // A burst replaces what is on screen rather than piling up behind it,
        // and a second roll takes over from the first.
        effects: mergeEffects(state.effects, born),
      };
    });
  });
  socket.on('chat:message', (message: ChatMessage) => {
    set((state) =>
      // A reconnection can deliver a line that the history already carried.
      state.chat.some((line) => line.id === message.id) ? {} : { chat: [...state.chat, message] },
    );
  });
  socket.on('chat:history', (messages: ChatMessage[]) => {
    // Arriving in a room is not the same as missing what was said before it.
    set({ chat: messages, chatSeen: messages.length });
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
    effects: [],
    animation: readAnimationSpeed(),
    setAnimation: (speed) => {
      writeAnimationSpeed(speed);
      set({ animation: speed, ...(speed === 'off' ? { effects: [] } : {}) });
    },
    pruneEffects: () => {
      set((state) => {
        const alive = stillAlive(state.effects);
        return alive.length === state.effects.length ? {} : { effects: alive };
      });
    },
    playerId: undefined,
    room: undefined,
    view: undefined,
    error: undefined,
    leftRoom: undefined,
    events: [],
    chat: [],
    chatSeen: 0,
    markChatSeen: () => {
      set((state) => ({ chatSeen: state.chat.length }));
    },

    createRoom: (name) => {
      writeName(name);
      // A different room is a different conversation; the server sends the
      // history for this one right after the session.
      set({ error: undefined, events: [], chat: [], chatSeen: 0, leftRoom: undefined });
      socket.emit('room:create', { name });
    },
    joinRoom: (code, name) => {
      writeName(name);
      set({ error: undefined, events: [], chat: [], chatSeen: 0, leftRoom: undefined });
      const token = readToken(code);
      socket.emit('room:join', { code: code.toUpperCase(), name, ...(token ? { token } : {}) });
    },
    resume: () => {
      // A room handed over in the URL wins: that is how the dev fixture seats
      // three windows, and how a reconnect link works.
      const fromUrl = readRoomFromUrl();
      if (fromUrl) {
        writeToken(fromUrl.code, fromUrl.token);
        writeName(fromUrl.name);
        socket.emit('room:join', fromUrl);
        return;
      }

      // Otherwise a reload should put you back at the table rather than at the
      // front door: the seat is still yours as long as the token is.
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
    leaveRoom: (options) => {
      const code = get().room?.code;
      socket.emit('room:leave');
      // A room you walked out of should not be the one a reload takes you
      // back to. The token only goes when the seat did.
      forgetLastRoom();
      if (options?.forget === true && code !== undefined) forgetToken(code);
      set({
        room: undefined,
        view: undefined,
        playerId: undefined,
        events: [],
        chat: [],
        chatSeen: 0,
        effects: [],
        error: undefined,
        ...(code === undefined ? {} : { leftRoom: code }),
      });
    },
    rematch: () => {
      set({ events: [], error: undefined });
      socket.emit('room:rematch');
    },
    setBoardMode: (mode) => {
      socket.emit('room:setBoardMode', { mode });
    },
    newBoard: () => {
      socket.emit('room:newBoard');
    },
    proposeRestart: () => {
      set({ error: undefined });
      socket.emit('room:proposeRestart');
    },
    voteRestart: (approve) => {
      socket.emit('room:voteRestart', { approve });
    },
    clearError: () => {
      set({ error: undefined });
    },
  };
});

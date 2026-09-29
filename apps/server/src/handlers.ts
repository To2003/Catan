import {
  applyAction,
  setConnected,
  type Action,
  type ErrorCode,
  type PlayerId,
} from '@tierra-austral/engine';
import { FORCE_TURN_DELAY_MS, forcedAction, isBlocking } from './blocking.js';
import {
  sendEvents,
  sendRoomState,
  sendViews,
  type Connections,
  type GameServer,
  type GameSocket,
} from './broadcast.js';
import { createRateLimiter } from './limits.js';
import type { ErrorPayload, TransportError } from './protocol.js';
import { createQueue } from './queue.js';
import {
  canStart,
  createRoom,
  getRoom,
  migrateHost,
  newSeat,
  roomIsFull,
  seatByToken,
  persistAction,
  persistRoom,
  recordWin,
  rerollPreview,
  restartGame,
  seatOf,
  startGame,
  type Room,
} from './rooms.js';
import {
  actionMessageSchema,
  chatSchema,
  createRoomSchema,
  voteSchema,
  joinRoomSchema,
  readySchema,
  setColorSchema,
} from './schema.js';

/**
 * Socket handlers.
 *
 * Two rules run through all of it:
 *
 *   - **Identity comes from the session, never from a payload.** Every handler
 *     reads `socket.data`, which only `room:create` and `room:join` set.
 *   - **A message is checked for shape before the engine sees it.** zod first,
 *     rules second.
 */

const MESSAGES: Record<TransportError, string> = {
  BAD_PAYLOAD: 'Mensaje inválido',
  RATE_LIMITED: 'Demasiadas acciones, esperá un momento',
  NO_SESSION: 'No estás en ninguna sala',
  ROOM_NOT_FOUND: 'No existe esa sala',
  ROOM_FULL: 'La sala está llena',
  NOT_HOST: 'Solo el host puede hacer eso',
  NOT_ENOUGH_PLAYERS: 'Faltan jugadores',
  NOT_READY: 'Falta que todos estén listos y con color',
  COLOR_TAKEN: 'Ese color ya está tomado',
  GAME_IN_PROGRESS: 'La partida ya empezó',
  GAME_NOT_STARTED: 'La partida todavía no empezó',
  NOTHING_TO_FORCE: 'No hay a quién forzarle el turno',
  GAME_NOT_OVER: 'La partida todavía no terminó',
  VOTE_OPEN: 'Ya hay una votación abierta',
  NO_VOTE: 'No hay ninguna votación',
  ALREADY_VOTED: 'Ya votaste',
  ON_COOLDOWN: 'Hay que esperar para volver a proponer',
  TOO_SOON: 'Todavía no pasaron los 2 minutos',
};

/**
 * Actions that several players may send at once, where a version check would
 * punish whoever is second for no reason.
 *
 * During a discard everyone who owes cards plays at the same time: the first to
 * arrive bumps the version, and the rest would get STALE_STATE for a move that
 * is perfectly valid. Answering a trade is the same shape — three players may
 * accept at once — and so is withdrawing an offer while somebody else plays.
 * The engine validates every action against the state as it is when it runs, so
 * the version is only worth checking for the active player's own sequential
 * moves.
 */
const CONCURRENT_ACTIONS = new Set<Action['type']>([
  'discard',
  'respondOffer',
  'counterOffer',
  'cancelOffer',
]);

export type { GameServer } from './broadcast.js';

/** How long a restart vote stays open (SPEC.md §7.1). */
const RESTART_VOTE_MS = 60_000;
/** How long somebody waits after their proposal was turned down. */
const RESTART_COOLDOWN_MS = 5 * 60_000;

export const registerHandlers = (io: GameServer): void => {
  const connections: Connections = new Map();
  const voteTimers = new Map<string, NodeJS.Timeout>();
  const queue = createQueue();
  const actionLimiter = createRateLimiter(30, 10_000);
  const chatLimiter = createRateLimiter(5, 10_000);

  const fail = (socket: GameSocket, code: TransportError | ErrorCode): void => {
    const message = code in MESSAGES ? MESSAGES[code as TransportError] : 'Jugada inválida';
    socket.emit('game:error', { code, message } satisfies ErrorPayload);
  };

  const sessionOf = (socket: GameSocket): { room: Room; playerId: PlayerId } | undefined => {
    const { code, playerId } = socket.data;
    if (!code || !playerId) return undefined;
    const room = getRoom(code);
    if (!room) return undefined;
    if (!seatOf(room, playerId)) return undefined;
    return { room, playerId };
  };

  /** Recomputes who is holding the room up, and since when (SPEC.md §7.1). */
  const refreshBlocking = (room: Room): void => {
    const state = room.state;
    for (const seat of room.seats) {
      const blocking = state !== undefined && !seat.connected && isBlocking(state, seat.playerId);
      if (blocking) {
        // The clock starts when both things are true, whichever came last: a
        // player who left long before their turn only starts it when it arrives.
        seat.blockingSince ??= Date.now();
      } else {
        delete seat.blockingSince;
      }
    }
  };

  /**
   * Resolves an open vote if it can be.
   *
   * Unanimous among the players who are **here**: somebody who left cannot
   * hold the room hostage, and a single "no" ends it on the spot. A refusal —
   * by vote or by running out of time — puts the proposer on a cooldown, so
   * nobody can keep asking.
   */
  const settleVote = (room: Room): void => {
    const vote = room.restartVote;
    if (!vote) return;

    const here = room.seats.filter((seat) => seat.connected).map((seat) => seat.playerId);
    const refused = Object.values(vote.votes).includes('no');
    const expired = Date.now() >= vote.deadline;
    const everyone = here.every((playerId) => vote.votes[playerId] === 'yes');

    if (refused || expired) {
      room.restartCooldown[vote.by] = Date.now() + RESTART_COOLDOWN_MS;
      delete room.restartVote;
      clearVoteTimer(room.code);
      return;
    }

    if (here.length > 0 && everyone) {
      delete room.restartVote;
      clearVoteTimer(room.code);
      restartGame(room);
    }
  };

  const clearVoteTimer = (code: string): void => {
    const timer = voteTimers.get(code);
    if (timer) clearTimeout(timer);
    voteTimers.delete(code);
  };

  const scheduleVoteTimeout = (room: Room): void => {
    clearVoteTimer(room.code);
    const timer = setTimeout(() => {
      settleVote(room);
      publish(room);
    }, RESTART_VOTE_MS + 50);
    timer.unref();
    voteTimers.set(room.code, timer);
  };

  const publish = (room: Room): void => {
    refreshBlocking(room);
    sendRoomState(io, room);
    sendViews(io, room, connections);
  };

  /** Applies one action and tells everybody. Returns the engine's error, if any. */
  const apply = (room: Room, playerId: PlayerId, action: Action): ErrorCode | undefined => {
    const state = room.state;
    if (!state) return undefined;

    const result = applyAction(state, playerId, action);
    if (!result.ok) return result.error;

    room.state = result.state;
    room.actions.push({ playerId, action });
    room.lastActivity = Date.now();
    // Written inside the per-room queue, so the order on disk is the order the
    // actions were applied in (SPEC.md §7.2).
    persistAction(room, room.actions.length - 1, playerId, action);

    // The room keeps a scoreboard across its games.
    for (const event of result.events) {
      if (event.type === 'GameWon') recordWin(room, event.player);
    }

    sendEvents(io, room, connections, result.events);
    publish(room);
    return undefined;
  };

  io.on('connection', (socket: GameSocket) => {
    socket.on('room:create', (payload: unknown) => {
      const parsed = createRoomSchema.safeParse(payload);
      if (!parsed.success) {
        fail(socket, 'BAD_PAYLOAD');
        return;
      }

      const { room, seat } = createRoom(parsed.data.name);
      socket.data.code = room.code;
      socket.data.playerId = seat.playerId;
      connections.set(seat.playerId, socket.id);
      void socket.join(room.code);

      // The token goes to its owner's socket and nowhere else, ever.
      socket.emit('session', { playerId: seat.playerId, token: seat.token, code: room.code });
      persistRoom(room);
      publish(room);
    });

    socket.on('room:join', (payload: unknown) => {
      const parsed = joinRoomSchema.safeParse(payload);
      if (!parsed.success) {
        fail(socket, 'BAD_PAYLOAD');
        return;
      }

      const { code, name, token } = parsed.data;
      const room = getRoom(code.toUpperCase());
      if (!room) {
        fail(socket, 'ROOM_NOT_FOUND');
        return;
      }

      const existing = token ? seatByToken(room, token) : undefined;

      // A game in progress is only open to someone coming back with their own
      // token: no walk-ins, and no taking over a seat with a guessed one.
      if (!existing && room.started) {
        fail(socket, 'GAME_IN_PROGRESS');
        return;
      }
      if (!existing && roomIsFull(room)) {
        fail(socket, 'ROOM_FULL');
        return;
      }

      const seat = existing ?? newSeat(name);
      if (!existing) room.seats.push(seat);

      // The last connection wins: a second tab takes the seat over.
      const previous = connections.get(seat.playerId);
      if (previous && previous !== socket.id) {
        io.to(previous).emit('session:replaced');
        io.sockets.sockets.get(previous)?.disconnect(true);
      }

      seat.connected = true;
      if (!existing) seat.name = name;
      if (room.state) room.state = setConnected(room.state, seat.playerId, true);
      socket.data.code = room.code;
      socket.data.playerId = seat.playerId;
      connections.set(seat.playerId, socket.id);
      void socket.join(room.code);
      room.lastActivity = Date.now();

      socket.emit('session', { playerId: seat.playerId, token: seat.token, code: room.code });
      persistRoom(room);
      publish(room);
    });

    socket.on('room:setColor', (payload: unknown) => {
      const parsed = setColorSchema.safeParse(payload);
      if (!parsed.success) {
        fail(socket, 'BAD_PAYLOAD');
        return;
      }
      const session = sessionOf(socket);
      if (!session) {
        fail(socket, 'NO_SESSION');
        return;
      }
      if (session.room.started) {
        fail(socket, 'GAME_IN_PROGRESS');
        return;
      }

      const taken = session.room.seats.some(
        (seat) => seat.color === parsed.data.color && seat.playerId !== session.playerId,
      );
      if (taken) {
        fail(socket, 'COLOR_TAKEN');
        return;
      }

      const seat = seatOf(session.room, session.playerId);
      if (seat) seat.color = parsed.data.color;
      persistRoom(session.room);
      publish(session.room);
    });

    socket.on('room:ready', (payload: unknown) => {
      const parsed = readySchema.safeParse(payload);
      if (!parsed.success) {
        fail(socket, 'BAD_PAYLOAD');
        return;
      }
      const session = sessionOf(socket);
      if (!session) {
        fail(socket, 'NO_SESSION');
        return;
      }

      const seat = seatOf(session.room, session.playerId);
      if (seat) seat.ready = parsed.data.ready;
      persistRoom(session.room);
      publish(session.room);
    });

    socket.on('room:start', () => {
      const session = sessionOf(socket);
      if (!session) {
        fail(socket, 'NO_SESSION');
        return;
      }
      if (session.room.hostId !== session.playerId) {
        fail(socket, 'NOT_HOST');
        return;
      }
      if (session.room.started) {
        fail(socket, 'GAME_IN_PROGRESS');
        return;
      }
      if (!canStart(session.room)) {
        fail(socket, 'NOT_READY');
        return;
      }

      startGame(session.room);
      persistRoom(session.room);
      publish(session.room);
    });

    socket.on('game:action', (payload: unknown) => {
      const parsed = actionMessageSchema.safeParse(payload);
      if (!parsed.success) {
        fail(socket, 'BAD_PAYLOAD');
        return;
      }
      const session = sessionOf(socket);
      if (!session) {
        fail(socket, 'NO_SESSION');
        return;
      }
      if (!session.room.state) {
        fail(socket, 'GAME_NOT_STARTED');
        return;
      }
      if (!actionLimiter.take(socket.id)) {
        fail(socket, 'RATE_LIMITED');
        return;
      }

      const { action, expectedVersion } = parsed.data;
      void queue.run(session.room.code, () => {
        const state = session.room.state;
        if (!state) return;
        if (!CONCURRENT_ACTIONS.has(action.type) && expectedVersion !== state.version) {
          fail(socket, 'STALE_STATE');
          return;
        }
        const error = apply(session.room, session.playerId, action);
        if (error) fail(socket, error);
      });
    });

    socket.on('room:forceTurn', () => {
      const session = sessionOf(socket);
      if (!session) {
        fail(socket, 'NO_SESSION');
        return;
      }
      if (session.room.hostId !== session.playerId) {
        fail(socket, 'NOT_HOST');
        return;
      }
      const state = session.room.state;
      if (!state) {
        fail(socket, 'GAME_NOT_STARTED');
        return;
      }

      refreshBlocking(session.room);
      const blocked = session.room.seats.find((seat) => seat.blockingSince !== undefined);
      if (!blocked?.blockingSince) {
        fail(socket, 'NOTHING_TO_FORCE');
        return;
      }
      if (Date.now() - blocked.blockingSince < FORCE_TURN_DELAY_MS) {
        fail(socket, 'TOO_SOON');
        return;
      }

      void queue.run(session.room.code, () => {
        // Keep playing for them until they are no longer in the way. Each move
        // is applied like any other, so the action list still replays.
        for (let guard = 0; guard < 20; guard += 1) {
          const current = session.room.state;
          if (!current || !isBlocking(current, blocked.playerId)) break;
          const action = forcedAction(current, blocked.playerId);
          if (!action) break;
          if (apply(session.room, blocked.playerId, action)) break;
        }
        publish(session.room);
      });
    });

    socket.on('room:newBoard', () => {
      const session = sessionOf(socket);
      if (!session) {
        fail(socket, 'NO_SESSION');
        return;
      }
      if (session.room.hostId !== session.playerId) {
        fail(socket, 'NOT_HOST');
        return;
      }
      if (session.room.started) {
        fail(socket, 'GAME_IN_PROGRESS');
        return;
      }

      rerollPreview(session.room);
      persistRoom(session.room);
      publish(session.room);
    });

    socket.on('room:proposeRestart', () => {
      const session = sessionOf(socket);
      if (!session) {
        fail(socket, 'NO_SESSION');
        return;
      }
      const { room, playerId } = session;
      if (!room.started || !room.state) {
        fail(socket, 'GAME_NOT_STARTED');
        return;
      }
      if (room.restartVote) {
        fail(socket, 'VOTE_OPEN');
        return;
      }
      const until = room.restartCooldown[playerId] ?? 0;
      if (Date.now() < until) {
        fail(socket, 'ON_COOLDOWN');
        return;
      }

      // Proposing is a vote in favour: nobody has to agree with themselves.
      room.restartVote = {
        by: playerId,
        startedAt: Date.now(),
        deadline: Date.now() + RESTART_VOTE_MS,
        votes: { [playerId]: 'yes' },
      };
      scheduleVoteTimeout(room);
      settleVote(room);
      publish(room);
    });

    socket.on('room:voteRestart', (payload: unknown) => {
      const parsed = voteSchema.safeParse(payload);
      if (!parsed.success) {
        fail(socket, 'BAD_PAYLOAD');
        return;
      }
      const session = sessionOf(socket);
      if (!session) {
        fail(socket, 'NO_SESSION');
        return;
      }
      const { room, playerId } = session;
      if (!room.restartVote) {
        fail(socket, 'NO_VOTE');
        return;
      }
      if (room.restartVote.votes[playerId] !== undefined) {
        fail(socket, 'ALREADY_VOTED');
        return;
      }

      room.restartVote.votes[playerId] = parsed.data.approve ? 'yes' : 'no';
      settleVote(room);
      publish(room);
    });

    socket.on('room:rematch', () => {
      const session = sessionOf(socket);
      if (!session) {
        fail(socket, 'NO_SESSION');
        return;
      }
      if (session.room.hostId !== session.playerId) {
        fail(socket, 'NOT_HOST');
        return;
      }
      if (session.room.state?.phase.kind !== 'gameOver') {
        fail(socket, 'GAME_NOT_OVER');
        return;
      }

      void queue.run(session.room.code, () => {
        restartGame(session.room);
        publish(session.room);
      });
    });

    socket.on('chat:send', (payload: unknown) => {
      const parsed = chatSchema.safeParse(payload);
      if (!parsed.success) {
        fail(socket, 'BAD_PAYLOAD');
        return;
      }
      const session = sessionOf(socket);
      if (!session) {
        fail(socket, 'NO_SESSION');
        return;
      }
      if (!chatLimiter.take(socket.id)) {
        fail(socket, 'RATE_LIMITED');
        return;
      }

      io.to(session.room.code).emit('chat:message', {
        from: session.playerId,
        text: parsed.data.text,
        at: Date.now(),
      });
    });

    socket.on('disconnect', () => {
      actionLimiter.forget(socket.id);
      chatLimiter.forget(socket.id);

      const session = sessionOf(socket);
      if (!session) return;
      // Only clear the seat if this socket is still the one holding it: a
      // replaced tab disconnects *after* the new one took over.
      if (connections.get(session.playerId) !== socket.id) return;

      connections.delete(session.playerId);
      const seat = seatOf(session.room, session.playerId);
      if (seat) seat.connected = false;

      // Presence lives in the state too, so views show it — through a pure
      // helper, never by mutating a state the engine handed over, and never as
      // an action, since presence is not part of the replay.
      if (session.room.state) {
        session.room.state = setConnected(session.room.state, session.playerId, false);
      }

      migrateHost(session.room);
      publish(session.room);
    });
  });
};

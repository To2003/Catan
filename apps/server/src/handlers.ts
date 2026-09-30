import {
  applyAction,
  setConnected,
  type Action,
  type ErrorCode,
  type PlayerId,
} from '@tierra-austral/engine';
import { FORCE_TURN_DELAY_MS, forcedAction, isBlocking } from './blocking.js';

/** Below this many players still in it, a game is over (SPEC.md §7.1). */
const MIN_PLAYERS_TO_CONTINUE = 2;
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
  seatSomebody,
  roomIsFull,
  seatByToken,
  persistAction,
  persistRoom,
  pushChat,
  abandonGame,
  dropRoom,
  presentSeats,
  recordWin,
  retireSeat,
  roomIsEmpty,
  type Seat,
  removeSeat,
  rerollPreview,
  restartGame,
  seatOf,
  startGame,
  type Room,
} from './rooms.js';
import {
  actionMessageSchema,
  boardModeSchema,
  chatSchema,
  targetSchema,
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
  TARGET_NOT_FOUND: 'Ese jugador no está en la sala',
  CANNOT_TARGET_SELF: 'No podés hacerte eso a vos mismo',
  KICKED: 'Ya no podés volver a esta sala',
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

  /** How a system line refers to somebody. */
  const nameIn = (room: Room, playerId: PlayerId): string =>
    seatOf(room, playerId)?.name ?? 'Alguien';

  /**
   * Adds a line to the room's conversation and sends it to everybody in it.
   *
   * System lines go through here too, so they are stored, numbered and
   * trimmed exactly like anything a person typed: one history, one order.
   */
  const say = (room: Room, message: Parameters<typeof pushChat>[1]): void => {
    io.to(room.code).emit('chat:message', pushChat(room, message));
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

    // Somebody who walked out does not get a vote, and does not get to hold
    // one up either.
    const here = presentSeats(room)
      .filter((seat) => seat.connected)
      .map((seat) => seat.playerId);
    const refused = Object.values(vote.votes).includes('no');
    const expired = Date.now() >= vote.deadline;
    const everyone = here.every((playerId) => vote.votes[playerId] === 'yes');

    if (refused || expired) {
      room.restartCooldown[vote.by] = Date.now() + RESTART_COOLDOWN_MS;
      delete room.restartVote;
      clearVoteTimer(room.code);
      say(room, {
        kind: 'system',
        text: refused
          ? 'No hubo acuerdo: la partida sigue'
          : 'Se venció el tiempo del voto: la partida sigue',
      });
      return;
    }

    if (here.length > 0 && everyone) {
      delete room.restartVote;
      clearVoteTimer(room.code);
      restartGame(room);
      say(room, { kind: 'system', text: 'Votaron todos que sí: empieza una partida nueva' });
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
      if (event.type === 'GameWon') {
        recordWin(room, event.player);
        say(room, { kind: 'system', text: `Ganó ${nameIn(room, event.player)}` });
      }
    }

    sendEvents(io, room, connections, result.events);
    playOutTheAbsent(room);
    endIfTooFewLeft(room);
    publish(room);
    return undefined;
  };

  /**
   * Plays for everybody who walked out, right now.
   *
   * The two-minute wait exists for somebody whose train went into a tunnel.
   * Somebody who pressed "abandonar para siempre" is not coming back, so
   * making the table wait for them is just making the table wait. Each move
   * goes through `apply`'s own path below, so it lands in the action list and
   * a replay reproduces the game exactly.
   */
  const playOutTheAbsent = (room: Room): void => {
    for (let guard = 0; guard < 200; guard += 1) {
      const state = room.state;
      if (!state || state.phase.kind === 'gameOver') return;

      const stuck = room.seats.find(
        (seat) => seat.gone !== undefined && isBlocking(state, seat.playerId),
      );
      if (!stuck) return;

      const action = forcedAction(state, stuck.playerId);
      if (!action) return;

      const result = applyAction(state, stuck.playerId, action);
      if (!result.ok) return;

      room.state = result.state;
      room.actions.push({ playerId: stuck.playerId, action });
      persistAction(room, room.actions.length - 1, stuck.playerId, action);
      for (const event of result.events) {
        if (event.type === 'GameWon') {
          recordWin(room, event.player);
          say(room, { kind: 'system', text: `Ganó ${nameIn(room, event.player)}` });
        }
      }
      sendEvents(io, room, connections, result.events);
    }
  };

  /**
   * A game with fewer than two people in it is not a game.
   *
   * It ends with no winner and the room goes back to the lobby, so whoever is
   * left can start another one. Nothing is added to the scoreboard: nobody
   * won it.
   */
  const endIfTooFewLeft = (room: Room): void => {
    if (!room.started || !room.state) return;
    const playing = presentSeats(room).length;
    if (playing >= MIN_PLAYERS_TO_CONTINUE) return;

    abandonGame(room);
    say(room, {
      kind: 'system',
      text: 'Quedaron menos de dos jugadores: la partida se cortó y volvimos a la sala',
    });
  };

  /**
   * The seat a host action is aimed at, or nothing plus a refusal.
   *
   * Everything a host does to somebody else goes through here, so the four
   * checks — real payload, real session, actually the host, a real seat that
   * is not your own — are written once and cannot drift apart.
   */
  const targetOf = (
    socket: GameSocket,
    payload: unknown,
  ): { room: Room; seat: Seat } | undefined => {
    const parsed = targetSchema.safeParse(payload);
    if (!parsed.success) {
      fail(socket, 'BAD_PAYLOAD');
      return undefined;
    }
    const session = sessionOf(socket);
    if (!session) {
      fail(socket, 'NO_SESSION');
      return undefined;
    }
    if (session.room.hostId !== session.playerId) {
      fail(socket, 'NOT_HOST');
      return undefined;
    }
    if (parsed.data.target === session.playerId) {
      fail(socket, 'CANNOT_TARGET_SELF');
      return undefined;
    }
    const seat = seatOf(session.room, parsed.data.target);
    if (!seat || seat.gone !== undefined) {
      fail(socket, 'TARGET_NOT_FOUND');
      return undefined;
    }
    return { room: session.room, seat };
  };

  /** A vote cannot outlive a change in who is voting. */
  const cancelVoteOn = (room: Room, because: string): void => {
    if (!room.restartVote) return;
    delete room.restartVote;
    clearVoteTimer(room.code);
    say(room, { kind: 'system', text: `Se canceló la votación: ${because}` });
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
      socket.emit('chat:history', room.chat);
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

      // Thrown out, or walked out for good: the token is spent either way.
      if (token !== undefined && room.blockedTokens.includes(token)) {
        fail(socket, 'KICKED');
        return;
      }

      const existing = token ? seatByToken(room, token) : undefined;
      if (existing?.gone !== undefined) {
        fail(socket, 'KICKED');
        return;
      }

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

      const seat = existing ?? seatSomebody(room, name);

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
      // Whoever just arrived reads the room before anyone says anything else.
      socket.emit('chat:history', room.chat);
      say(room, {
        kind: 'system',
        text: existing ? `${seat.name} volvió` : `${seat.name} entró a la sala`,
      });
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

    socket.on('room:setBoardMode', (payload: unknown) => {
      const parsed = boardModeSchema.safeParse(payload);
      if (!parsed.success) {
        fail(socket, 'BAD_PAYLOAD');
        return;
      }
      const session = sessionOf(socket);
      if (!session) {
        fail(socket, 'NO_SESSION');
        return;
      }
      if (session.room.hostId !== session.playerId) {
        fail(socket, 'NOT_HOST');
        return;
      }
      // Changing it mid-game would mean the saved actions no longer rebuild
      // the board they were played on.
      if (session.room.started) {
        fail(socket, 'GAME_IN_PROGRESS');
        return;
      }

      session.room.boardMode = parsed.data.mode;
      session.room.lastActivity = Date.now();
      persistRoom(session.room);
      publish(session.room);
    });

    /**
     * Leaving, which means two different things.
     *
     * In the lobby the seat goes: the room has to stop counting somebody who
     * walked out, or it sits there waiting for them to be ready forever. Once
     * the game has started the seat cannot go — the players are baked into the
     * state — so leaving is stepping away from the table, and the token in
     * your browser still brings you back.
     */
    socket.on('room:leave', () => {
      const session = sessionOf(socket);
      if (!session) {
        fail(socket, 'NO_SESSION');
        return;
      }
      const { room, playerId } = session;
      const seat = seatOf(room, playerId);
      const name = seat?.name ?? 'Alguien';
      const seatKept = room.started;

      connections.delete(playerId);
      void socket.leave(room.code);
      socket.data = {};

      if (seatKept) {
        if (seat) seat.connected = false;
        if (room.state) room.state = setConnected(room.state, playerId, false);
        migrateHost(room);
        say(room, { kind: 'system', text: `${name} se fue de la mesa` });
        persistRoom(room);
        publish(room);
      } else {
        const { empty } = removeSeat(room, playerId);
        if (empty) {
          // Nobody left to talk to, so there is nothing to keep.
          dropRoom(room.code);
        } else {
          say(room, { kind: 'system', text: `${name} se fue de la sala` });
          persistRoom(room);
          publish(room);
        }
      }

      socket.emit('room:left', { seatKept });
    });

    /**
     * Walking out of a game for good.
     *
     * The seat stays on the board — the pieces are part of a game everybody
     * else played — but it stops being anybody's: the token is spent, the
     * turns get played automatically, and trades stop reaching it.
     */
    socket.on('room:leaveForGood', () => {
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

      const name = nameIn(room, playerId);
      connections.delete(playerId);
      void socket.leave(room.code);
      socket.data = {};

      void queue.run(room.code, () => {
        // The engine has to see it: from here on, offers to everybody stop
        // including them, which is a rule and therefore part of the replay.
        apply(room, playerId, { type: 'leaveGame' });
        retireSeat(room, playerId, 'left');
        cancelVoteOn(room, `${name} abandonó la partida`);
        migrateHost(room);
        say(room, { kind: 'system', text: `${name} abandonó la partida` });

        if (roomIsEmpty(room)) {
          dropRoom(room.code);
        } else {
          playOutTheAbsent(room);
          endIfTooFewLeft(room);
          persistRoom(room);
          publish(room);
        }
      });

      socket.emit('room:left', { seatKept: false });
    });

    socket.on('room:kick', (payload: unknown) => {
      const target = targetOf(socket, payload);
      if (!target) return;
      const { room, seat } = target;
      const kicked = connections.get(seat.playerId);

      void queue.run(room.code, () => {
        if (room.started && room.state) {
          // Same as walking out: the game keeps the pieces and plays the turns.
          apply(room, seat.playerId, { type: 'leaveGame' });
          retireSeat(room, seat.playerId, 'kicked');
        } else {
          removeSeat(room, seat.playerId);
          if (!room.blockedTokens.includes(seat.token)) room.blockedTokens.push(seat.token);
        }

        connections.delete(seat.playerId);
        cancelVoteOn(room, `${seat.name} fue expulsado`);
        migrateHost(room);
        say(room, { kind: 'system', text: `${seat.name} fue expulsado` });

        if (roomIsEmpty(room)) {
          dropRoom(room.code);
        } else {
          playOutTheAbsent(room);
          endIfTooFewLeft(room);
          persistRoom(room);
          publish(room);
        }
      });

      // Told to their face, and then the door is shut.
      if (kicked !== undefined) {
        io.to(kicked).emit('room:kicked');
        const theirs = io.sockets.sockets.get(kicked);
        if (theirs) {
          void theirs.leave(room.code);
          theirs.data = {};
        }
      }
    });

    socket.on('room:transferHost', (payload: unknown) => {
      const target = targetOf(socket, payload);
      if (!target) return;
      const { room, seat } = target;

      room.hostId = seat.playerId;
      room.lastActivity = Date.now();
      say(room, { kind: 'system', text: `${seat.name} es el nuevo host` });
      persistRoom(room);
      publish(room);
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
      say(room, {
        kind: 'system',
        text: `${nameIn(room, playerId)} propuso empezar de nuevo`,
      });
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
        say(session.room, { kind: 'system', text: 'Revancha: arranca otra partida' });
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

      // The author comes from the socket's session. The payload carries the
      // text and nothing else, so nobody can sign a message with a name that
      // is not theirs.
      say(session.room, { kind: 'player', from: session.playerId, text: parsed.data.text });
      session.room.lastActivity = Date.now();
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
      if (seat) say(session.room, { kind: 'system', text: `${seat.name} se desconectó` });
      publish(session.room);
    });
  });
};

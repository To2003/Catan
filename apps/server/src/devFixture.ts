import { randomInt, randomUUID } from 'node:crypto';
import {
  RESOURCES,
  applyAction,
  createGame,
  isLegalAction,
  legalMoves,
  type Action,
  type PlayerColor,
  type PlayerId,
  type ReadonlyGameState,
  type Resource,
  type ResourceBundle,
} from '@tierra-austral/engine';
import { newSeat, persistRoom, putRoom, type Room, type Seat } from './rooms.js';

/**
 * A room that is about to end, for looking at the parts of the game that are
 * otherwise an hour of clicking away: the final screen, the score breakdown and
 * the rematch.
 *
 * It works because a room is `seed + actions` (SPEC.md §6): a game is played
 * out at random until somebody wins, the last few actions are dropped, and what
 * is left is loaded as an ordinary room. Nothing here is a special kind of
 * state — it is a real game, stopped a move short of the end.
 *
 * **Development only.** `registerDevRoutes` refuses to mount in production.
 */

const NAMES = ['Ana', 'Bruno', 'Cata'] as const;
const COLORS: readonly PlayerColor[] = ['celeste', 'bordo', 'verde'];

/** How long to keep trying before admitting the dice were not co-operating. */
const MAX_ACTIONS = 4000;
const MAX_ATTEMPTS = 6;

const randomFrom = <T>(items: readonly T[]): T | undefined =>
  items.length === 0 ? undefined : items[randomInt(items.length)];

/** A valid discard of exactly what is owed. */
const randomDiscard = (state: ReadonlyGameState, playerId: PlayerId): Action | undefined => {
  if (state.phase.kind !== 'discard') return undefined;
  const owed = state.phase.pending[playerId];
  const player = state.players.find((candidate) => candidate.id === playerId);
  if (owed === undefined || !player) return undefined;

  const cards: Partial<ResourceBundle> = {};
  let left = owed;
  for (const resource of RESOURCES) {
    const take = Math.min(left, player.resources[resource]);
    if (take > 0) cards[resource] = take;
    left -= take;
  }
  return { type: 'discard', cards };
};

/** Every move worth trying for one player, in the spirit of the fuzz. */
const candidates = (state: ReadonlyGameState, playerId: PlayerId): Action[] => {
  const moves = legalMoves(state, playerId);
  const pickResource = (): Resource => randomFrom(RESOURCES) ?? 'wood';

  const all: Action[] = [
    ...moves.settlements.map((vertex): Action => ({ type: 'placeSettlement', vertex })),
    ...moves.cities.map((vertex): Action => ({ type: 'upgradeCity', vertex })),
    ...moves.roads.map((edge): Action => ({ type: 'placeRoad', edge })),
    ...moves.robberHexes.map((hex): Action => ({ type: 'moveRobber', hex })),
    ...moves.stealTargets.map((target): Action => ({ type: 'steal', target })),
    ...moves.maritimeTrades.map(({ give, want }): Action => ({
      type: 'maritimeTrade',
      give,
      want,
    })),
    { type: 'buyDevCard' },
    { type: 'playKnight' },
    { type: 'playRoadBuilding' },
    { type: 'playMonopoly', resource: pickResource() },
    { type: 'playYearOfPlenty', resources: [pickResource(), pickResource()] },
    { type: 'rollDice' },
    { type: 'endTurn' },
  ];
  return all.filter((action) => isLegalAction(state, playerId, action));
};

/**
 * Plays a whole game at random and returns its actions, ending with the one
 * that won it.
 */
const playToTheEnd = (
  seed: number,
  seats: readonly Seat[],
): { playerId: PlayerId; action: Action }[] | undefined => {
  let state = createGame(
    seed,
    seats.map((seat) => ({
      id: seat.playerId,
      name: seat.name,
      color: seat.color as PlayerColor,
    })),
  );
  const actions: { playerId: PlayerId; action: Action }[] = [];

  for (let step = 0; step < MAX_ACTIONS; step += 1) {
    if (state.phase.kind === 'gameOver') return actions;

    const playerId =
      state.phase.kind === 'discard'
        ? (Object.keys(state.phase.pending)[0] ?? state.currentPlayer)
        : state.currentPlayer;

    const action =
      state.phase.kind === 'discard'
        ? randomDiscard(state, playerId)
        : // Building wins games; passing does not. Weighted like the fuzz.
          randomFrom(
            candidates(state, playerId).flatMap((candidate: Action): Action[] =>
              candidate.type === 'endTurn' ? [candidate] : [candidate, candidate, candidate],
            ),
          );
    if (!action) return undefined;

    const result = applyAction(state, playerId, action);
    if (!result.ok) return undefined;
    state = result.state;
    actions.push({ playerId, action });
  }

  return undefined;
};

export interface Fixture {
  readonly code: string;
  readonly players: {
    readonly name: string;
    readonly playerId: PlayerId;
    readonly token: string;
  }[];
  readonly actionsKept: number;
  readonly actionsDropped: number;
  /**
   * The moves that were cut off, in order — the last of which won the game.
   * Handy for replaying the exact ending by hand, or for a script to click.
   */
  readonly nextActions: { readonly playerId: PlayerId; readonly action: Action }[];
}

/**
 * Builds the room and puts it in the registry.
 *
 * `back` is how many actions to drop from the end: with the default of 1 the
 * game is one move from over, so the winning move is there to be made by hand.
 */
export const createFixtureRoom = (back = 1): Fixture => {
  const seats = NAMES.map((name, index) => {
    const seat = newSeat(name);
    const color = COLORS[index];
    if (color) seat.color = color;
    seat.ready = true;
    seat.connected = false;
    return seat;
  });

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const seed = randomInt(0, 0xffffffff);
    const full = playToTheEnd(seed, seats);
    if (!full || full.length <= back) continue;

    const kept = full.slice(0, full.length - Math.max(1, back));

    // Replay what we kept, so the room holds a state the engine produced.
    let state = createGame(
      seed,
      seats.map((seat) => ({
        id: seat.playerId,
        name: seat.name,
        color: seat.color as PlayerColor,
      })),
    );
    for (const entry of kept) {
      const result = applyAction(state, entry.playerId, entry.action);
      if (!result.ok) return createFixtureRoom(back);
      state = result.state;
    }

    const code = `DEV${randomInt(10)}${randomInt(10)}`;
    const room: Room = {
      code,
      seats,
      hostId: seats[0]?.playerId ?? '',
      started: true,
      seed,
      state,
      actions: kept,
      createdAt: Date.now(),
      lastActivity: Date.now(),
    };

    putRoom(room);
    persistRoom(room);

    return {
      code,
      players: seats.map((seat) => ({
        name: seat.name,
        playerId: seat.playerId,
        token: seat.token,
      })),
      actionsKept: kept.length,
      actionsDropped: full.length - kept.length,
      nextActions: full.slice(kept.length),
    };
  }

  throw new Error('could not play a game to its end for the fixture');
};

/** A token that looks like the real thing, for the seats the fixture hands out. */
export const devToken = (): string => randomUUID();

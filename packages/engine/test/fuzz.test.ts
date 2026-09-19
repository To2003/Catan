import { beforeAll, describe, expect, it } from 'vitest';
import {
  BANK_RESOURCE_COUNT,
  PIECE_STOCK,
  RESOURCES,
  applyAction,
  createGame,
  createRng,
  legalCitySpots,
  legalRoadSpots,
  legalRobberHexes,
  legalSettlementSpots,
  legalStealTargets,
  nextInt,
  shuffle,
  victoryPoints,
  type Action,
  type PlayerId,
  type ReadonlyGameState,
  type Resource,
  type ResourceBundle,
  type RngState,
} from '../src/index.js';
import { SEATS, at, everyRoadTouchesOwnNetwork } from './helpers.js';

/**
 * Random games, checked after every single action.
 *
 * The fuzzer's randomness is its own: `createRng` seeded separately from the
 * game, so shuffling the fuzzer never disturbs a game's dice.
 *
 * Since M3 the active player is not the only one who can act: a seven puts
 * everyone over the limit into a simultaneous discard. The fuzzer therefore
 * builds the move list across *all* players, and a deadlock means no player
 * anywhere has a legal action.
 *
 * Without trade, games still get stuck — nobody can afford anything and every
 * turn is roll-and-pass. That is expected, not a failure: the run stops after
 * MAX_ACTIONS. What *is* a failure is having no legal action at all, which
 * would mean the engine deadlocked.
 *
 * FUZZ_GAMES tunes how many games to play; CI runs the default in a couple of
 * seconds, and locally it is worth turning up.
 */

const FUZZ_GAMES = Number(process.env['FUZZ_GAMES'] ?? 25);
/**
 * Where a run gives up. 400 keeps CI at a second or so; raising it makes games
 * actually finish — at 3000 about half of them produce a winner — which is
 * worth doing locally now and then to exercise the endgame.
 */
const MAX_ACTIONS = Number(process.env['FUZZ_MAX_ACTIONS'] ?? 400);
/** The legal/validate property is quadratic-ish, so it runs on a sample of states. */
const PROPERTY_EVERY = 40;

interface Move {
  readonly playerId: PlayerId;
  readonly action: Action;
}

/**
 * A discard is a combination of cards, not a spot on the board, so legal.ts
 * does not enumerate it and the fuzzer builds one instead: the hand laid out
 * card by card, shuffled with the *test* RNG, and the first floor(n/2) taken.
 * Legal by construction, and a different one on every run.
 */
const randomDiscard = (
  state: ReadonlyGameState,
  playerId: PlayerId,
  owed: number,
  rng: RngState,
): { cards: Partial<ResourceBundle>; rng: RngState } => {
  const player = state.players.find((candidate) => candidate.id === playerId);
  const hand: Resource[] = [];
  for (const resource of RESOURCES) {
    for (let i = 0; i < (player?.resources[resource] ?? 0); i += 1) hand.push(resource);
  }

  const draw = shuffle(rng, hand);
  const cards: Partial<ResourceBundle> = {};
  for (const resource of draw.value.slice(0, owed)) {
    cards[resource] = (cards[resource] ?? 0) + 1;
  }
  return { cards, rng: draw.state };
};

/** Every move available to anyone right now, not just to the active player. */
const legalMoves = (state: ReadonlyGameState, rng: RngState): { moves: Move[]; rng: RngState } => {
  const phase = state.phase;

  // The discard is the one phase where players other than the active one act.
  if (phase.kind === 'discard') {
    let current = rng;
    const moves: Move[] = [];
    for (const [playerId, owed] of Object.entries(phase.pending)) {
      const built = randomDiscard(state, playerId, owed, current);
      current = built.rng;
      moves.push({ playerId, action: { type: 'discard', cards: built.cards } });
    }
    return { moves, rng: current };
  }

  const playerId = state.currentPlayer;
  const actions: Action[] = [
    ...legalSettlementSpots(state, playerId).map((vertex): Action => ({
      type: 'placeSettlement',
      vertex,
    })),
    ...legalRoadSpots(state, playerId).map((edge): Action => ({ type: 'placeRoad', edge })),
    ...legalCitySpots(state, playerId).map((vertex): Action => ({ type: 'upgradeCity', vertex })),
    ...legalRobberHexes(state, playerId).map((hex): Action => ({ type: 'moveRobber', hex })),
    ...legalStealTargets(state, playerId).map((target): Action => ({ type: 'steal', target })),
  ];
  if (phase.kind === 'preRoll') actions.push({ type: 'rollDice' });
  if (phase.kind === 'main') actions.push({ type: 'endTurn' });

  return { moves: actions.map((action) => ({ playerId, action })), rng };
};

const checkInvariants = (state: ReadonlyGameState, context: string): void => {
  // 1. Every card is somewhere: bank plus hands is always 19 per resource.
  for (const resource of RESOURCES) {
    const held = state.players.reduce((sum, player) => sum + player.resources[resource], 0);
    expect(`${resource}: ${state.bank[resource] + held}`, context).toBe(
      `${resource}: ${BANK_RESOURCE_COUNT}`,
    );
    // 3. And nothing went negative anywhere.
    expect(state.bank[resource] >= 0, `${context} — bank ${resource}`).toBe(true);
    for (const player of state.players) {
      expect(player.resources[resource] >= 0, `${context} — ${player.id} ${resource}`).toBe(true);
    }
  }

  // 2. Pieces: what is in stock plus what is on the board equals the starting set.
  for (const player of state.players) {
    let settlements = 0;
    let cities = 0;
    for (const vertex of state.board.vertexIds) {
      const building = state.buildings[vertex];
      if (building?.owner !== player.id) continue;
      if (building.type === 'city') cities += 1;
      else settlements += 1;
    }
    const roads = Object.values(state.roads).filter((owner) => owner === player.id).length;

    expect(player.stock.settlements + settlements, `${context} — settlements`).toBe(
      PIECE_STOCK.settlements,
    );
    expect(player.stock.cities + cities, `${context} — cities`).toBe(PIECE_STOCK.cities);
    expect(player.stock.roads + roads, `${context} — roads`).toBe(PIECE_STOCK.roads);

    // 6. Points follow from what is on the board.
    expect(victoryPoints(state, player.id), `${context} — points`).toBe(settlements + cities * 2);
  }

  // 4. The distance rule holds across the whole board, not just where the last
  // piece went down.
  for (const vertex of state.board.vertexIds) {
    if (state.buildings[vertex] === undefined) continue;
    const neighbors = state.board.vertices[vertex]?.neighbors ?? [];
    for (const neighbor of neighbors) {
      expect(state.buildings[neighbor], `${context} — distance at ${vertex}`).toBeUndefined();
    }
  }

  // 5. Every road touches its owner's network. Local on purpose: a rival
  // settlement may split a network without making it illegal.
  expect(everyRoadTouchesOwnNetwork(state), `${context} — road connectivity`).toBe(true);

  // 7. The robber is always on a hex that exists.
  expect(state.board.hexes[state.robberHex], `${context} — robber hex`).toBeDefined();
};

const handOf = (state: ReadonlyGameState, playerId: PlayerId): Readonly<ResourceBundle> => {
  const player = state.players.find((candidate) => candidate.id === playerId);
  if (!player) throw new Error(`no player ${playerId}`);
  return player.resources;
};

const handSize = (state: ReadonlyGameState, playerId: PlayerId): number =>
  RESOURCES.reduce((total, resource) => total + handOf(state, playerId)[resource], 0);

/**
 * What one action was supposed to do, on top of the standing invariants.
 *
 * 8. A discard takes exactly what was owed, and the cards go to the bank.
 * 9. A steal moves one card between two hands and never touches the bank.
 */
const checkMoveEffect = (
  before: ReadonlyGameState,
  after: ReadonlyGameState,
  move: Move,
  context: string,
): void => {
  if (move.action.type === 'discard') {
    const owed = before.phase.kind === 'discard' ? (before.phase.pending[move.playerId] ?? 0) : 0;
    expect(handSize(after, move.playerId), `${context} — discarded exactly what was owed`).toBe(
      handSize(before, move.playerId) - owed,
    );
    const bankBefore = RESOURCES.reduce((sum, resource) => sum + before.bank[resource], 0);
    const bankAfter = RESOURCES.reduce((sum, resource) => sum + after.bank[resource], 0);
    expect(bankAfter, `${context} — discards go back to the bank`).toBe(bankBefore + owed);
  }

  if (move.action.type === 'steal') {
    const victim = move.action.target;
    expect(after.bank, `${context} — a steal does not touch the bank`).toEqual(before.bank);
    expect(handSize(after, move.playerId), `${context} — thief gains one`).toBe(
      handSize(before, move.playerId) + 1,
    );
    expect(handSize(after, victim), `${context} — victim loses one`).toBe(
      handSize(before, victim) - 1,
    );
  }
};

const checkLegalMatchesValidate = (state: ReadonlyGameState, playerId: PlayerId): void => {
  const settlements = new Set(legalSettlementSpots(state, playerId));
  for (const vertex of state.board.vertexIds) {
    const action: Action = { type: 'placeSettlement', vertex };
    expect(settlements.has(vertex)).toBe(applyAction(state, playerId, action).ok);
  }

  const cities = new Set(legalCitySpots(state, playerId));
  for (const vertex of state.board.vertexIds) {
    const action: Action = { type: 'upgradeCity', vertex };
    expect(cities.has(vertex)).toBe(applyAction(state, playerId, action).ok);
  }

  const roads = new Set(legalRoadSpots(state, playerId));
  for (const edge of state.board.edgeIds) {
    const action: Action = { type: 'placeRoad', edge };
    expect(roads.has(edge)).toBe(applyAction(state, playerId, action).ok);
  }

  const hexes = new Set(legalRobberHexes(state, playerId));
  for (const hex of state.board.hexIds) {
    const action: Action = { type: 'moveRobber', hex };
    expect(hexes.has(hex)).toBe(applyAction(state, playerId, action).ok);
  }

  const targets = new Set(legalStealTargets(state, playerId));
  for (const player of state.players) {
    const action: Action = { type: 'steal', target: player.id };
    expect(targets.has(player.id)).toBe(applyAction(state, playerId, action).ok);
  }
};

interface PlayedGame {
  readonly seed: number;
  readonly actions: { playerId: PlayerId; action: Action }[];
  readonly final: ReadonlyGameState;
  readonly stoppedBecause: 'gameOver' | 'actionLimit';
}

const playRandomGame = (seed: number, fuzzState: RngState): { game: PlayedGame; rng: RngState } => {
  let rng = fuzzState;
  let state = createGame(seed, SEATS);
  const actions: PlayedGame['actions'] = [];
  let stoppedBecause: PlayedGame['stoppedBecause'] = 'actionLimit';

  for (let step = 0; step < MAX_ACTIONS; step += 1) {
    if (state.phase.kind === 'gameOver') {
      stoppedBecause = 'gameOver';
      break;
    }

    const built = legalMoves(state, rng);
    rng = built.rng;
    const options: Move[] = built.moves;
    // Nobody anywhere having a legal action means the engine has deadlocked.
    expect(options.length, `no legal move at step ${step} of seed ${seed}`).toBeGreaterThan(0);

    const draw = nextInt(rng, options.length);
    rng = draw.state;
    const { playerId, action } = at(options, draw.value);

    const result = applyAction(state, playerId, action);
    if (!result.ok) throw new Error(`legal action ${action.type} rejected: ${result.error}`);

    const context = `seed ${seed}, step ${step}, after ${action.type}`;
    checkMoveEffect(state, result.state, { playerId, action }, context);
    state = result.state;
    actions.push({ playerId, action });

    checkInvariants(state, context);
    if (step % PROPERTY_EVERY === 0) checkLegalMatchesValidate(state, state.currentPlayer);
  }

  return { game: { seed, actions, final: state, stoppedBecause }, rng };
};

/** Compares two states ignoring the board, which is shared by reference. */
const withoutBoard = (state: ReadonlyGameState) => ({ ...state, board: undefined });

describe('fuzzing random games', () => {
  const games: PlayedGame[] = [];

  // Playing happens here rather than at collection time, so the work shows up
  // as test time and a failure points at the run that caused it.
  beforeAll(
    () => {
      let rng = createRng(0xfa22);
      for (let index = 0; index < FUZZ_GAMES; index += 1) {
        const draw = nextInt(rng, 0xffffff);
        rng = draw.state;
        const played = playRandomGame(draw.value, rng);
        rng = played.rng;
        games.push(played.game);
      }
      // The default hook timeout is 10s, which a turned-up FUZZ_GAMES or
      // FUZZ_MAX_ACTIONS blows past. Scale with both, generously.
    },
    Math.max(30_000, FUZZ_GAMES * MAX_ACTIONS * 3),
  );

  it(`plays ${FUZZ_GAMES} games without breaking an invariant`, () => {
    expect(games).toHaveLength(FUZZ_GAMES);
    expect(games.every((game) => game.actions.length > 0)).toBe(true);
  });

  it('gets through the whole setup in every game', () => {
    for (const game of games) {
      const setupActions = SEATS.length * 4;
      expect(game.actions.length).toBeGreaterThanOrEqual(setupActions);
      expect(
        game.actions
          .slice(0, setupActions)
          .every(({ action }) => ['placeSettlement', 'placeRoad'].includes(action.type)),
      ).toBe(true);
    }
  });

  it('replays exactly from the seed and the list of actions', () => {
    for (const game of games) {
      let state = createGame(game.seed, SEATS);
      for (const { playerId, action } of game.actions) {
        const result = applyAction(state, playerId, action);
        if (!result.ok) throw new Error(`replay diverged: ${action.type} → ${result.error}`);
        state = result.state;
      }
      expect(withoutBoard(state)).toEqual(withoutBoard(game.final));
      // A separate generateBoard run, so identical rather than identical-by-
      // reference; within one game the board is shared (see setup.test.ts).
      expect(state.board).toEqual(game.final.board);
    }
  });

  it('may get stuck without trade, which is not an error', () => {
    // Random play with no trading rarely finishes inside the action limit. The
    // robber redistributes cards but does not unstick a game on its own; that
    // is what M4 is for.
    const stuck = games.filter((game) => game.stoppedBecause === 'actionLimit');
    expect(stuck.length).toBeGreaterThanOrEqual(0);
  });
});

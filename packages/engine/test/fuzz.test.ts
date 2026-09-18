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
  legalSettlementSpots,
  nextInt,
  victoryPoints,
  type Action,
  type PlayerId,
  type ReadonlyGameState,
  type RngState,
} from '../src/index.js';
import { SEATS, at, everyRoadTouchesOwnNetwork } from './helpers.js';

/**
 * Random games, checked after every single action.
 *
 * The fuzzer's randomness is its own: `createRng` seeded separately from the
 * game, so shuffling the fuzzer never disturbs a game's dice.
 *
 * Without trade or the robber, games get stuck — nobody can afford anything and
 * every turn is roll-and-pass. That is expected, not a failure: the run stops
 * after MAX_ACTIONS. What *is* a failure is having no legal action at all,
 * which would mean the engine deadlocked.
 *
 * FUZZ_GAMES tunes how many games to play; CI runs the default in a couple of
 * seconds, and locally it is worth turning up.
 */

const FUZZ_GAMES = Number(process.env['FUZZ_GAMES'] ?? 25);
const MAX_ACTIONS = 400;
/** The legal/validate property is quadratic-ish, so it runs on a sample of states. */
const PROPERTY_EVERY = 40;

const legalActions = (state: ReadonlyGameState, playerId: PlayerId): Action[] => {
  const actions: Action[] = [
    ...legalSettlementSpots(state, playerId).map((vertex): Action => ({
      type: 'placeSettlement',
      vertex,
    })),
    ...legalRoadSpots(state, playerId).map((edge): Action => ({ type: 'placeRoad', edge })),
    ...legalCitySpots(state, playerId).map((vertex): Action => ({ type: 'upgradeCity', vertex })),
  ];
  if (state.phase.kind === 'preRoll') actions.push({ type: 'rollDice' });
  if (state.phase.kind === 'main') actions.push({ type: 'endTurn' });
  return actions;
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

    const playerId = state.currentPlayer;
    const options = legalActions(state, playerId);
    // No legal action at all means the engine has deadlocked: that *is* a bug.
    expect(options.length, `no legal action at step ${step} of seed ${seed}`).toBeGreaterThan(0);

    const draw = nextInt(rng, options.length);
    rng = draw.state;
    const action = at(options, draw.value);

    const result = applyAction(state, playerId, action);
    if (!result.ok) throw new Error(`legal action ${action.type} rejected: ${result.error}`);
    state = result.state;
    actions.push({ playerId, action });

    checkInvariants(state, `seed ${seed}, step ${step}, after ${action.type}`);
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
  beforeAll(() => {
    let rng = createRng(0xfa22);
    for (let index = 0; index < FUZZ_GAMES; index += 1) {
      const draw = nextInt(rng, 0xffffff);
      rng = draw.state;
      const played = playRandomGame(draw.value, rng);
      rng = played.rng;
      games.push(played.game);
    }
  });

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

  it('may get stuck without trade or the robber, which is not an error', () => {
    const stuck = games.filter((game) => game.stoppedBecause === 'actionLimit');
    expect(stuck.length).toBeGreaterThanOrEqual(0);
  });
});

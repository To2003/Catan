import { describe, expect, it } from 'vitest';
import {
  BANK_RESOURCE_COUNT,
  PIECE_STOCK,
  RESOURCES,
  applyAction,
  legalRoadSpots,
  legalSettlementSpots,
  type ReadonlyGameState,
} from '../src/index.js';
import {
  ANA,
  BRUNO,
  CATA,
  SEATS,
  at,
  applyOrThrow,
  deepFreeze,
  newGame,
  runSetup,
  totalOf,
} from './helpers.js';

const placeSettlement = (state: ReadonlyGameState) =>
  applyOrThrow(state, state.currentPlayer, {
    type: 'placeSettlement',
    vertex: at(legalSettlementSpots(state, state.currentPlayer), 0),
  });

const placeRoad = (state: ReadonlyGameState) =>
  applyOrThrow(state, state.currentPlayer, {
    type: 'placeRoad',
    edge: at(legalRoadSpots(state, state.currentPlayer), 0),
  });

describe('applyAction: purity', () => {
  it('never mutates the state it was given', () => {
    const game = deepFreeze(newGame());
    const before = structuredClone({ ...game, board: undefined });

    const result = applyAction(game, game.currentPlayer, {
      type: 'placeSettlement',
      vertex: at(legalSettlementSpots(game, game.currentPlayer), 0),
    });

    expect(result.ok).toBe(true);
    expect({ ...game, board: undefined }).toEqual(before);
  });

  it('bumps the version on every applied action, and not on a rejected one', () => {
    const game = newGame();
    const { state } = placeSettlement(game);
    expect(state.version).toBe(game.version + 1);

    const rejected = applyAction(state, state.currentPlayer, { type: 'rollDice' });
    expect(rejected).toEqual({ ok: false, error: 'WRONG_PHASE' });
  });

  it('shares the board by reference instead of cloning it', () => {
    const game = newGame();
    const { state } = placeSettlement(game);
    expect(state.board).toBe(game.board);
  });
});

describe('setup: the snake', () => {
  it('runs 1..N and then N..1, two placements each', () => {
    let state = newGame();
    const order = state.turnOrder;
    const seen: string[] = [];

    while (state.phase.kind === 'setup') {
      seen.push(state.currentPlayer);
      state = placeSettlement(state).state;
      state = placeRoad(state).state;
    }

    expect(seen).toEqual([...order, ...[...order].reverse()]);
  });

  it('has the last player place twice in a row at the turnaround', () => {
    let state = newGame();
    const last = at(state.turnOrder, state.turnOrder.length - 1);

    while (state.currentPlayer !== last) {
      state = placeSettlement(state).state;
      state = placeRoad(state).state;
    }

    state = placeSettlement(state).state;
    state = placeRoad(state).state;
    expect(state.currentPlayer).toBe(last);
    expect(state.phase).toEqual({ kind: 'setup', round: 2, step: 'settlement' });
  });

  it('works with three players too', () => {
    const state = runSetup(newGame(20260918, [ANA, BRUNO, CATA]));
    expect(Object.keys(state.buildings)).toHaveLength(6);
    expect(Object.keys(state.roads)).toHaveLength(6);
  });

  it('ends in preRoll with the first player of the order', () => {
    const state = runSetup();
    expect(state.phase).toEqual({ kind: 'preRoll' });
    expect(state.currentPlayer).toBe(at(state.turnOrder, 0));
  });

  it('leaves every player with two settlements, two roads and the rest in stock', () => {
    const state = runSetup();
    expect(Object.keys(state.buildings)).toHaveLength(SEATS.length * 2);
    expect(Object.keys(state.roads)).toHaveLength(SEATS.length * 2);

    for (const player of state.players) {
      expect(player.stock.settlements).toBe(PIECE_STOCK.settlements - 2);
      expect(player.stock.roads).toBe(PIECE_STOCK.roads - 2);
      expect(player.stock.cities).toBe(PIECE_STOCK.cities);
    }
  });
});

describe('setup: the road leaves the settlement just placed', () => {
  it('records lastSettlement and only accepts its edges', () => {
    const game = newGame();
    const { state } = placeSettlement(game);
    expect(state.phase).toMatchObject({ kind: 'setup', round: 1, step: 'road' });

    const vertex = state.phase.kind === 'setup' ? state.phase.lastSettlement : undefined;
    expect(vertex).toBeDefined();

    const allowed = new Set(state.board.vertices[vertex ?? 'v0']?.edges ?? []);
    expect(legalRoadSpots(state, state.currentPlayer).every((edge) => allowed.has(edge))).toBe(
      true,
    );
  });

  it('does not let the second road hang off the first settlement', () => {
    let state = newGame();
    const player = state.currentPlayer;

    // Round 1 for this player.
    state = placeSettlement(state).state;
    const firstSettlement = state.phase.kind === 'setup' ? state.phase.lastSettlement : undefined;
    state = placeRoad(state).state;

    // Walk the snake back to the same player, now in round 2.
    while (state.currentPlayer !== player || state.phase.kind !== 'setup') {
      state = placeSettlement(state).state;
      state = placeRoad(state).state;
    }
    state = placeSettlement(state).state;

    const firstEdges = new Set(state.board.vertices[firstSettlement ?? 'v0']?.edges ?? []);
    const free = [...firstEdges].filter((edge) => state.roads[edge] === undefined);
    expect(free.length).toBeGreaterThan(0);

    for (const edge of free) {
      expect(applyAction(state, player, { type: 'placeRoad', edge })).toEqual({
        ok: false,
        error: 'NOT_CONNECTED',
      });
    }
  });
});

describe('setup: the second settlement pays out', () => {
  it('grants one resource per adjacent producing hex, and only in round 2', () => {
    let state = newGame();

    const first = placeSettlement(state);
    expect(first.events.some((event) => event.type === 'SetupResourcesGranted')).toBe(false);
    for (const player of first.state.players) {
      expect(RESOURCES.every((resource) => player.resources[resource] === 0)).toBe(true);
    }

    state = first.state;
    while (state.phase.kind === 'setup' && state.phase.round === 1) {
      state =
        state.phase.step === 'settlement' ? placeSettlement(state).state : placeRoad(state).state;
    }

    const second = placeSettlement(state);
    const granted = second.events.find((event) => event.type === 'SetupResourcesGranted');
    expect(granted).toBeDefined();

    const vertex =
      second.state.phase.kind === 'setup' ? second.state.phase.lastSettlement : undefined;
    const producing = (second.state.board.vertices[vertex ?? 'v0']?.hexes ?? []).filter(
      (hex) =>
        hex !== second.state.robberHex && second.state.board.hexes[hex]?.terrain !== 'desert',
    );

    const player = second.state.players.find((p) => p.id === second.state.currentPlayer);
    const total = RESOURCES.reduce((sum, resource) => sum + (player?.resources[resource] ?? 0), 0);
    expect(total).toBe(producing.length);
  });

  it('takes what it grants out of the bank', () => {
    const state = runSetup();
    for (const resource of RESOURCES) expect(totalOf(state, resource)).toBe(BANK_RESOURCE_COUNT);
  });
});

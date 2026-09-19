import { describe, expect, it } from 'vitest';
import {
  COSTS,
  RESOURCES,
  legalMaritimeTrades,
  legalCitySpots,
  legalRoadSpots,
  legalRobberHexes,
  legalSettlementSpots,
  legalStealTargets,
  validateAction,
  type PlayerId,
  type ReadonlyGameState,
} from '../src/index.js';
import { ANA, BRUNO, at, draft, give, newGame } from './helpers.js';

const game = newGame();
const board = game.board;

/**
 * The property that keeps legal.ts and validate.ts from drifting apart: for
 * every candidate on the board, being in the legal list and being accepted by
 * validate are the same thing. It looks tautological because legal.ts is
 * *defined* by validate.ts — and that is exactly what it guards: the day
 * somebody restates a rule here to make it faster, this fails.
 *
 * The fuzz test replays it over real mid-game states; these are hand-built
 * positions that pin the interesting corners.
 */
export const expectLegalMatchesValidate = (state: ReadonlyGameState, playerId: PlayerId): void => {
  const settlements = new Set(legalSettlementSpots(state, playerId));
  for (const vertex of board.vertexIds) {
    const accepted = validateAction(state, playerId, { type: 'placeSettlement', vertex }) === null;
    expect(settlements.has(vertex)).toBe(accepted);
  }

  const cities = new Set(legalCitySpots(state, playerId));
  for (const vertex of board.vertexIds) {
    const accepted = validateAction(state, playerId, { type: 'upgradeCity', vertex }) === null;
    expect(cities.has(vertex)).toBe(accepted);
  }

  const roads = new Set(legalRoadSpots(state, playerId));
  for (const edge of board.edgeIds) {
    const accepted = validateAction(state, playerId, { type: 'placeRoad', edge }) === null;
    expect(roads.has(edge)).toBe(accepted);
  }

  const hexes = new Set(legalRobberHexes(state, playerId));
  for (const hex of board.hexIds) {
    const accepted = validateAction(state, playerId, { type: 'moveRobber', hex }) === null;
    expect(hexes.has(hex)).toBe(accepted);
  }

  const targets = new Set(legalStealTargets(state, playerId));
  for (const player of state.players) {
    const accepted = validateAction(state, playerId, { type: 'steal', target: player.id }) === null;
    expect(targets.has(player.id)).toBe(accepted);
  }

  const trades = new Set(
    legalMaritimeTrades(state, playerId).map((trade) => `${trade.give}->${trade.want}`),
  );
  for (const give of RESOURCES) {
    for (const want of RESOURCES) {
      const accepted =
        validateAction(state, playerId, { type: 'maritimeTrade', give, want }) === null;
      expect(trades.has(`${give}->${want}`)).toBe(accepted);
    }
  }
};

const firstEdge = at(board.edgeIds, 10);
const firstEdgeVertices = board.edges[firstEdge]?.vertices ?? [];

const positions: Record<string, ReadonlyGameState> = {
  'opening setup': game,

  'setup road step': draft(game, (s) => {
    s.currentPlayer = ANA.id;
    s.buildings[at(firstEdgeVertices, 0)] = { owner: ANA.id, type: 'settlement' };
    s.phase = {
      kind: 'setup',
      round: 1,
      step: 'road',
      lastSettlement: at(firstEdgeVertices, 0),
    };
  }),

  'main phase, nothing built, no resources': draft(game, (s) => {
    s.currentPlayer = ANA.id;
    s.phase = { kind: 'main' };
  }),

  'main phase, a network and a full hand': draft(game, (s) => {
    s.currentPlayer = ANA.id;
    s.phase = { kind: 'main' };
    s.buildings[at(firstEdgeVertices, 0)] = { owner: ANA.id, type: 'settlement' };
    s.buildings[at(firstEdgeVertices, 1)] = { owner: BRUNO.id, type: 'settlement' };
    s.roads[firstEdge] = ANA.id;
    give(s, ANA.id, { wood: 5, brick: 5, sheep: 5, wheat: 5, ore: 5 });
  }),

  'main phase, a harbour and a payable hand': draft(game, (s) => {
    s.currentPlayer = ANA.id;
    s.phase = { kind: 'main' };
    const port = board.vertexIds.find((vertex) => board.vertices[vertex]?.port === '3:1');
    if (port) s.buildings[port] = { owner: ANA.id, type: 'city' };
    give(s, ANA.id, { wood: 3, ore: 1 });
  }),

  'moving the robber': draft(game, (s) => {
    s.currentPlayer = ANA.id;
    s.phase = { kind: 'moveRobber', source: 'seven', returnTo: 'main' };
  }),

  'choosing a victim': draft(game, (s) => {
    s.currentPlayer = ANA.id;
    s.phase = { kind: 'steal', candidates: [BRUNO.id], returnTo: 'main' };
    give(s, BRUNO.id, { wood: 1 });
  }),

  'main phase, out of pieces': draft(game, (s) => {
    s.currentPlayer = ANA.id;
    s.phase = { kind: 'main' };
    s.roads[firstEdge] = ANA.id;
    give(s, ANA.id, COSTS.settlement);
    at(s.players, 0).stock.settlements = 0;
    at(s.players, 0).stock.roads = 0;
  }),
};

describe('legal moves mirror validation', () => {
  for (const [name, state] of Object.entries(positions)) {
    it(`holds in: ${name}`, () => {
      expectLegalMatchesValidate(state, state.currentPlayer);
    });

    it(`holds for a waiting player in: ${name}`, () => {
      const waiting = state.players.find((player) => player.id !== state.currentPlayer);
      expectLegalMatchesValidate(state, waiting?.id ?? 'nobody');
    });
  }

  it('offers no move at all to a player who is not on turn', () => {
    const waiting = game.players.find((player) => player.id !== game.currentPlayer);
    const id = waiting?.id ?? 'nobody';
    expect(legalSettlementSpots(game, id)).toEqual([]);
    expect(legalRoadSpots(game, id)).toEqual([]);
    expect(legalCitySpots(game, id)).toEqual([]);
  });

  it('offers every free vertex at the opening, and no road or city', () => {
    expect(legalSettlementSpots(game, game.currentPlayer)).toHaveLength(board.vertexIds.length);
    expect(legalRoadSpots(game, game.currentPlayer)).toEqual([]);
    expect(legalCitySpots(game, game.currentPlayer)).toEqual([]);
  });
});

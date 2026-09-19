import { describe, expect, it } from 'vitest';
import {
  COSTS,
  validateAction,
  type EdgeId,
  type GameState,
  type ReadonlyGameState,
  type VertexId,
} from '../src/index.js';
import { ANA, BRUNO, at, draft, give, newGame } from './helpers.js';

const game = newGame();
const board = game.board;

const edgeVertices = (edge: EdgeId): readonly VertexId[] => {
  const link = board.edges[edge];
  if (!link) throw new Error(`no edge ${edge}`);
  return link.vertices;
};

const vertexEdges = (vertex: VertexId): readonly EdgeId[] => {
  const node = board.vertices[vertex];
  if (!node) throw new Error(`no vertex ${vertex}`);
  return node.edges;
};

/** Two distinct edges meeting at one vertex, plus the far endpoint of the second. */
const junction = (() => {
  const vertex = board.vertexIds.find((id) => vertexEdges(id).length >= 2);
  if (!vertex) throw new Error('no vertex with two edges');
  const first = at(vertexEdges(vertex), 0);
  const second = at(vertexEdges(vertex), 1);
  const [a, b] = [at(edgeVertices(second), 0), at(edgeVertices(second), 1)];
  return { vertex, first, second, farOfSecond: a === vertex ? b : a };
})();

/** A state in the main phase with Ana to move. */
const mainState = (mutate: (draft: GameState) => void = () => {}): ReadonlyGameState =>
  draft(game, (s) => {
    s.phase = { kind: 'main' };
    s.currentPlayer = ANA.id;
    mutate(s);
  });

describe('validateAction: turn and phase gates', () => {
  it('rejects a player who is not the active one', () => {
    const waiting = game.players.find((player) => player.id !== game.currentPlayer);
    expect(waiting).toBeDefined();
    expect(validateAction(game, waiting?.id ?? '', { type: 'placeSettlement', vertex: 'v0' })).toBe(
      'NOT_YOUR_TURN',
    );
  });

  it('rejects an unknown player', () => {
    expect(validateAction(game, 'nobody', { type: 'rollDice' })).toBe('INVALID_TARGET');
  });

  it('rejects rolling and ending the turn during setup', () => {
    const active = game.currentPlayer;
    expect(validateAction(game, active, { type: 'rollDice' })).toBe('WRONG_PHASE');
    expect(validateAction(game, active, { type: 'endTurn' })).toBe('WRONG_PHASE');
  });

  it('rejects everything once the game is over', () => {
    const over = draft(game, (s) => {
      s.phase = { kind: 'gameOver', winner: ANA.id };
    });
    expect(validateAction(over, over.currentPlayer, { type: 'endTurn' })).toBe('GAME_OVER');
  });

  it('reports actions whose milestone has not landed as NOT_IMPLEMENTED', () => {
    const state = mainState();
    // The five player-to-player trade actions are M7; trade.test.ts pins the
    // list exactly.
    expect(validateAction(state, ANA.id, { type: 'cancelOffer', offerId: 'x' })).toBe(
      'NOT_IMPLEMENTED',
    );
  });
});

describe('validateAction: settlements', () => {
  const active = game.currentPlayer;

  it('allows any free vertex during setup, with no road and no payment', () => {
    expect(validateAction(game, active, { type: 'placeSettlement', vertex: 'v0' })).toBeNull();
  });

  it('rejects an unknown vertex', () => {
    expect(validateAction(game, active, { type: 'placeSettlement', vertex: 'v999' })).toBe(
      'INVALID_TARGET',
    );
  });

  it('rejects an occupied vertex', () => {
    const state = draft(game, (s) => {
      s.buildings['v0'] = { owner: BRUNO.id, type: 'settlement' };
    });
    expect(validateAction(state, active, { type: 'placeSettlement', vertex: 'v0' })).toBe(
      'OCCUPIED',
    );
  });

  it('enforces the distance rule against anyone, including in setup', () => {
    const neighbor = at(board.vertices['v0']?.neighbors ?? [], 0);
    const state = draft(game, (s) => {
      s.buildings[neighbor] = { owner: BRUNO.id, type: 'settlement' };
    });
    expect(validateAction(state, active, { type: 'placeSettlement', vertex: 'v0' })).toBe(
      'DISTANCE_RULE',
    );
  });

  it('requires an own road outside setup', () => {
    const state = mainState((s) => {
      give(s, ANA.id, COSTS.settlement);
    });
    expect(
      validateAction(state, ANA.id, { type: 'placeSettlement', vertex: junction.vertex }),
    ).toBe('NOT_CONNECTED');
  });

  it('accepts a connected vertex and rejects it without the resources', () => {
    const connected = (paid: boolean): ReadonlyGameState =>
      mainState((s) => {
        s.roads[junction.first] = ANA.id;
        if (paid) give(s, ANA.id, COSTS.settlement);
      });

    expect(
      validateAction(connected(true), ANA.id, {
        type: 'placeSettlement',
        vertex: junction.vertex,
      }),
    ).toBeNull();
    expect(
      validateAction(connected(false), ANA.id, {
        type: 'placeSettlement',
        vertex: junction.vertex,
      }),
    ).toBe('INSUFFICIENT_RESOURCES');
  });

  it('rejects a settlement with no pieces left', () => {
    const state = mainState((s) => {
      s.roads[junction.first] = ANA.id;
      give(s, ANA.id, COSTS.settlement);
      at(s.players, 0).stock.settlements = 0;
    });
    expect(
      validateAction(state, ANA.id, { type: 'placeSettlement', vertex: junction.vertex }),
    ).toBe('NOT_ENOUGH_PIECES');
  });
});

describe('validateAction: setup roads', () => {
  it('must start from the settlement just placed, not from another own one', () => {
    const otherEdge = board.edgeIds.find((id) => !edgeVertices(id).includes(junction.vertex));
    if (!otherEdge) throw new Error('no unrelated edge');

    const state = draft(game, (s) => {
      s.phase = { kind: 'setup', round: 1, step: 'road', lastSettlement: junction.vertex };
      s.currentPlayer = ANA.id;
      // An earlier settlement of Ana's elsewhere on the board must not help.
      s.buildings[at(edgeVertices(otherEdge), 0)] = { owner: ANA.id, type: 'settlement' };
    });

    expect(validateAction(state, ANA.id, { type: 'placeRoad', edge: junction.first })).toBeNull();
    expect(validateAction(state, ANA.id, { type: 'placeRoad', edge: otherEdge })).toBe(
      'NOT_CONNECTED',
    );
  });
});

describe('validateAction: roads outside setup', () => {
  const road = (mutate: (draft: GameState) => void): ReadonlyGameState =>
    mainState((s) => {
      give(s, ANA.id, COSTS.road);
      mutate(s);
    });

  it('rejects a road that touches nothing of its own', () => {
    expect(
      validateAction(
        road(() => {}),
        ANA.id,
        { type: 'placeRoad', edge: junction.second },
      ),
    ).toBe('NOT_CONNECTED');
  });

  it('rejects an occupied edge', () => {
    const state = road((s) => {
      s.roads[junction.second] = BRUNO.id;
    });
    expect(validateAction(state, ANA.id, { type: 'placeRoad', edge: junction.second })).toBe(
      'OCCUPIED',
    );
  });

  it('accepts a road extending an own road', () => {
    const state = road((s) => {
      s.roads[junction.first] = ANA.id;
    });
    expect(validateAction(state, ANA.id, { type: 'placeRoad', edge: junction.second })).toBeNull();
  });

  it('rejects a road whose only link runs through a rival building', () => {
    const state = road((s) => {
      s.roads[junction.first] = ANA.id;
      s.buildings[junction.vertex] = { owner: BRUNO.id, type: 'settlement' };
    });
    expect(validateAction(state, ANA.id, { type: 'placeRoad', edge: junction.second })).toBe(
      'NOT_CONNECTED',
    );
  });

  it('accepts it anyway when the other endpoint carries an own building', () => {
    const state = road((s) => {
      s.roads[junction.first] = ANA.id;
      s.buildings[junction.vertex] = { owner: BRUNO.id, type: 'settlement' };
      s.buildings[junction.farOfSecond] = { owner: ANA.id, type: 'settlement' };
    });
    expect(validateAction(state, ANA.id, { type: 'placeRoad', edge: junction.second })).toBeNull();
  });

  it('rejects a road with no pieces left', () => {
    const state = road((s) => {
      s.roads[junction.first] = ANA.id;
      at(s.players, 0).stock.roads = 0;
    });
    expect(validateAction(state, ANA.id, { type: 'placeRoad', edge: junction.second })).toBe(
      'NOT_ENOUGH_PIECES',
    );
  });
});

describe('validateAction: cities', () => {
  const city = (mutate: (draft: GameState) => void = () => {}): ReadonlyGameState =>
    mainState((s) => {
      give(s, ANA.id, COSTS.city);
      mutate(s);
    });

  it('rejects an empty vertex', () => {
    expect(validateAction(city(), ANA.id, { type: 'upgradeCity', vertex: 'v0' })).toBe(
      'NO_SETTLEMENT',
    );
  });

  it("rejects somebody else's settlement", () => {
    const state = city((s) => {
      s.buildings['v0'] = { owner: BRUNO.id, type: 'settlement' };
    });
    expect(validateAction(state, ANA.id, { type: 'upgradeCity', vertex: 'v0' })).toBe('NOT_OWNER');
  });

  it('rejects a vertex that already holds a city', () => {
    const state = city((s) => {
      s.buildings['v0'] = { owner: ANA.id, type: 'city' };
    });
    expect(validateAction(state, ANA.id, { type: 'upgradeCity', vertex: 'v0' })).toBe(
      'ALREADY_CITY',
    );
  });

  it('accepts an own settlement, and rejects it without the resources', () => {
    const state = city((s) => {
      s.buildings['v0'] = { owner: ANA.id, type: 'settlement' };
    });
    expect(validateAction(state, ANA.id, { type: 'upgradeCity', vertex: 'v0' })).toBeNull();

    const broke = mainState((s) => {
      s.buildings['v0'] = { owner: ANA.id, type: 'settlement' };
    });
    expect(validateAction(broke, ANA.id, { type: 'upgradeCity', vertex: 'v0' })).toBe(
      'INSUFFICIENT_RESOURCES',
    );
  });

  it('rejects an upgrade with no city pieces left', () => {
    const state = city((s) => {
      s.buildings['v0'] = { owner: ANA.id, type: 'settlement' };
      at(s.players, 0).stock.cities = 0;
    });
    expect(validateAction(state, ANA.id, { type: 'upgradeCity', vertex: 'v0' })).toBe(
      'NOT_ENOUGH_PIECES',
    );
  });
});

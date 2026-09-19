import { describe, expect, it } from 'vitest';
import {
  LONGEST_ROAD_MIN_LENGTH,
  applyAction,
  longestRoadLength,
  publicVictoryPoints,
  recomputeLongestRoad,
  type EdgeId,
  type GameState,
  type HexId,
  type ReadonlyGameState,
  type VertexId,
} from '../src/index.js';
import { ANA, BRUNO, CATA, at, applyOrThrow, draft, findFreePath, newGame } from './helpers.js';
import { bruteForceLongestRoad } from './longestRoadOracle.js';

const game = newGame();
const board = game.board;

/** An empty board with roads and buildings placed by hand. */
const position = (mutate: (draft: GameState) => void): ReadonlyGameState =>
  draft(game, (s) => {
    s.buildings = {};
    s.roads = {};
    s.phase = { kind: 'main' };
    s.currentPlayer = ANA.id;
    mutate(s);
  });

/** Every fixture is checked against the brute-force oracle as well. */
const expectLength = (state: ReadonlyGameState, playerId: string, length: number): void => {
  expect(longestRoadLength(state, playerId)).toBe(length);
  expect(bruteForceLongestRoad(state, playerId)).toBe(length);
};

const chainOf = (
  state: ReadonlyGameState,
  length: number,
): { edges: EdgeId[]; ends: VertexId[] } => {
  const start = at(board.vertexIds, 0);
  const path = findFreePath(state, start, length);
  if (!path) throw new Error(`no free path of ${length}`);
  return { edges: path.edges, ends: path.vertices };
};

/** Two hexes sharing an edge, and all 11 of their edges. */
const twoHexes = (): { edges: EdgeId[]; hexes: [HexId, HexId] } => {
  const shared = board.edgeIds.find((edge) => (board.edges[edge]?.hexes.length ?? 0) === 2);
  if (!shared) throw new Error('no interior edge');
  const [first, second] = board.edges[shared]?.hexes ?? [];
  if (!first || !second) throw new Error('interior edge without two hexes');

  const edges = new Set<EdgeId>([
    ...(board.hexes[first]?.edges ?? []),
    ...(board.hexes[second]?.edges ?? []),
  ]);
  return { edges: [...edges], hexes: [first, second] };
};

describe('measuring a route', () => {
  it('counts a straight chain', () => {
    const chain = chainOf(game, 5);
    const state = position((s) => {
      for (const edge of chain.edges) s.roads[edge] = ANA.id;
    });
    expectLength(state, ANA.id, 5);
  });

  it('counts the two longest branches of a Y, never all three', () => {
    // Branches of 3, 2 and 1 out of one junction: the best route runs up one
    // branch and down another, so 3 + 2 = 5, not 3 and not 6.
    const junction = board.vertexIds.find(
      (vertex) => (board.vertices[vertex]?.edges ?? []).length === 3,
    );
    if (!junction) throw new Error('no vertex of degree three');

    const state = position((s) => {
      const lengths = [3, 2, 1];
      const taken = new Set<EdgeId>();
      const branches = board.vertices[junction]?.edges ?? [];

      branches.forEach((first, index) => {
        const want = lengths[index] ?? 0;
        let vertex = junction;
        let edge: EdgeId | undefined = first;
        for (let step = 0; step < want; step += 1) {
          if (edge === undefined || taken.has(edge)) break;
          taken.add(edge);
          s.roads[edge] = ANA.id;
          const link = s.board.edges[edge];
          const [a, b] = link?.vertices ?? [vertex, vertex];
          vertex = a === vertex ? b : a;
          edge = (s.board.vertices[vertex]?.edges ?? []).find(
            (candidate) =>
              candidate !== edge && !taken.has(candidate) && s.roads[candidate] === undefined,
          );
        }
      });
    });

    expectLength(state, ANA.id, 5);
  });

  it('counts a ring of six, which has no ends at all', () => {
    const hex = at(board.hexIds, 9);
    const state = position((s) => {
      for (const edge of board.hexes[hex]?.edges ?? []) s.roads[edge] = ANA.id;
    });
    expectLength(state, ANA.id, 6);
  });

  it('counts eleven around two neighbouring hexes', () => {
    // Two hexes share an edge, so the figure is 6 + 6 - 1 = 11 roads, with two
    // vertices of degree three and the rest of degree two: an Eulerian trail
    // exists and uses all eleven.
    const { edges } = twoHexes();
    expect(edges).toHaveLength(11);

    const state = position((s) => {
      for (const edge of edges) s.roads[edge] = ANA.id;
    });
    expectLength(state, ANA.id, 11);
  });
});

describe('what a rival building does to a route', () => {
  it('lets a route end on one: the last road still counts', () => {
    const chain = chainOf(game, 5);
    const state = position((s) => {
      for (const edge of chain.edges) s.roads[edge] = ANA.id;
      // A rival settlement on the far end of the chain.
      s.buildings[at(chain.ends, chain.ends.length - 1)] = { owner: BRUNO.id, type: 'settlement' };
    });
    expectLength(state, ANA.id, 5);
  });

  it('splits a route when it sits in the middle', () => {
    const chain = chainOf(game, 5);
    const state = position((s) => {
      for (const edge of chain.edges) s.roads[edge] = ANA.id;
      // Third vertex along: two roads on one side, three on the other.
      s.buildings[at(chain.ends, 2)] = { owner: BRUNO.id, type: 'settlement' };
    });
    expectLength(state, ANA.id, 3);
  });

  it('is not cut by the owner’s own buildings', () => {
    const chain = chainOf(game, 5);
    const state = position((s) => {
      for (const edge of chain.edges) s.roads[edge] = ANA.id;
      s.buildings[at(chain.ends, 2)] = { owner: ANA.id, type: 'city' };
    });
    expectLength(state, ANA.id, 5);
  });
});

describe('handing the bonus around (SPEC §12.2)', () => {
  const withRoads = (assignment: Record<string, number>): ReadonlyGameState =>
    position((s) => {
      let cursor = 0;
      for (const [playerId, count] of Object.entries(assignment)) {
        // Each player gets a chain of their own, far from the others.
        const start = at(board.vertexIds, cursor);
        const path = findFreePath(s, start, count);
        if (!path) throw new Error(`no free path of ${count}`);
        for (const edge of path.edges) s.roads[edge] = playerId;
        cursor += 12;
      }
    });

  it('gives it to the first player to reach five', () => {
    const state = withRoads({ [ANA.id]: 5, [BRUNO.id]: 4 });
    const events: Parameters<typeof recomputeLongestRoad>[1] = [];
    const after = draft(state, (s) => {
      recomputeLongestRoad(s, events);
    });

    expect(after.longestRoad).toEqual({ owner: ANA.id, length: 5 });
    expect(events).toContainEqual({ type: 'LongestRoadChanged', owner: ANA.id, length: 5 });
    expect(publicVictoryPoints(after, ANA.id)).toBe(2);
  });

  it('leaves it vacant below five, however long the best road is', () => {
    const state = withRoads({ [ANA.id]: 4, [BRUNO.id]: 4 });
    const after = draft(state, (s) => {
      recomputeLongestRoad(s, []);
    });
    expect(after.longestRoad).toBeUndefined();
  });

  it('keeps it with the holder on a tie', () => {
    const state = draft(withRoads({ [ANA.id]: 5, [BRUNO.id]: 5 }), (s) => {
      s.longestRoad = { owner: ANA.id, length: 5 };
    });
    const after = draft(state, (s) => {
      recomputeLongestRoad(s, []);
    });
    expect(after.longestRoad?.owner).toBe(ANA.id);
  });

  it('passes it on to somebody strictly longer', () => {
    const state = draft(withRoads({ [ANA.id]: 5, [BRUNO.id]: 6 }), (s) => {
      s.longestRoad = { owner: ANA.id, length: 5 };
    });
    const events: Parameters<typeof recomputeLongestRoad>[1] = [];
    const after = draft(state, (s) => {
      recomputeLongestRoad(s, events);
    });
    expect(after.longestRoad).toEqual({ owner: BRUNO.id, length: 6 });
    expect(events).toContainEqual({ type: 'LongestRoadChanged', owner: BRUNO.id, length: 6 });
  });

  it('falls vacant when the holder drops below five and nobody else reaches it', () => {
    const state = draft(withRoads({ [ANA.id]: 4, [BRUNO.id]: 4 }), (s) => {
      s.longestRoad = { owner: ANA.id, length: 5 };
    });
    const events: Parameters<typeof recomputeLongestRoad>[1] = [];
    const after = draft(state, (s) => {
      recomputeLongestRoad(s, events);
    });
    expect(after.longestRoad).toBeUndefined();
    expect(events).toContainEqual({ type: 'LongestRoadChanged', length: 0 });
  });

  it('falls vacant when the holder drops and the others are tied at the top', () => {
    const state = draft(withRoads({ [ANA.id]: 4, [BRUNO.id]: 6, [CATA.id]: 6 }), (s) => {
      s.longestRoad = { owner: ANA.id, length: 7 };
    });
    const after = draft(state, (s) => {
      recomputeLongestRoad(s, []);
    });
    expect(after.longestRoad).toBeUndefined();
  });
});

describe('recalculating after every placement', () => {
  it('takes the bonus away when a rival settlement cuts the holder’s road', () => {
    const chain = chainOf(game, 6);

    // A vertex along the chain with a spare edge, so Bruno can reach it.
    const cutAt = chain.ends.findIndex((vertex, index) => {
      if (index === 0 || index >= chain.ends.length - 1) return false;
      return (board.vertices[vertex]?.edges ?? []).some((edge) => !chain.edges.includes(edge));
    });
    if (cutAt < 0) throw new Error('no cuttable vertex along the chain');
    const middle = at(chain.ends, cutAt);

    const before = position((s) => {
      for (const edge of chain.edges) s.roads[edge] = ANA.id;
      s.longestRoad = { owner: ANA.id, length: 6 };
      s.currentPlayer = BRUNO.id;

      const spare = (s.board.vertices[middle]?.edges ?? []).find(
        (edge) => s.roads[edge] === undefined,
      );
      if (!spare) throw new Error('no edge left for Bruno');
      s.roads[spare] = BRUNO.id;
      const bruno = s.players.find((player) => player.id === BRUNO.id);
      if (bruno) bruno.resources = { wood: 1, brick: 1, sheep: 1, wheat: 1, ore: 0 };
    });

    const result = applyAction(before, BRUNO.id, { type: 'placeSettlement', vertex: middle });
    expect(result).toMatchObject({ ok: true });
    if (!result.ok) return;

    // Ana's chain is split in two, and the longer half is what she has left.
    const longerHalf = Math.max(cutAt, chain.edges.length - cutAt);
    expect(longestRoadLength(result.state, ANA.id)).toBe(longerHalf);
    expect(bruteForceLongestRoad(result.state, ANA.id)).toBe(longerHalf);
    if (longerHalf < LONGEST_ROAD_MIN_LENGTH) {
      expect(result.state.longestRoad).toBeUndefined();
      expect(publicVictoryPoints(result.state, ANA.id)).toBe(0);
    }
  });

  it('hands it over the moment a fifth road goes down', () => {
    const chain = chainOf(game, 5);
    const before = position((s) => {
      for (const edge of chain.edges.slice(0, 4)) s.roads[edge] = ANA.id;
      s.buildings[at(chain.ends, 0)] = { owner: ANA.id, type: 'settlement' };
      const ana = s.players.find((player) => player.id === ANA.id);
      if (ana) ana.resources = { wood: 1, brick: 1, sheep: 0, wheat: 0, ore: 0 };
    });
    expect(before.longestRoad).toBeUndefined();

    const { state } = applyOrThrow(before, ANA.id, {
      type: 'placeRoad',
      edge: at(chain.edges, 4),
    });
    expect(state.longestRoad).toEqual({ owner: ANA.id, length: LONGEST_ROAD_MIN_LENGTH });
  });
});

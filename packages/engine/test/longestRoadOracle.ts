import type { EdgeId, PlayerId, ReadonlyGameState, VertexId } from '../src/index.js';

/**
 * A second, deliberately dumb implementation of the longest route.
 *
 * **This is the one exception to "the rules are stated once".** The longest
 * road is the easiest algorithm in the game to get subtly wrong — blocked
 * vertices, rings with no endpoints, reusing a road — and the only test that
 * catches a mistake its author did not think of is an independent
 * implementation of the same definition.
 *
 * So this one is written from the rule text rather than from the engine: an
 * exhaustive search over (position, roads already used) states, keeping the
 * largest set of used roads ever reached. No shared helpers, no recursion,
 * exponential and proud. It lives in test/ and is never exported from src/.
 *
 * What it verifies is the implementation, not the rule: both encode "a trail
 * over your own roads that may not pass through a rival building".
 */
export const bruteForceLongestRoad = (state: ReadonlyGameState, playerId: PlayerId): number => {
  const own: EdgeId[] = state.board.edgeIds.filter((edge) => state.roads[edge] === playerId);
  if (own.length === 0) return 0;

  const endsOf = (edge: EdgeId): [VertexId, VertexId] => {
    const link = state.board.edges[edge];
    if (!link) throw new Error(`no edge ${edge}`);
    return [link.vertices[0], link.vertices[1]];
  };

  const blocked = (vertex: VertexId): boolean => {
    const building = state.buildings[vertex];
    return building !== undefined && building.owner !== playerId;
  };

  // A state is "standing at `vertex`, having already walked `used`".
  interface Walk {
    readonly vertex: VertexId;
    readonly used: readonly EdgeId[];
  }

  const starts: Walk[] = [];
  for (const edge of own) {
    for (const vertex of endsOf(edge)) starts.push({ vertex, used: [] });
  }

  let best = 0;
  const queue: Walk[] = starts;

  while (queue.length > 0) {
    const current = queue.pop();
    if (!current) break;
    if (current.used.length > best) best = current.used.length;

    // Standing on a rival's vertex, the walk is over: it may end there but not
    // continue.
    if (current.used.length > 0 && blocked(current.vertex)) continue;

    for (const edge of own) {
      if (current.used.includes(edge)) continue;
      const [a, b] = endsOf(edge);
      if (a !== current.vertex && b !== current.vertex) continue;
      const next = a === current.vertex ? b : a;
      queue.push({ vertex: next, used: [...current.used, edge] });
    }
  }

  return best;
};

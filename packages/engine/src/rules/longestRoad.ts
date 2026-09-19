import { LONGEST_ROAD_MIN_LENGTH } from '../constants.js';
import type { GameEvent } from '../events.js';
import type { EdgeId, GameState, PlayerId, ReadonlyGameState, VertexId } from '../types.js';
import { isBlockedBy } from './placement.js';

/**
 * Longest Road (SPEC.md §4.11, §12.2).
 *
 * A route is a trail over the player's own roads: every road used at most once,
 * vertices may repeat. Two details decide most of the edge cases:
 *
 *   - **The search starts from every vertex the network touches**, not only
 *     from its loose ends. A ring has no ends and would otherwise measure 0.
 *   - **A rival building ends a route without erasing it.** The road reaching
 *     that vertex counts; the route simply cannot continue through it. A
 *     player's own buildings never cut anything.
 */

const edgesAt = (state: ReadonlyGameState, playerId: PlayerId, vertex: VertexId): EdgeId[] =>
  (state.board.vertices[vertex]?.edges ?? []).filter((edge) => state.roads[edge] === playerId);

const otherEnd = (state: ReadonlyGameState, edge: EdgeId, from: VertexId): VertexId | undefined => {
  const link = state.board.edges[edge];
  if (!link) return undefined;
  const [a, b] = link.vertices;
  return a === from ? b : a;
};

/** The longest route this player has, in road segments. */
export const longestRoadLength = (state: ReadonlyGameState, playerId: PlayerId): number => {
  const own = state.board.edgeIds.filter((edge) => state.roads[edge] === playerId);
  if (own.length === 0) return 0;

  // Every vertex the network touches is a possible starting point.
  const starts = new Set<VertexId>();
  for (const edge of own) {
    for (const vertex of state.board.edges[edge]?.vertices ?? []) starts.add(vertex);
  }

  const used = new Set<EdgeId>();

  const walk = (vertex: VertexId): number => {
    let best = 0;
    for (const edge of edgesAt(state, playerId, vertex)) {
      if (used.has(edge)) continue;
      const next = otherEnd(state, edge, vertex);
      if (next === undefined) continue;

      used.add(edge);
      // The road counts either way; the route only continues if the far end is
      // not held by somebody else.
      const beyond = isBlockedBy(state, playerId, next) ? 0 : walk(next);
      used.delete(edge);

      best = Math.max(best, 1 + beyond);
    }
    return best;
  };

  let longest = 0;
  for (const start of starts) longest = Math.max(longest, walk(start));
  return longest;
};

export const longestRoadLengths = (state: ReadonlyGameState): Map<PlayerId, number> =>
  new Map(state.players.map((player) => [player.id, longestRoadLength(state, player.id)]));

/**
 * Hands the bonus around after a road or a settlement changed the board
 * (SPEC.md §12.2):
 *
 *   - the holder keeps it while they have 5 or more and nobody beats them
 *     strictly, ties included;
 *   - somebody who beats them strictly with 5 or more takes it;
 *   - otherwise it goes to the single longest player with 5 or more, and if
 *     that maximum is tied, or nobody reaches 5, it falls vacant.
 */
export const recomputeLongestRoad = (draft: GameState, events: GameEvent[]): void => {
  const lengths = longestRoadLengths(draft);
  const previous = draft.longestRoad;

  const eligible = [...lengths.entries()].filter(([, length]) => length >= LONGEST_ROAD_MIN_LENGTH);
  const best = eligible.reduce((max, [, length]) => Math.max(max, length), 0);
  const leaders = eligible.filter(([, length]) => length === best).map(([playerId]) => playerId);

  const announce = (owner: PlayerId | undefined, length: number): void => {
    const changed = owner !== previous?.owner;
    if (owner === undefined) {
      delete draft.longestRoad;
    } else {
      draft.longestRoad = { owner, length };
    }
    if (changed) {
      events.push(
        owner === undefined
          ? { type: 'LongestRoadChanged', length: 0 }
          : { type: 'LongestRoadChanged', owner, length },
      );
    }
  };

  if (previous) {
    const held = lengths.get(previous.owner) ?? 0;
    // The holder keeps it unless somebody is strictly ahead.
    if (held >= LONGEST_ROAD_MIN_LENGTH && held >= best) {
      announce(previous.owner, held);
      return;
    }
  }

  announce(leaders.length === 1 ? leaders[0] : undefined, best);
};

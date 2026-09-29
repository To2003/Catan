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

/**
 * The longest route this player has, as the roads that make it up.
 *
 * The path, not just its length, because the rule is unintuitive — branches do
 * not add up — and the only convincing way to explain it is to draw the route
 * being counted on the board. Ties are broken by whichever the search finds
 * first: any longest route explains the number equally well.
 */
export const longestRoadPath = (state: ReadonlyGameState, playerId: PlayerId): EdgeId[] => {
  const own = state.board.edgeIds.filter((edge) => state.roads[edge] === playerId);
  if (own.length === 0) return [];

  // Every vertex the network touches is a possible starting point.
  const starts = new Set<VertexId>();
  for (const edge of own) {
    for (const vertex of state.board.edges[edge]?.vertices ?? []) starts.add(vertex);
  }

  const walked: EdgeId[] = [];
  const used = new Set<EdgeId>();
  let best: EdgeId[] = [];

  const walk = (vertex: VertexId): void => {
    if (walked.length > best.length) best = [...walked];

    for (const edge of edgesAt(state, playerId, vertex)) {
      if (used.has(edge)) continue;
      const next = otherEnd(state, edge, vertex);
      if (next === undefined) continue;

      used.add(edge);
      walked.push(edge);
      // The road counts either way; the route only continues if the far end is
      // not held by somebody else.
      if (isBlockedBy(state, playerId, next)) {
        if (walked.length > best.length) best = [...walked];
      } else {
        walk(next);
      }
      walked.pop();
      used.delete(edge);
    }
  };

  for (const start of starts) walk(start);
  return best;
};

/** The longest route this player has, in road segments. */
export const longestRoadLength = (state: ReadonlyGameState, playerId: PlayerId): number =>
  longestRoadPath(state, playerId).length;

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

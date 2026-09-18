import type {
  BoardGraph,
  EdgeId,
  PlayerId,
  ReadonlyGameState,
  ResourceBundle,
  VertexId,
} from '../types.js';
import { RESOURCES } from '../constants.js';

/**
 * The placement predicates, shared by validate.ts and (through it) legal.ts.
 *
 * They live here so there is exactly one statement of each rule. legal.ts never
 * reimplements them: it generates candidates and filters them with validate.
 */

/** Indexing a Record is `T | undefined` under noUncheckedIndexedAccess. */
export const vertexOf = (board: BoardGraph, id: VertexId) => board.vertices[id];
export const edgeOf = (board: BoardGraph, id: EdgeId) => board.edges[id];

export const playerOf = (state: ReadonlyGameState, id: PlayerId) =>
  state.players.find((player) => player.id === id);

/**
 * The distance rule: no building may sit next to another, whoever owns it
 * (SPEC.md §4.4). Applies during setup too (SPEC.md §4.5).
 */
export const respectsDistanceRule = (state: ReadonlyGameState, vertex: VertexId): boolean => {
  const node = vertexOf(state.board, vertex);
  if (!node) return false;
  return node.neighbors.every((neighbor) => state.buildings[neighbor] === undefined);
};

/** Whether the player has a road on any edge touching this vertex. */
export const hasOwnRoadAt = (
  state: ReadonlyGameState,
  player: PlayerId,
  vertex: VertexId,
): boolean => {
  const node = vertexOf(state.board, vertex);
  if (!node) return false;
  return node.edges.some((edge) => state.roads[edge] === player);
};

/** Whether somebody else's building sits on this vertex, cutting roads through it. */
export const isBlockedBy = (
  state: ReadonlyGameState,
  player: PlayerId,
  vertex: VertexId,
): boolean => {
  const building = state.buildings[vertex];
  return building !== undefined && building.owner !== player;
};

/**
 * A road must touch a road, settlement or city of its owner, and may not
 * continue through a vertex holding somebody else's building (SPEC.md §4.4).
 *
 * Note this is a rule about *building*, not an invariant of the board: a rival
 * may later drop a settlement in the middle of a road and split it. That
 * remains a legal position.
 */
export const roadConnects = (state: ReadonlyGameState, player: PlayerId, edge: EdgeId): boolean => {
  const link = edgeOf(state.board, edge);
  if (!link) return false;
  return link.vertices.some((vertex) => {
    const building = state.buildings[vertex];
    if (building?.owner === player) return true;
    // A road may carry the connection through, unless a rival building blocks it.
    return !isBlockedBy(state, player, vertex) && hasOwnRoadAt(state, player, vertex);
  });
};

/** Outside setup a settlement must touch one of the player's own roads (SPEC.md §4.4). */
export const settlementConnects = (
  state: ReadonlyGameState,
  player: PlayerId,
  vertex: VertexId,
): boolean => hasOwnRoadAt(state, player, vertex);

export const canAfford = (
  resources: Readonly<ResourceBundle>,
  cost: Readonly<ResourceBundle>,
): boolean => RESOURCES.every((resource) => resources[resource] >= cost[resource]);

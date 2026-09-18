import { expect } from 'vitest';
import {
  applyAction,
  createGame,
  legalRoadSpots,
  legalSettlementSpots,
  type Action,
  type EdgeId,
  type GameEvent,
  type GameState,
  type PlayerSeat,
  type ReadonlyGameState,
  type Resource,
  type ResourceBundle,
  type VertexId,
} from '../src/index.js';

/** Indexing an array is `T | undefined` under noUncheckedIndexedAccess. */
export const at = <T>(items: readonly T[], index: number): T => {
  const item = items[index];
  if (item === undefined) throw new Error(`no item at index ${index}`);
  return item;
};

export const ANA: PlayerSeat = { id: 'p1', name: 'Ana', color: 'celeste' };
export const BRUNO: PlayerSeat = { id: 'p2', name: 'Bruno', color: 'bordo' };
export const CATA: PlayerSeat = { id: 'p3', name: 'Cata', color: 'verde' };
export const DANTE: PlayerSeat = { id: 'p4', name: 'Dante', color: 'amarillo' };

export const SEATS: readonly PlayerSeat[] = [ANA, BRUNO, CATA, DANTE];
export const SEED = 20260918;

export const newGame = (seed = SEED, seats = SEATS): ReadonlyGameState => createGame(seed, seats);

/**
 * Freezes a state in depth so that any mutation of it throws in strict mode.
 * Every reducer test feeds its input through this: that is what proves
 * `applyAction` never touches the state it was given.
 *
 * Already-frozen objects are skipped, which also keeps the shared board from
 * being walked once per action.
 */
export const deepFreeze = <T>(value: T): T => {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const inner of Object.values(value as Record<string, unknown>)) deepFreeze(inner);
  return value;
};

/**
 * Builds a variant of a state for a test to work from. The board is carried
 * over by reference, exactly as the reducer does.
 */
export const draft = (
  state: ReadonlyGameState,
  mutate: (draft: GameState) => void,
): ReadonlyGameState => {
  const { board, ...rest } = state;
  const next = { ...(structuredClone(rest) as Omit<GameState, 'board'>), board } as GameState;
  mutate(next);
  return next;
};

export const bundle = (counts: Partial<ResourceBundle>): ResourceBundle => ({
  wood: 0,
  brick: 0,
  sheep: 0,
  wheat: 0,
  ore: 0,
  ...counts,
});

/** Hands a player resources, taking them out of the bank so totals stay conserved. */
export const give = (state: GameState, playerId: string, counts: Partial<ResourceBundle>): void => {
  const player = state.players.find((p) => p.id === playerId);
  if (!player) throw new Error(`no player ${playerId}`);
  for (const [resource, amount] of Object.entries(counts) as [Resource, number][]) {
    player.resources[resource] += amount;
    state.bank[resource] -= amount;
  }
};

/** Total of every resource across the bank and every hand: must always be 19 each. */
export const totalOf = (state: ReadonlyGameState, resource: Resource): number =>
  state.bank[resource] + state.players.reduce((sum, player) => sum + player.resources[resource], 0);

export const expectOk = <T extends { ok: boolean }>(result: T): Extract<T, { ok: true }> => {
  expect(result).toMatchObject({ ok: true });
  return result as Extract<T, { ok: true }>;
};

/** Applies an action, failing the test if the engine rejected it. */
export const applyOrThrow = (
  state: ReadonlyGameState,
  playerId: string,
  action: Action,
): { state: ReadonlyGameState; events: readonly GameEvent[] } => {
  const result = applyAction(deepFreeze(state), playerId, action);
  if (!result.ok) throw new Error(`${action.type} rejected: ${result.error}`);
  return { state: result.state, events: result.events };
};

/**
 * Plays the whole setup. `choose` picks among the legal spots; the default
 * takes the middle one, which spreads the placements out instead of piling
 * them into one corner of the board the way index 0 does.
 */
export const runSetup = (
  start: ReadonlyGameState = newGame(),
  choose: (count: number) => number = (count) => Math.floor(count / 2),
): ReadonlyGameState => {
  let state = start;
  for (let guard = 0; state.phase.kind === 'setup'; guard += 1) {
    if (guard > 50) throw new Error('setup did not finish');
    const player = state.currentPlayer;
    const spots: readonly string[] =
      state.phase.step === 'settlement'
        ? legalSettlementSpots(state, player)
        : legalRoadSpots(state, player);
    const index = choose(spots.length);
    const action: Action =
      state.phase.step === 'settlement'
        ? { type: 'placeSettlement', vertex: at(legalSettlementSpots(state, player), index) }
        : { type: 'placeRoad', edge: at(legalRoadSpots(state, player), index) };
    state = applyOrThrow(state, player, action).state;
  }
  return state;
};

export interface FreePath {
  readonly edges: EdgeId[];
  /** The vertices walked through, starting with `from`. */
  readonly vertices: VertexId[];
}

/**
 * A path of `length` free edges out of `from`, optionally one that satisfies
 * `accept`. The search keeps going when a path is rejected, so callers can ask
 * for a path with a particular shape.
 */
export const findFreePath = (
  state: ReadonlyGameState,
  from: VertexId,
  length: number,
  accept: (path: FreePath) => boolean = () => true,
): FreePath | undefined => {
  const walk = (vertex: VertexId, edges: EdgeId[], vertices: VertexId[]): FreePath | undefined => {
    if (edges.length === length) {
      const path = { edges, vertices };
      return accept(path) ? path : undefined;
    }
    const node = state.board.vertices[vertex];
    for (const edge of node?.edges ?? []) {
      if (state.roads[edge] !== undefined || edges.includes(edge)) continue;
      const link = state.board.edges[edge];
      if (!link) continue;
      const [a, b] = link.vertices;
      const next = a === vertex ? b : a;
      if (vertices.includes(next)) continue;
      const found = walk(next, [...edges, edge], [...vertices, next]);
      if (found) return found;
    }
    return undefined;
  };
  return walk(from, [], [from]);
};

/**
 * The board invariant for roads: every road shares a vertex with another road
 * of its owner, or with one of their buildings. It is deliberately *local* and
 * says nothing about rival buildings blocking the way — a rival may settle in
 * the middle of a long road and leave part of the network reachable only
 * through that vertex, which is a legal position (SPEC.md §4.4).
 */
export const everyRoadTouchesOwnNetwork = (state: ReadonlyGameState): boolean =>
  Object.entries(state.roads).every(([edge, owner]) => {
    const link = state.board.edges[edge as `e${number}`];
    if (!link) return false;
    return link.vertices.some((vertex) => {
      if (state.buildings[vertex]?.owner === owner) return true;
      const node = state.board.vertices[vertex];
      return (node?.edges ?? []).some((other) => other !== edge && state.roads[other] === owner);
    });
  });

/** Builds roads until the player has somewhere legal to settle. */
export const extendUntilSettlementSpot = (
  state: ReadonlyGameState,
  playerId: string,
): ReadonlyGameState => {
  let current = state;
  for (let guard = 0; legalSettlementSpots(current, playerId).length === 0; guard += 1) {
    if (guard > 10) throw new Error('no settlement spot opened up');
    const edge = at(legalRoadSpots(current, playerId), 0);
    current = applyOrThrow(current, playerId, { type: 'placeRoad', edge }).state;
  }
  return current;
};

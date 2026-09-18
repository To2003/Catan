import { expect } from 'vitest';
import {
  applyAction,
  createGame,
  legalRoadSpots,
  legalSettlementSpots,
  type Action,
  type GameEvent,
  type GameState,
  type PlayerSeat,
  type ReadonlyGameState,
  type Resource,
  type ResourceBundle,
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

/** Plays the whole setup, always taking the first legal spot. */
export const runSetup = (start: ReadonlyGameState = newGame()): ReadonlyGameState => {
  let state = start;
  for (let guard = 0; state.phase.kind === 'setup'; guard += 1) {
    if (guard > 50) throw new Error('setup did not finish');
    const player = state.currentPlayer;
    const action: Action =
      state.phase.step === 'settlement'
        ? { type: 'placeSettlement', vertex: at(legalSettlementSpots(state, player), 0) }
        : { type: 'placeRoad', edge: at(legalRoadSpots(state, player), 0) };
    state = applyOrThrow(state, player, action).state;
  }
  return state;
};

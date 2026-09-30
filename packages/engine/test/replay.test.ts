import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  applyAction,
  createGame,
  getPlayerView,
  roundOf,
  type Action,
  type PlayerId,
  type ReadonlyGameState,
} from '../src/index.js';

/**
 * A whole game, stored the way the server stores one: a seed and a list of
 * actions, and nothing else (SPEC.md §6).
 *
 * That is the point of this fixture. The turn counter is new, and nobody's
 * saved game has it — but nobody's saved game has the bank, the robber or the
 * dev deck either, because none of that is written down. Replaying the actions
 * from the seed rebuilds all of it, the counter included, so a game that was
 * saved before the counter existed comes back with the right number on it.
 *
 * `esperado` pins what this particular game comes out as. If a later change
 * makes a stored game replay into something else, it fails here rather than in
 * somebody's Saturday night.
 */
interface StoredGame {
  readonly seed: number;
  readonly seats: readonly PlayerId[];
  readonly esperado: {
    readonly version: number;
    readonly winner: PlayerId;
    readonly turn: number;
    readonly round: number;
  };
  readonly actions: readonly { readonly playerId: PlayerId; readonly action: Action }[];
}

const stored = JSON.parse(
  readFileSync(new URL('./fixtures/partida-vieja.json', import.meta.url), 'utf8'),
) as StoredGame;

const replay = (): { state: ReadonlyGameState; turnsEnded: number } => {
  let state = createGame(stored.seed, [
    { id: 'p1', name: 'Ana', color: 'celeste' },
    { id: 'p2', name: 'Bruno', color: 'bordo' },
    { id: 'p3', name: 'Cata', color: 'verde' },
  ]);
  let turnsEnded = 0;

  for (const [index, entry] of stored.actions.entries()) {
    const result = applyAction(state, entry.playerId, entry.action);
    if (!result.ok) {
      throw new Error(`action ${index} (${entry.action.type}) was rejected: ${result.error}`);
    }
    state = result.state;
    turnsEnded += result.events.filter((event) => event.type === 'TurnEnded').length;
  }

  return { state, turnsEnded };
};

describe('replaying a game saved before the turn counter existed', () => {
  it('still applies every stored action', () => {
    const { state } = replay();
    expect(state.version).toBe(stored.esperado.version);
    expect(state.phase.kind).toBe('gameOver');
  });

  it('comes out at the same winner', () => {
    const { state } = replay();
    expect(state.phase.kind === 'gameOver' ? state.phase.winner : undefined).toBe(
      stored.esperado.winner,
    );
  });

  it('rebuilds the turn counter from the actions alone', () => {
    const { state, turnsEnded } = replay();
    expect(state.turn).toBe(stored.esperado.turn);
    // The same thing said the other way: the counter is the hand-overs plus
    // the turn being played.
    expect(state.turn).toBe(turnsEnded + 1);
  });

  it('puts the same round on the view', () => {
    const { state } = replay();
    const view = getPlayerView(state, 'p1');
    expect(view.turn).toBe(stored.esperado.turn);
    expect(view.round).toBe(stored.esperado.round);
  });

  it('stores no counter of its own: the file is a seed and a list of moves', () => {
    const raw = JSON.parse(
      readFileSync(new URL('./fixtures/partida-vieja.json', import.meta.url), 'utf8'),
    ) as Record<string, unknown>;
    expect(Object.keys(raw).sort()).toEqual(['actions', 'esperado', 'seats', 'seed']);
    expect(stored.actions.some((entry) => 'turn' in entry.action)).toBe(false);
  });
});

describe('rounds out of turns', () => {
  it('is zero while the board is still being set up', () => {
    expect(roundOf(0, 3)).toBe(0);
  });

  it('starts at one and turns over on the first player', () => {
    expect([1, 2, 3, 4, 5, 6, 7].map((turn) => roundOf(turn, 3))).toEqual([1, 1, 1, 2, 2, 2, 3]);
    expect([1, 4, 5, 8, 9].map((turn) => roundOf(turn, 4))).toEqual([1, 1, 2, 2, 3]);
  });
});

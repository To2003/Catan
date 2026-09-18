import { describe, expect, it } from 'vitest';
import {
  VICTORY_POINTS_TO_WIN,
  applyAction,
  victoryPoints,
  type ReadonlyGameState,
} from '../src/index.js';
import { ANA, BRUNO, at, applyOrThrow, draft, runSetup } from './helpers.js';

const afterSetup = runSetup();

const inMain = (playerId: string, mutate: Parameters<typeof draft>[1] = () => {}) =>
  draft(afterSetup, (s) => {
    s.currentPlayer = playerId;
    s.phase = { kind: 'main' };
    mutate(s);
  });

describe('ending a turn', () => {
  it('hands over to the next player in the turn order and asks for a roll', () => {
    const order = afterSetup.turnOrder;
    const first = at(order, 0);
    const { state, events } = applyOrThrow(inMain(first), first, { type: 'endTurn' });

    expect(state.currentPlayer).toBe(at(order, 1));
    expect(state.phase).toEqual({ kind: 'preRoll' });
    expect(events).toContainEqual({ type: 'TurnEnded', player: first, next: at(order, 1) });
  });

  it('wraps around at the end of the order', () => {
    const order = afterSetup.turnOrder;
    const last = at(order, order.length - 1);
    const { state } = applyOrThrow(inMain(last), last, { type: 'endTurn' });
    expect(state.currentPlayer).toBe(at(order, 0));
  });

  it('is rejected before the dice are rolled', () => {
    const preRoll = draft(afterSetup, (s) => {
      s.phase = { kind: 'preRoll' };
    });
    expect(applyAction(preRoll, preRoll.currentPlayer, { type: 'endTurn' })).toEqual({
      ok: false,
      error: 'WRONG_PHASE',
    });
  });

  it('clears the per-turn flags', () => {
    const before = inMain(ANA.id, (s) => {
      s.devCardPlayedThisTurn = true;
      const ana = s.players.find((player) => player.id === ANA.id);
      if (ana) ana.devCardsBoughtThisTurn = ['knight'];
    });

    const { state } = applyOrThrow(before, ANA.id, { type: 'endTurn' });
    expect(state.devCardPlayedThisTurn).toBe(false);
    expect(state.players.every((player) => player.devCardsBoughtThisTurn.length === 0)).toBe(true);
  });
});

describe('victory points', () => {
  it('counts a settlement as 1 and a city as 2', () => {
    const state = draft(afterSetup, (s) => {
      s.buildings = {};
      const [a, b, c] = s.board.vertexIds;
      if (a) s.buildings[a] = { owner: ANA.id, type: 'settlement' };
      if (b) s.buildings[b] = { owner: ANA.id, type: 'city' };
      if (c) s.buildings[c] = { owner: BRUNO.id, type: 'city' };
    });

    expect(victoryPoints(state, ANA.id)).toBe(3);
    expect(victoryPoints(state, BRUNO.id)).toBe(2);
  });

  it('gives every player 2 after setup', () => {
    for (const player of afterSetup.players) {
      expect(victoryPoints(afterSetup, player.id)).toBe(2);
    }
  });
});

describe('winning', () => {
  /**
   * A board with only Ana's pieces on it: four cities and one settlement, which
   * is 9 points. Upgrading that settlement takes her to 10.
   */
  const oneShort = (): { state: ReadonlyGameState; vertex: `v${number}` } => {
    let target: `v${number}` | undefined;

    const state = inMain(ANA.id, (s) => {
      s.buildings = {};
      s.roads = {};

      const spaced: `v${number}`[] = [];
      for (const candidate of s.board.vertexIds) {
        if (spaced.length === 5) break;
        const neighbors = s.board.vertices[candidate]?.neighbors ?? [];
        if (neighbors.some((neighbor) => spaced.includes(neighbor))) continue;
        spaced.push(candidate);
      }
      if (spaced.length < 5) throw new Error('not enough spaced-out vertices');

      spaced.forEach((vertex, index) => {
        s.buildings[vertex] = { owner: ANA.id, type: index === 0 ? 'settlement' : 'city' };
      });
      target = spaced[0];

      const ana = s.players.find((player) => player.id === ANA.id);
      if (ana) {
        // Four cities already on the board, one piece left for the upgrade.
        ana.stock = { roads: 15, settlements: 4, cities: 1 };
        ana.resources.ore += 3;
        ana.resources.wheat += 2;
        s.bank.ore -= 3;
        s.bank.wheat -= 2;
      }
    });

    if (!target) throw new Error('no target settlement');
    return { state, vertex: target };
  };

  it('ends the game as soon as the active player reaches 10', () => {
    const { state: before, vertex } = oneShort();
    expect(victoryPoints(before, ANA.id)).toBe(VICTORY_POINTS_TO_WIN - 1);

    const { state, events } = applyOrThrow(before, ANA.id, { type: 'upgradeCity', vertex });

    expect(victoryPoints(state, ANA.id)).toBe(VICTORY_POINTS_TO_WIN);
    expect(state.phase).toEqual({ kind: 'gameOver', winner: ANA.id });
    expect(events).toContainEqual({
      type: 'GameWon',
      player: ANA.id,
      points: VICTORY_POINTS_TO_WIN,
    });
  });

  it('refuses every further action once it is over', () => {
    const { state: before, vertex } = oneShort();
    const { state } = applyOrThrow(before, ANA.id, { type: 'upgradeCity', vertex });
    expect(applyAction(state, ANA.id, { type: 'endTurn' })).toEqual({
      ok: false,
      error: 'GAME_OVER',
    });
  });

  it('lets a player who reached 10 on somebody else’s turn win at the start of their own', () => {
    const { state: reached } = (() => {
      const { state, vertex } = oneShort();
      return { state: applyOrThrow(state, ANA.id, { type: 'upgradeCity', vertex }).state };
    })();

    // Rewind to Bruno's turn with Ana already at 10, as if a bonus had moved.
    const order = reached.turnOrder;
    const beforeAna = at(order, (order.indexOf(ANA.id) + order.length - 1) % order.length);
    const brunosTurn = draft(reached, (s) => {
      s.phase = { kind: 'main' };
      s.currentPlayer = beforeAna;
    });

    const { state, events } = applyOrThrow(brunosTurn, beforeAna, { type: 'endTurn' });
    expect(state.currentPlayer).toBe(ANA.id);
    expect(state.phase).toEqual({ kind: 'gameOver', winner: ANA.id });
    expect(events.some((event) => event.type === 'GameWon')).toBe(true);
  });
});

import { describe, expect, it } from 'vitest';
import {
  BANK_RESOURCE_COUNT,
  COSTS,
  DEV_DECK_SIZE,
  RESOURCES,
  applyAction,
  isVisibleTo,
  playableCount,
  publicVictoryPoints,
  victoryCardCount,
  victoryPoints,
  type DevCard,
  type ReadonlyGameState,
} from '../src/index.js';
import { ANA, BRUNO, applyOrThrow, draft, give, newGame, runSetup, totalOf } from './helpers.js';

const afterSetup = runSetup();

/** Main phase with Ana on turn, a deck stacked for the test and cards to pay with. */
const buying = (deck?: readonly DevCard[]): ReadonlyGameState =>
  draft(afterSetup, (s) => {
    s.currentPlayer = ANA.id;
    s.phase = { kind: 'main' };
    if (deck) s.devDeck = [...deck];
    give(s, ANA.id, COSTS.devCard);
  });

const anaIn = (state: ReadonlyGameState) => {
  const player = state.players.find((candidate) => candidate.id === ANA.id);
  if (!player) throw new Error('no Ana');
  return player;
};

describe('buying a development card', () => {
  it('draws the top of the deck, which is index 0 (SPEC §12.11)', () => {
    const before = buying(['monopoly', 'knight', 'vp']);
    const { state } = applyOrThrow(before, ANA.id, { type: 'buyDevCard' });

    expect(anaIn(state).devCards).toEqual(['monopoly']);
    expect(state.devDeck).toEqual(['knight', 'vp']);
  });

  it('pays the bank and conserves every resource', () => {
    const before = buying();
    const { state, events } = applyOrThrow(before, ANA.id, { type: 'buyDevCard' });

    for (const resource of RESOURCES) {
      expect(anaIn(state).resources[resource]).toBe(
        anaIn(before).resources[resource] - COSTS.devCard[resource],
      );
      expect(totalOf(state, resource)).toBe(BANK_RESOURCE_COUNT);
    }
    expect(events.some((event) => event.type === 'ResourcesPaid')).toBe(true);
  });

  it('consumes no randomness: the deck was shuffled once, at the start', () => {
    const before = buying();
    const { state } = applyOrThrow(before, ANA.id, { type: 'buyDevCard' });
    expect(state.rngState).toBe(before.rngState);
  });

  it('says publicly that a card was bought and privately which one', () => {
    const { events } = applyOrThrow(buying(['monopoly']), ANA.id, { type: 'buyDevCard' });

    const bought = events.find((event) => event.type === 'DevCardBought');
    expect(bought).toEqual({ type: 'DevCardBought', player: ANA.id, deckLeft: 0 });
    expect(bought && isVisibleTo(bought, BRUNO.id)).toBe(true);

    const drawn = events.find((event) => event.type === 'DevCardDrawn');
    expect(drawn?.type === 'DevCardDrawn' && drawn.card).toBe('monopoly');
    expect(drawn && isVisibleTo(drawn, ANA.id)).toBe(true);
    expect(drawn && isVisibleTo(drawn, BRUNO.id)).toBe(false);
  });

  it('is rejected without the resources, out of phase, and by other players', () => {
    const broke = draft(afterSetup, (s) => {
      s.currentPlayer = ANA.id;
      s.phase = { kind: 'main' };
    });
    expect(applyAction(broke, ANA.id, { type: 'buyDevCard' })).toEqual({
      ok: false,
      error: 'INSUFFICIENT_RESOURCES',
    });

    const preRoll = draft(buying(), (s) => {
      s.phase = { kind: 'preRoll' };
    });
    expect(applyAction(preRoll, ANA.id, { type: 'buyDevCard' })).toEqual({
      ok: false,
      error: 'WRONG_PHASE',
    });

    expect(applyAction(buying(), BRUNO.id, { type: 'buyDevCard' })).toEqual({
      ok: false,
      error: 'NOT_YOUR_TURN',
    });
  });

  it('is rejected once the deck runs out', () => {
    const empty = buying([]);
    expect(applyAction(empty, ANA.id, { type: 'buyDevCard' })).toEqual({
      ok: false,
      error: 'DECK_EMPTY',
    });
  });

  it('empties the deck exactly after 25 purchases', () => {
    let state = draft(afterSetup, (s) => {
      s.currentPlayer = ANA.id;
      s.phase = { kind: 'main' };
      // Enough to buy the whole deck. Handed over without touching the bank:
      // this fixture is about the deck, and 25 of each would not fit in it.
      const ana = s.players.find((player) => player.id === ANA.id);
      if (ana) ana.resources = { wood: 0, brick: 0, sheep: 25, wheat: 25, ore: 25 };
    });

    let bought = 0;
    while (applyAction(state, ANA.id, { type: 'buyDevCard' }).ok) {
      state = applyOrThrow(state, ANA.id, { type: 'buyDevCard' }).state;
      bought += 1;
    }
    expect(bought).toBe(DEV_DECK_SIZE);
    expect(state.devDeck).toEqual([]);
    expect(anaIn(state).devCards).toHaveLength(DEV_DECK_SIZE);
  });
});

describe('what can be played', () => {
  it('excludes the copies bought this turn', () => {
    const state = draft(afterSetup, (s) => {
      const ana = s.players.find((player) => player.id === ANA.id);
      if (!ana) throw new Error('no Ana');
      ana.devCards = ['knight', 'knight', 'monopoly'];
      ana.devCardsBoughtThisTurn = ['knight'];
    });

    // Two knights in hand, one of them bought just now: one is playable.
    expect(playableCount(state, ANA.id, 'knight')).toBe(1);
    expect(playableCount(state, ANA.id, 'monopoly')).toBe(1);
    expect(playableCount(state, ANA.id, 'vp')).toBe(0);
  });
});

describe('victory points, public and total', () => {
  it('keeps victory cards out of the public score', () => {
    const state = draft(afterSetup, (s) => {
      const ana = s.players.find((player) => player.id === ANA.id);
      if (ana) ana.devCards = ['vp', 'vp', 'knight'];
    });

    // Two settlements from setup.
    expect(publicVictoryPoints(state, ANA.id)).toBe(2);
    expect(victoryCardCount(state, ANA.id)).toBe(2);
    expect(victoryPoints(state, ANA.id)).toBe(4);
  });

  it('counts the bonuses in both', () => {
    const state = draft(afterSetup, (s) => {
      s.largestArmy = ANA.id;
      s.longestRoad = { owner: ANA.id, length: 5 };
    });
    expect(publicVictoryPoints(state, ANA.id)).toBe(2 + 2 + 2);
    expect(victoryPoints(state, ANA.id)).toBe(6);
  });

  it('counts a victory card bought this very turn', () => {
    // It is never "played", so the same-turn restriction does not apply
    // (SPEC §4.10).
    const game = newGame();
    const state = draft(game, (s) => {
      const ana = s.players.find((player) => player.id === ANA.id);
      if (ana) {
        ana.devCards = ['vp'];
        ana.devCardsBoughtThisTurn = ['vp'];
      }
    });
    expect(victoryPoints(state, ANA.id)).toBe(1);
  });
});

import { describe, expect, it } from 'vitest';
import {
  BANK_RESOURCE_COUNT,
  LARGEST_ARMY_MIN_KNIGHTS,
  RESOURCES,
  applyAction,
  publicVictoryPoints,
  type DevCard,
  type GameState,
  type ReadonlyGameState,
} from '../src/index.js';
import { ANA, BRUNO, CATA, applyOrThrow, draft, give, runSetup, totalOf } from './helpers.js';

const afterSetup = runSetup();

/** Ana on turn with a chosen hand of development cards. */
const holding = (
  cards: readonly DevCard[],
  phase: 'main' | 'preRoll' = 'main',
  mutate: (draft: GameState) => void = () => {},
): ReadonlyGameState =>
  draft(afterSetup, (s) => {
    s.currentPlayer = ANA.id;
    s.phase = { kind: phase };
    const ana = s.players.find((player) => player.id === ANA.id);
    if (ana) ana.devCards = [...cards];
    mutate(s);
  });

const anaIn = (state: ReadonlyGameState) => {
  const player = state.players.find((candidate) => candidate.id === ANA.id);
  if (!player) throw new Error('no Ana');
  return player;
};

describe('the rules every card shares', () => {
  it('allows only one card per turn', () => {
    const before = holding(['monopoly', 'yearOfPlenty']);
    const { state } = applyOrThrow(before, ANA.id, { type: 'playMonopoly', resource: 'wood' });
    expect(state.devCardPlayedThisTurn).toBe(true);

    expect(
      applyAction(state, ANA.id, { type: 'playYearOfPlenty', resources: ['wood', 'ore'] }),
    ).toEqual({ ok: false, error: 'ALREADY_PLAYED_DEV_CARD' });
  });

  it('refuses a card bought this very turn', () => {
    const state = holding(['monopoly'], 'main', (s) => {
      const ana = s.players.find((player) => player.id === ANA.id);
      if (ana) ana.devCardsBoughtThisTurn = ['monopoly'];
    });
    expect(applyAction(state, ANA.id, { type: 'playMonopoly', resource: 'wood' })).toEqual({
      ok: false,
      error: 'CARD_BOUGHT_THIS_TURN',
    });
  });

  it('lets a second copy be played when only one was bought this turn', () => {
    const state = holding(['knight', 'knight'], 'main', (s) => {
      const ana = s.players.find((player) => player.id === ANA.id);
      if (ana) ana.devCardsBoughtThisTurn = ['knight'];
    });
    expect(applyAction(state, ANA.id, { type: 'playKnight' }).ok).toBe(true);
  });

  it('refuses a card that is not in hand', () => {
    expect(applyAction(holding([]), ANA.id, { type: 'playMonopoly', resource: 'wood' })).toEqual({
      ok: false,
      error: 'CARD_NOT_IN_HAND',
    });
  });

  it('clears the per-turn flag at the end of the turn', () => {
    const played = applyOrThrow(holding(['monopoly']), ANA.id, {
      type: 'playMonopoly',
      resource: 'wood',
    }).state;
    const { state } = applyOrThrow(played, ANA.id, { type: 'endTurn' });
    expect(state.devCardPlayedThisTurn).toBe(false);
  });

  it('only lets the knight be played before the roll', () => {
    expect(applyAction(holding(['knight'], 'preRoll'), ANA.id, { type: 'playKnight' }).ok).toBe(
      true,
    );
    expect(
      applyAction(holding(['monopoly'], 'preRoll'), ANA.id, {
        type: 'playMonopoly',
        resource: 'wood',
      }),
    ).toEqual({ ok: false, error: 'WRONG_PHASE' });
  });
});

describe('the knight', () => {
  it('moves the robber and comes back to where it was played', () => {
    const fromMain = applyOrThrow(holding(['knight'], 'main'), ANA.id, { type: 'playKnight' });
    expect(fromMain.state.phase).toEqual({
      kind: 'moveRobber',
      source: 'knight',
      returnTo: 'main',
    });

    const fromPreRoll = applyOrThrow(holding(['knight'], 'preRoll'), ANA.id, {
      type: 'playKnight',
    });
    expect(fromPreRoll.state.phase).toEqual({
      kind: 'moveRobber',
      source: 'knight',
      returnTo: 'preRoll',
    });
  });

  it('never goes through a discard, however many cards are held', () => {
    const state = holding(['knight'], 'preRoll', (s) => {
      // Everyone well over the discard limit: a seven would ask them all to
      // discard, a knight asks nobody.
      for (const player of s.players) player.resources.wood += 9;
    });
    const { state: after } = applyOrThrow(state, ANA.id, { type: 'playKnight' });
    expect(after.phase.kind).toBe('moveRobber');
  });

  it('counts knights and hands out the largest army at three', () => {
    let state = holding(['knight', 'knight', 'knight'], 'main');
    for (let i = 0; i < LARGEST_ARMY_MIN_KNIGHTS; i += 1) {
      const played = applyOrThrow(state, ANA.id, { type: 'playKnight' });
      // Back to main without a steal, so the next knight can be played.
      state = draft(played.state, (s) => {
        s.phase = { kind: 'main' };
        s.devCardPlayedThisTurn = false;
      });
    }

    expect(anaIn(state).knightsPlayed).toBe(LARGEST_ARMY_MIN_KNIGHTS);
    expect(state.largestArmy).toBe(ANA.id);
    // Two settlements plus the bonus.
    expect(publicVictoryPoints(state, ANA.id)).toBe(4);
  });

  it('only changes hands on a strict majority', () => {
    const tied = draft(afterSetup, (s) => {
      s.currentPlayer = BRUNO.id;
      s.phase = { kind: 'main' };
      s.largestArmy = ANA.id;
      const ana = s.players.find((player) => player.id === ANA.id);
      const bruno = s.players.find((player) => player.id === BRUNO.id);
      if (ana) ana.knightsPlayed = 4;
      if (bruno) {
        bruno.knightsPlayed = 3;
        bruno.devCards = ['knight', 'knight'];
      }
    });

    // Bruno ties at four: not enough.
    const tiedState = applyOrThrow(tied, BRUNO.id, { type: 'playKnight' }).state;
    expect(tiedState.largestArmy).toBe(ANA.id);

    // A fifth knight takes it.
    const ahead = draft(tiedState, (s) => {
      s.phase = { kind: 'main' };
      s.devCardPlayedThisTurn = false;
    });
    const { state } = applyOrThrow(ahead, BRUNO.id, { type: 'playKnight' });
    expect(state.largestArmy).toBe(BRUNO.id);
  });
});

describe('year of plenty', () => {
  it('takes two cards from the bank', () => {
    const before = holding(['yearOfPlenty']);
    const { state, events } = applyOrThrow(before, ANA.id, {
      type: 'playYearOfPlenty',
      resources: ['wood', 'ore'],
    });

    expect(anaIn(state).resources.wood).toBe(anaIn(before).resources.wood + 1);
    expect(anaIn(state).resources.ore).toBe(anaIn(before).resources.ore + 1);
    expect(state.bank.wood).toBe(before.bank.wood - 1);
    expect(events).toContainEqual({
      type: 'YearOfPlentyTaken',
      player: ANA.id,
      resources: ['wood', 'ore'],
    });
    for (const resource of RESOURCES) expect(totalOf(state, resource)).toBe(BANK_RESOURCE_COUNT);
  });

  it('takes two of the same resource when asked', () => {
    const { state } = applyOrThrow(holding(['yearOfPlenty']), ANA.id, {
      type: 'playYearOfPlenty',
      resources: ['ore', 'ore'],
    });
    expect(anaIn(state).resources.ore).toBe(2);
  });

  it('is all or nothing: the bank has to cover both', () => {
    const oneLeft = holding(['yearOfPlenty'], 'main', (s) => {
      give(s, BRUNO.id, { ore: s.bank.ore - 1 });
    });
    expect(oneLeft.bank.ore).toBe(1);

    // One is fine, two of the same is not, and neither is a pair that needs it.
    expect(
      applyAction(oneLeft, ANA.id, { type: 'playYearOfPlenty', resources: ['ore', 'wood'] }).ok,
    ).toBe(true);
    expect(
      applyAction(oneLeft, ANA.id, { type: 'playYearOfPlenty', resources: ['ore', 'ore'] }),
    ).toEqual({ ok: false, error: 'INSUFFICIENT_RESOURCES' });
  });
});

describe('monopoly', () => {
  it('takes every card of that resource from everyone else', () => {
    const before = holding(['monopoly'], 'main', (s) => {
      give(s, BRUNO.id, { sheep: 3, wood: 2 });
      give(s, CATA.id, { sheep: 1 });
    });
    const held = anaIn(before).resources.sheep;

    const { state, events } = applyOrThrow(before, ANA.id, {
      type: 'playMonopoly',
      resource: 'sheep',
    });

    expect(anaIn(state).resources.sheep).toBe(held + 4);
    expect(state.players.find((p) => p.id === BRUNO.id)?.resources.sheep).toBe(0);
    expect(state.players.find((p) => p.id === BRUNO.id)?.resources.wood).toBe(2);
    expect(state.bank).toEqual(before.bank);
    for (const resource of RESOURCES) expect(totalOf(state, resource)).toBe(BANK_RESOURCE_COUNT);

    const resolved = events.find((event) => event.type === 'MonopolyResolved');
    expect(resolved?.type === 'MonopolyResolved' && resolved.total).toBe(4);
    expect(resolved?.type === 'MonopolyResolved' && resolved.from).toEqual([
      { player: BRUNO.id, amount: 3 },
      { player: CATA.id, amount: 1 },
    ]);
  });

  it('is legal even when it takes nothing', () => {
    const before = holding(['monopoly'], 'main', (s) => {
      for (const player of s.players) {
        s.bank.ore += player.resources.ore;
        player.resources.ore = 0;
      }
    });
    const { state, events } = applyOrThrow(before, ANA.id, {
      type: 'playMonopoly',
      resource: 'ore',
    });
    expect(anaIn(state).resources.ore).toBe(0);
    expect(events).toContainEqual({
      type: 'MonopolyResolved',
      player: ANA.id,
      resource: 'ore',
      from: [],
      total: 0,
    });
  });
});

import { describe, expect, it } from 'vitest';
import {
  BANK_RESOURCE_COUNT,
  DISCARD_THRESHOLD,
  RESOURCES,
  applyAction,
  isVisibleTo,
  legalRobberHexes,
  legalStealTargets,
  nextInt,
  pendingDiscards,
  stealCandidates,
  type HexId,
  type ReadonlyGameState,
  type Resource,
} from '../src/index.js';
import { ANA, BRUNO, CATA, applyOrThrow, draft, give, runSetup, totalOf } from './helpers.js';

const afterSetup = runSetup();

const handOf = (state: ReadonlyGameState, playerId: string) => {
  const player = state.players.find((candidate) => candidate.id === playerId);
  if (!player) throw new Error(`no player ${playerId}`);
  return player.resources;
};

const handSize = (state: ReadonlyGameState, playerId: string): number =>
  RESOURCES.reduce((total, resource) => total + handOf(state, playerId)[resource], 0);

/** A discard phase with Ana on turn and whoever is over the limit owing cards. */
const discarding = (mutate: Parameters<typeof draft>[1] = () => {}): ReadonlyGameState => {
  const withHands = draft(afterSetup, (s) => {
    s.currentPlayer = ANA.id;
    s.phase = { kind: 'preRoll' };
    for (const player of s.players) {
      for (const resource of RESOURCES) {
        s.bank[resource] += player.resources[resource];
        player.resources[resource] = 0;
      }
    }
    mutate(s);
  });

  return draft(withHands, (s) => {
    s.phase = {
      kind: 'discard',
      pending: pendingDiscards(withHands),
      source: 'seven',
      returnTo: 'main',
    };
  });
};

describe('who owes a discard', () => {
  it('asks for half, rounded down, from anyone over seven cards', () => {
    const state = discarding((s) => {
      give(s, ANA.id, { wood: 8 });
      give(s, BRUNO.id, { wood: 4, brick: 5 });
      give(s, CATA.id, { wood: DISCARD_THRESHOLD });
    });

    expect(state.phase).toMatchObject({
      kind: 'discard',
      pending: { [ANA.id]: 4, [BRUNO.id]: 4 },
      source: 'seven',
      returnTo: 'main',
    });
    // Exactly seven is not over the limit.
    expect(state.phase.kind === 'discard' ? state.phase.pending[CATA.id] : 0).toBeUndefined();
  });

  it('skips the phase entirely when nobody is over the limit', () => {
    const state = discarding((s) => {
      give(s, ANA.id, { wood: 3 });
    });
    expect(state.phase).toMatchObject({ kind: 'discard', pending: {} });
    expect(pendingDiscards(state)).toEqual({});
  });
});

describe('the discard phase is only ever reached from a seven', () => {
  /**
   * The knight (M5) goes straight to moveRobber and never discards
   * (SPEC.md §4.10, §12.3). Pinning source and returnTo here means that stays
   * true when the knight lands.
   */
  it('carries source "seven" and returnTo "main"', () => {
    const rolled = (() => {
      for (let seed = 0; seed < 5000; seed += 1) {
        const candidate = draft(afterSetup, (s) => {
          s.currentPlayer = ANA.id;
          s.phase = { kind: 'preRoll' };
          s.rngState = seed;
          give(s, ANA.id, { wood: 8 });
        });
        const result = applyAction(candidate, ANA.id, { type: 'rollDice' });
        if (result.ok && result.state.phase.kind === 'discard') return result.state;
      }
      throw new Error('no seed rolled a seven');
    })();

    expect(rolled.phase).toMatchObject({ source: 'seven', returnTo: 'main' });
    expect((rolled.lastRoll?.[0] ?? 0) + (rolled.lastRoll?.[1] ?? 0)).toBe(7);
  });
});

describe('discarding', () => {
  const base = () =>
    discarding((s) => {
      give(s, ANA.id, { wood: 5, ore: 3 });
      give(s, BRUNO.id, { sheep: 10 });
    });

  it('lets a player who is not on turn discard, and the active one too', () => {
    const state = base();
    expect(state.currentPlayer).toBe(ANA.id);

    const brunoFirst = applyOrThrow(state, BRUNO.id, { type: 'discard', cards: { sheep: 5 } });
    expect(brunoFirst.state.phase).toMatchObject({ kind: 'discard', pending: { [ANA.id]: 4 } });

    const anaNext = applyOrThrow(brunoFirst.state, ANA.id, {
      type: 'discard',
      cards: { wood: 4 },
    });
    expect(anaNext.state.phase).toEqual({ kind: 'moveRobber', source: 'seven', returnTo: 'main' });
  });

  it('rejects a player who owes nothing', () => {
    expect(applyAction(base(), CATA.id, { type: 'discard', cards: { wood: 1 } })).toEqual({
      ok: false,
      error: 'NOT_YOUR_TURN',
    });
  });

  it('demands exactly what is owed, in one go', () => {
    const state = base();
    for (const cards of [{ wood: 3 }, { wood: 5 }, {}]) {
      expect(applyAction(state, ANA.id, { type: 'discard', cards })).toEqual({
        ok: false,
        error: 'INVALID_DISCARD',
      });
    }
  });

  it('rejects cards the player does not hold', () => {
    expect(applyAction(base(), ANA.id, { type: 'discard', cards: { sheep: 4 } })).toEqual({
      ok: false,
      error: 'INSUFFICIENT_RESOURCES',
    });
  });

  it('rejects amounts that are not non-negative integers', () => {
    // These cannot happen through the types, but in M6 actions arrive over the
    // wire, where the types no longer exist.
    const state = base();
    for (const amount of [1.5, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(applyAction(state, ANA.id, { type: 'discard', cards: { wood: amount } })).toEqual({
        ok: false,
        error: 'INVALID_AMOUNT',
      });
    }
  });

  it('gives the cards back to the bank', () => {
    const before = base();
    const { state } = applyOrThrow(before, ANA.id, { type: 'discard', cards: { wood: 4 } });

    expect(handOf(state, ANA.id).wood).toBe(handOf(before, ANA.id).wood - 4);
    expect(state.bank.wood).toBe(before.bank.wood + 4);
    for (const resource of RESOURCES) expect(totalOf(state, resource)).toBe(BANK_RESOURCE_COUNT);
  });

  it('reports the count publicly and the cards only to their owner', () => {
    const { events } = applyOrThrow(base(), ANA.id, {
      type: 'discard',
      cards: { wood: 2, ore: 2 },
    });

    const counted = events.find((event) => event.type === 'CardsDiscarded');
    expect(counted).toEqual({ type: 'CardsDiscarded', player: ANA.id, count: 4 });
    expect(counted && isVisibleTo(counted, BRUNO.id)).toBe(true);

    const detail = events.find((event) => event.type === 'DiscardDetail');
    expect(detail?.type === 'DiscardDetail' && detail.cards.wood).toBe(2);
    expect(detail && isVisibleTo(detail, ANA.id)).toBe(true);
    expect(detail && isVisibleTo(detail, BRUNO.id)).toBe(false);
  });
});

describe('moving the robber', () => {
  const movingRobber = (
    returnTo: 'preRoll' | 'main',
    mutate: Parameters<typeof draft>[1] = () => {},
  ): ReadonlyGameState =>
    draft(afterSetup, (s) => {
      s.currentPlayer = ANA.id;
      s.phase = {
        kind: 'moveRobber',
        source: returnTo === 'preRoll' ? 'knight' : 'seven',
        returnTo,
      };
      mutate(s);
    });

  const emptyHex = (state: ReadonlyGameState): HexId => {
    const hex = state.board.hexIds.find(
      (candidate) =>
        candidate !== state.robberHex &&
        (state.board.hexes[candidate]?.corners ?? []).every(
          (vertex) => state.buildings[vertex] === undefined,
        ),
    );
    if (!hex) throw new Error('no empty hex');
    return hex;
  };

  it('has to go somewhere else, and the desert counts', () => {
    const state = movingRobber('main');
    expect(applyAction(state, ANA.id, { type: 'moveRobber', hex: state.robberHex })).toEqual({
      ok: false,
      error: 'INVALID_TARGET',
    });
    expect(applyAction(state, ANA.id, { type: 'moveRobber', hex: 'h99' })).toEqual({
      ok: false,
      error: 'INVALID_TARGET',
    });

    // The robber starts on the desert, so moving anywhere else is fine, and the
    // legal list is every other hex.
    expect(legalRobberHexes(state, ANA.id)).toHaveLength(state.board.hexIds.length - 1);
  });

  it('skips the steal when nobody is next to the hex, and returns to main', () => {
    const state = movingRobber('main');
    const target = emptyHex(state);
    const { state: after, events } = applyOrThrow(state, ANA.id, {
      type: 'moveRobber',
      hex: target,
    });

    expect(after.robberHex).toBe(target);
    expect(events).toContainEqual({ type: 'StealSkipped', reason: 'noCandidates' });
    expect(after.phase).toEqual({ kind: 'main' });
  });

  it('returns to preRoll instead when that is where it came from', () => {
    // How a knight played before the roll will behave (SPEC §12.3, M5).
    const state = movingRobber('preRoll');
    const { state: after } = applyOrThrow(state, ANA.id, {
      type: 'moveRobber',
      hex: emptyHex(state),
    });
    expect(after.phase).toEqual({ kind: 'preRoll' });
  });

  it('lists the neighbours with cards, excluding the thief and the broke', () => {
    const state = movingRobber('main');
    const hex = state.board.hexIds.find((candidate) => {
      if (candidate === state.robberHex) return false;
      const owners = (state.board.hexes[candidate]?.corners ?? [])
        .map((vertex) => state.buildings[vertex]?.owner)
        .filter((owner): owner is string => owner !== undefined);
      return new Set(owners).size >= 2;
    });
    if (!hex) throw new Error('no hex with two owners');

    const owners = [
      ...new Set(
        (state.board.hexes[hex]?.corners ?? [])
          .map((vertex) => state.buildings[vertex]?.owner)
          .filter((owner): owner is string => owner !== undefined),
      ),
    ];
    const [first, second] = owners;
    if (!first || !second) throw new Error('expected two owners');

    // Only the first one holds cards, and the thief is never a candidate.
    const withCards = draft(state, (s) => {
      s.currentPlayer = second;
      give(s, first, { wood: 2 });
    });

    expect(stealCandidates(withCards, hex, second)).toEqual([first]);

    const { state: after } = applyOrThrow(withCards, second, { type: 'moveRobber', hex });
    expect(after.phase).toEqual({ kind: 'steal', candidates: [first], returnTo: 'main' });
    expect(legalStealTargets(after, second)).toEqual([first]);
  });
});

describe('stealing', () => {
  /** A steal phase where Bruno is the only candidate, holding a known hand. */
  const stealing = (returnTo: 'preRoll' | 'main' = 'main') =>
    draft(afterSetup, (s) => {
      s.currentPlayer = ANA.id;
      s.phase = { kind: 'steal', candidates: [BRUNO.id], returnTo };
      for (const player of s.players) {
        for (const resource of RESOURCES) {
          s.bank[resource] += player.resources[resource];
          player.resources[resource] = 0;
        }
      }
      give(s, BRUNO.id, { wood: 2, ore: 1 });
    });

  it('is an explicit action even with a single candidate', () => {
    const state = stealing();
    // The engine never resolves it on its own: the phase sits there until the
    // action arrives. A UI may preselect the only candidate.
    expect(state.phase).toMatchObject({ kind: 'steal' });
    expect(legalStealTargets(state, ANA.id)).toEqual([BRUNO.id]);
  });

  it('refuses a target who is not a candidate', () => {
    expect(applyAction(stealing(), ANA.id, { type: 'steal', target: CATA.id })).toEqual({
      ok: false,
      error: 'INVALID_TARGET',
    });
  });

  it('moves one card from hand to hand, leaving the bank alone', () => {
    const before = stealing();
    const { state } = applyOrThrow(before, ANA.id, { type: 'steal', target: BRUNO.id });

    expect(handSize(state, ANA.id)).toBe(1);
    expect(handSize(state, BRUNO.id)).toBe(handSize(before, BRUNO.id) - 1);
    expect(state.bank).toEqual(before.bank);
    for (const resource of RESOURCES) expect(totalOf(state, resource)).toBe(BANK_RESOURCE_COUNT);
    expect(state.phase).toEqual({ kind: 'main' });
  });

  it('picks the card from the hand laid out in resource order (SPEC §12.11)', () => {
    const before = stealing();
    // wood, wood, ore — one draw over three cards.
    const expected: Resource = (['wood', 'wood', 'ore'] as const)[
      nextInt(before.rngState, 3).value
    ] as Resource;

    const { state, events } = applyOrThrow(before, ANA.id, { type: 'steal', target: BRUNO.id });
    expect(handOf(state, ANA.id)[expected]).toBe(1);

    const stolen = events.find((event) => event.type === 'ResourceStolen');
    expect(stolen?.type === 'ResourceStolen' && stolen.resource).toBe(expected);
  });

  it('tells everyone that a steal happened and only the two of them what it was', () => {
    const { events } = applyOrThrow(stealing(), ANA.id, { type: 'steal', target: BRUNO.id });

    const resolved = events.find((event) => event.type === 'StealResolved');
    expect(resolved).toEqual({ type: 'StealResolved', thief: ANA.id, victim: BRUNO.id });
    expect(resolved && isVisibleTo(resolved, CATA.id)).toBe(true);

    const stolen = events.find((event) => event.type === 'ResourceStolen');
    expect(stolen && isVisibleTo(stolen, ANA.id)).toBe(true);
    expect(stolen && isVisibleTo(stolen, BRUNO.id)).toBe(true);
    expect(stolen && isVisibleTo(stolen, CATA.id)).toBe(false);
  });

  it('returns to preRoll when that is where it came from', () => {
    const { state } = applyOrThrow(stealing('preRoll'), ANA.id, {
      type: 'steal',
      target: BRUNO.id,
    });
    expect(state.phase).toEqual({ kind: 'preRoll' });
  });
});

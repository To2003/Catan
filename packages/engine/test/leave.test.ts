import { describe, expect, it } from 'vitest';
import { activePlayers, applyAction, hasLeft, validateAction } from '../src/index.js';
import { ANA, BRUNO, CATA, applyOrThrow, deepFreeze, draft, give, runSetup } from './helpers.js';

/**
 * Walking out of a game for good.
 *
 * The thing worth pinning here is why it is an action at all. Presence is not
 * part of a game's history — `connected` never enters the action list — and
 * that is fine because no rule reads it. This one is read by the trade rules,
 * so if it were a flag on the side, a replay would deal offers the original
 * game never dealt. These tests are the argument, written down.
 */
const mainPhase = () =>
  draft(runSetup(), (state) => {
    state.currentPlayer = ANA.id;
    state.phase = { kind: 'main' };
    give(state, ANA.id, { wood: 5, ore: 5 });
    give(state, BRUNO.id, { sheep: 5 });
    give(state, CATA.id, { wheat: 5 });
  });

describe('leaving a game', () => {
  it('marks the player and says so, without touching their pieces', () => {
    const before = mainPhase();
    const roads = { ...before.roads };
    const buildings = { ...before.buildings };

    const { state, events } = applyOrThrow(before, BRUNO.id, { type: 'leaveGame' });

    expect(hasLeft(state, BRUNO.id)).toBe(true);
    expect(events).toContainEqual({ type: 'PlayerLeft', player: BRUNO.id });
    expect(state.roads).toEqual(roads);
    expect(state.buildings).toEqual(buildings);
    // And the cards stay in their hand: the bank total must still add up.
    const bruno = state.players.find((player) => player.id === BRUNO.id);
    expect(bruno?.resources.sheep).toBe(5);
  });

  it('does not wait for your turn, because that is the whole point', () => {
    const state = mainPhase();
    expect(state.currentPlayer).toBe(ANA.id);
    expect(validateAction(state, CATA.id, { type: 'leaveGame' })).toBeNull();
  });

  it('cannot be done twice', () => {
    const { state } = applyOrThrow(mainPhase(), BRUNO.id, { type: 'leaveGame' });
    expect(validateAction(state, BRUNO.id, { type: 'leaveGame' })).toBe('ALREADY_LEFT');
    expect(applyAction(deepFreeze(state), BRUNO.id, { type: 'leaveGame' }).ok).toBe(false);
  });

  it('leaves the rest of the table listed as still in it', () => {
    const { state } = applyOrThrow(mainPhase(), BRUNO.id, { type: 'leaveGame' });
    expect(activePlayers(state)).toEqual([ANA.id, CATA.id, 'p4']);
  });
});

describe('what leaving does to the offers on the table', () => {
  it('takes their name off an offer made to everybody', () => {
    const gone = applyOrThrow(mainPhase(), BRUNO.id, { type: 'leaveGame' }).state;
    const { state } = applyOrThrow(gone, ANA.id, {
      type: 'createOffer',
      give: { wood: 1 },
      want: { wheat: 1 },
      to: 'all',
    });

    const offer = state.tradeOffers[0];
    expect(offer?.to).not.toContain(BRUNO.id);
    expect(offer?.to).toEqual([CATA.id, 'p4']);
    expect(Object.keys(offer?.responses ?? {})).not.toContain(BRUNO.id);
  });

  it('refuses an offer aimed at somebody who walked out', () => {
    const gone = applyOrThrow(mainPhase(), BRUNO.id, { type: 'leaveGame' }).state;
    expect(
      validateAction(gone, ANA.id, {
        type: 'createOffer',
        give: { wood: 1 },
        want: { sheep: 1 },
        to: [BRUNO.id],
      }),
    ).toBe('INVALID_TARGET');
  });

  it('drops an open offer that was only for them', () => {
    const offered = applyOrThrow(mainPhase(), ANA.id, {
      type: 'createOffer',
      give: { wood: 1 },
      want: { sheep: 1 },
      to: [BRUNO.id],
    }).state;
    expect(offered.tradeOffers).toHaveLength(1);

    const { state, events } = applyOrThrow(offered, BRUNO.id, { type: 'leaveGame' });
    expect(state.tradeOffers).toHaveLength(0);
    expect(events.some((event) => event.type === 'OfferCancelled')).toBe(true);
  });

  it('keeps an offer that still has somebody to answer it', () => {
    const offered = applyOrThrow(mainPhase(), ANA.id, {
      type: 'createOffer',
      give: { wood: 1 },
      want: { sheep: 1 },
      to: [BRUNO.id, CATA.id],
    }).state;

    const { state } = applyOrThrow(offered, BRUNO.id, { type: 'leaveGame' });
    expect(state.tradeOffers).toHaveLength(1);
    expect(state.tradeOffers[0]?.to).toEqual([CATA.id]);
    expect(Object.keys(state.tradeOffers[0]?.responses ?? {})).toEqual([CATA.id]);
  });

  it('withdraws the offers they had made', () => {
    const offered = applyOrThrow(mainPhase(), ANA.id, {
      type: 'createOffer',
      give: { wood: 1 },
      want: { sheep: 1 },
      to: 'all',
    }).state;

    const { state } = applyOrThrow(offered, ANA.id, { type: 'leaveGame' });
    expect(state.tradeOffers).toHaveLength(0);
  });
});

describe('a replay sees it', () => {
  it('reproduces the same offers, which a flag on the side would not', () => {
    // The same two actions, replayed from the same state, must land on the
    // same offer — including who it reached.
    const start = mainPhase();
    const play = () => {
      const gone = applyOrThrow(start, BRUNO.id, { type: 'leaveGame' }).state;
      return applyOrThrow(gone, ANA.id, {
        type: 'createOffer',
        give: { wood: 1 },
        want: { wheat: 1 },
        to: 'all',
      }).state;
    };

    expect(JSON.stringify(play().tradeOffers)).toBe(JSON.stringify(play().tradeOffers));
  });
});

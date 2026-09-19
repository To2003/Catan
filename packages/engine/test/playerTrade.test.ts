import { describe, expect, it } from 'vitest';
import {
  BANK_RESOURCE_COUNT,
  MAX_OPEN_OFFERS,
  RESOURCES,
  applyAction,
  getPlayerView,
  type GameState,
  type ReadonlyGameState,
} from '../src/index.js';
import {
  ANA,
  BRUNO,
  CATA,
  DANTE,
  applyOrThrow,
  draft,
  give,
  runSetup,
  totalOf,
} from './helpers.js';

const afterSetup = runSetup();

/** Main phase, Ana on turn, everybody with a known hand. */
const trading = (mutate: (draft: GameState) => void = () => {}): ReadonlyGameState =>
  draft(afterSetup, (s) => {
    s.currentPlayer = ANA.id;
    s.phase = { kind: 'main' };
    for (const player of s.players) {
      for (const resource of RESOURCES) {
        s.bank[resource] += player.resources[resource];
        player.resources[resource] = 0;
      }
    }
    give(s, ANA.id, { wood: 3, brick: 1 });
    give(s, BRUNO.id, { ore: 3, sheep: 1 });
    give(s, CATA.id, { wheat: 2 });
    mutate(s);
  });

const handOf = (state: ReadonlyGameState, playerId: string) => {
  const player = state.players.find((candidate) => candidate.id === playerId);
  if (!player) throw new Error(`no player ${playerId}`);
  return player.resources;
};

const openOffer = (state: ReadonlyGameState = trading()) =>
  applyOrThrow(state, ANA.id, {
    type: 'createOffer',
    give: { wood: 2 },
    want: { ore: 1 },
    to: 'all',
  });

describe('making an offer', () => {
  it('reaches everybody else, pending, and is public', () => {
    const { state, events } = openOffer();
    const offer = state.tradeOffers[0];

    expect(state.tradeOffers).toHaveLength(1);
    expect(offer?.from).toBe(ANA.id);
    expect([...(offer?.to ?? [])].sort()).toEqual([BRUNO.id, CATA.id, DANTE.id].sort());
    expect(offer?.responses).toEqual({
      [BRUNO.id]: 'pending',
      [CATA.id]: 'pending',
      [DANTE.id]: 'pending',
    });
    expect(events.some((event) => event.type === 'OfferCreated')).toBe(true);

    // Bruno sees it in his own view: offers are not secret.
    expect(getPlayerView(state, BRUNO.id).tradeOffers).toHaveLength(1);
  });

  it('can be aimed at one player', () => {
    const { state } = applyOrThrow(trading(), ANA.id, {
      type: 'createOffer',
      give: { wood: 1 },
      want: { ore: 1 },
      to: [BRUNO.id],
    });
    expect(state.tradeOffers[0]?.to).toEqual([BRUNO.id]);
  });

  it('needs a card on each side and no resource on both (SPEC §12.5)', () => {
    const state = trading();
    const bad = [
      { give: {}, want: { ore: 1 } },
      { give: { wood: 1 }, want: {} },
      { give: { wood: 1 }, want: { wood: 1 } },
      { give: { wood: 1, ore: 1 }, want: { ore: 2 } },
    ];
    for (const sides of bad) {
      expect(applyAction(state, ANA.id, { type: 'createOffer', ...sides, to: 'all' })).toEqual({
        ok: false,
        error: 'INVALID_OFFER',
      });
    }
  });

  it('rejects amounts that are not non-negative integers', () => {
    const state = trading();
    for (const amount of [1.5, -1, Number.NaN]) {
      expect(
        applyAction(state, ANA.id, {
          type: 'createOffer',
          give: { wood: amount },
          want: { ore: 1 },
          to: 'all',
        }),
      ).toEqual({ ok: false, error: 'INVALID_AMOUNT' });
    }
  });

  it('cannot offer cards the proposer does not hold', () => {
    expect(
      applyAction(trading(), ANA.id, {
        type: 'createOffer',
        give: { ore: 1 },
        want: { wood: 1 },
        to: 'all',
      }),
    ).toEqual({ ok: false, error: 'INSUFFICIENT_RESOURCES' });
  });

  it('is only for the active player, in the main phase', () => {
    const state = trading();
    expect(
      applyAction(state, BRUNO.id, {
        type: 'createOffer',
        give: { ore: 1 },
        want: { wood: 1 },
        to: 'all',
      }),
    ).toEqual({ ok: false, error: 'NOT_YOUR_TURN' });

    const preRoll = draft(state, (s) => {
      s.phase = { kind: 'preRoll' };
    });
    expect(
      applyAction(preRoll, ANA.id, {
        type: 'createOffer',
        give: { wood: 1 },
        want: { ore: 1 },
        to: 'all',
      }),
    ).toEqual({ ok: false, error: 'WRONG_PHASE' });
  });

  it('stops at three open offers, counteroffers aside (SPEC §12.6)', () => {
    let state = trading();
    for (let i = 0; i < MAX_OPEN_OFFERS; i += 1) {
      state = applyOrThrow(state, ANA.id, {
        type: 'createOffer',
        give: { wood: 1 },
        want: { ore: 1 },
        to: 'all',
      }).state;
    }
    expect(
      applyAction(state, ANA.id, {
        type: 'createOffer',
        give: { wood: 1 },
        want: { ore: 1 },
        to: 'all',
      }),
    ).toEqual({ ok: false, error: 'TOO_MANY_OFFERS' });

    // A counteroffer still gets through: it is not one of hers.
    const countered = applyOrThrow(state, BRUNO.id, {
      type: 'counterOffer',
      offerId: state.tradeOffers[0]?.id ?? '',
      give: { ore: 1 },
      want: { wood: 3 },
    });
    expect(countered.state.tradeOffers).toHaveLength(MAX_OPEN_OFFERS + 1);
  });
});

describe('answering an offer', () => {
  it('is for the targets, on somebody else’s turn', () => {
    const { state } = openOffer();
    const offerId = state.tradeOffers[0]?.id ?? '';

    const { state: after } = applyOrThrow(state, BRUNO.id, {
      type: 'respondOffer',
      offerId,
      response: 'accept',
    });
    expect(after.tradeOffers[0]?.responses[BRUNO.id]).toBe('accepted');
    expect(after.currentPlayer).toBe(ANA.id);
  });

  it('is not for whoever made it', () => {
    const { state } = openOffer();
    expect(
      applyAction(state, ANA.id, {
        type: 'respondOffer',
        offerId: state.tradeOffers[0]?.id ?? '',
        response: 'accept',
      }),
    ).toEqual({ ok: false, error: 'NOT_OFFER_TARGET' });
  });

  it('is not for somebody the offer was not sent to', () => {
    const { state } = applyOrThrow(trading(), ANA.id, {
      type: 'createOffer',
      give: { wood: 1 },
      want: { ore: 1 },
      to: [BRUNO.id],
    });
    expect(
      applyAction(state, CATA.id, {
        type: 'respondOffer',
        offerId: state.tradeOffers[0]?.id ?? '',
        response: 'accept',
      }),
    ).toEqual({ ok: false, error: 'NOT_OFFER_TARGET' });
  });

  it('can be changed while the offer is open', () => {
    // At a table people say no and then think again. Nothing rides on the
    // answer: confirmTrade revalidates both hands when the deal is closed.
    const { state } = openOffer();
    const offerId = state.tradeOffers[0]?.id ?? '';

    const rejected = applyOrThrow(state, BRUNO.id, {
      type: 'respondOffer',
      offerId,
      response: 'reject',
    }).state;
    expect(rejected.tradeOffers[0]?.responses[BRUNO.id]).toBe('rejected');

    const reconsidered = applyOrThrow(rejected, BRUNO.id, {
      type: 'respondOffer',
      offerId,
      response: 'accept',
    }).state;
    expect(reconsidered.tradeOffers[0]?.responses[BRUNO.id]).toBe('accepted');

    // And the change is what the active player sees to confirm with.
    expect(getPlayerView(reconsidered, ANA.id).legalMoves.offers[offerId]?.confirmWith).toEqual([
      BRUNO.id,
    ]);
  });
});

describe('countering', () => {
  it('goes back only to whoever made the original', () => {
    const { state } = openOffer();
    const parentId = state.tradeOffers[0]?.id ?? '';

    const { state: after } = applyOrThrow(state, BRUNO.id, {
      type: 'counterOffer',
      offerId: parentId,
      give: { ore: 1 },
      want: { wood: 3 },
    });

    const counter = after.tradeOffers.find((offer) => offer.parentOfferId === parentId);
    expect(counter?.from).toBe(BRUNO.id);
    expect(counter?.to).toEqual([ANA.id]);
  });

  it('replaces the previous counter from the same player', () => {
    const { state } = openOffer();
    const parentId = state.tradeOffers[0]?.id ?? '';

    let after = applyOrThrow(state, BRUNO.id, {
      type: 'counterOffer',
      offerId: parentId,
      give: { ore: 1 },
      want: { wood: 3 },
    }).state;
    after = applyOrThrow(after, BRUNO.id, {
      type: 'counterOffer',
      offerId: parentId,
      give: { ore: 2 },
      want: { wood: 3 },
    }).state;

    const counters = after.tradeOffers.filter(
      (offer) => offer.parentOfferId === parentId && offer.from === BRUNO.id,
    );
    expect(counters).toHaveLength(1);
    expect(counters[0]?.give).toEqual({ ore: 2 });
  });

  it('is one level deep', () => {
    const { state } = openOffer();
    const parentId = state.tradeOffers[0]?.id ?? '';
    const { state: after } = applyOrThrow(state, BRUNO.id, {
      type: 'counterOffer',
      offerId: parentId,
      give: { ore: 1 },
      want: { wood: 3 },
    });
    const counterId = after.tradeOffers.find((offer) => offer.parentOfferId)?.id ?? '';

    expect(
      applyAction(after, CATA.id, {
        type: 'counterOffer',
        offerId: counterId,
        give: { wheat: 1 },
        want: { wood: 1 },
      }),
    ).toEqual({ ok: false, error: 'COUNTER_NOT_ALLOWED' });
  });
});

describe('closing a deal', () => {
  const accepted = () => {
    const { state } = openOffer();
    const offerId = state.tradeOffers[0]?.id ?? '';
    return {
      offerId,
      state: applyOrThrow(state, BRUNO.id, {
        type: 'respondOffer',
        offerId,
        response: 'accept',
      }).state,
    };
  };

  it('moves the cards both ways and closes that offer', () => {
    const { state: before, offerId } = accepted();
    const { state, events } = applyOrThrow(before, ANA.id, {
      type: 'confirmTrade',
      offerId,
      withPlayer: BRUNO.id,
    });

    expect(handOf(state, ANA.id).wood).toBe(handOf(before, ANA.id).wood - 2);
    expect(handOf(state, ANA.id).ore).toBe(1);
    expect(handOf(state, BRUNO.id).wood).toBe(2);
    expect(handOf(state, BRUNO.id).ore).toBe(handOf(before, BRUNO.id).ore - 1);
    expect(state.bank).toEqual(before.bank);
    for (const resource of RESOURCES) expect(totalOf(state, resource)).toBe(BANK_RESOURCE_COUNT);

    expect(state.tradeOffers).toHaveLength(0);
    expect(events.some((event) => event.type === 'TradeConfirmed')).toBe(true);
  });

  it('needs an acceptance', () => {
    const { state } = openOffer();
    expect(
      applyAction(state, ANA.id, {
        type: 'confirmTrade',
        offerId: state.tradeOffers[0]?.id ?? '',
        withPlayer: BRUNO.id,
      }),
    ).toEqual({ ok: false, error: 'NOT_ACCEPTED' });
  });

  it('is refused when a hand moved on, and the offer stays open', () => {
    const { state: before, offerId } = accepted();
    // Bruno spends the ore he had promised.
    const poorer = draft(before, (s) => {
      const bruno = s.players.find((player) => player.id === BRUNO.id);
      if (bruno) {
        s.bank.ore += bruno.resources.ore;
        bruno.resources.ore = 0;
      }
    });

    expect(
      applyAction(poorer, ANA.id, { type: 'confirmTrade', offerId, withPlayer: BRUNO.id }),
    ).toEqual({ ok: false, error: 'INSUFFICIENT_RESOURCES' });
    expect(poorer.tradeOffers).toHaveLength(1);
  });

  it('closes a counteroffer directly, without a separate acceptance', () => {
    const { state } = openOffer();
    const parentId = state.tradeOffers[0]?.id ?? '';
    const countered = applyOrThrow(state, BRUNO.id, {
      type: 'counterOffer',
      offerId: parentId,
      give: { ore: 2 },
      want: { wood: 3 },
    }).state;
    const counterId = countered.tradeOffers.find((offer) => offer.parentOfferId)?.id ?? '';

    const { state: after } = applyOrThrow(countered, ANA.id, {
      type: 'confirmTrade',
      offerId: counterId,
      withPlayer: BRUNO.id,
    });

    expect(handOf(after, ANA.id).ore).toBe(2);
    expect(handOf(after, BRUNO.id).wood).toBe(3);
    // The original goes with its counter.
    expect(after.tradeOffers).toHaveLength(0);
  });
});

describe('offers ending', () => {
  it('takes its counteroffers with it when cancelled', () => {
    const { state } = openOffer();
    const parentId = state.tradeOffers[0]?.id ?? '';
    const countered = applyOrThrow(state, BRUNO.id, {
      type: 'counterOffer',
      offerId: parentId,
      give: { ore: 1 },
      want: { wood: 3 },
    }).state;
    expect(countered.tradeOffers).toHaveLength(2);

    const { state: after } = applyOrThrow(countered, ANA.id, {
      type: 'cancelOffer',
      offerId: parentId,
    });
    expect(after.tradeOffers).toHaveLength(0);
  });

  it('can only be cancelled by whoever made it', () => {
    const { state } = openOffer();
    expect(
      applyAction(state, CATA.id, {
        type: 'cancelOffer',
        offerId: state.tradeOffers[0]?.id ?? '',
      }),
    ).toEqual({ ok: false, error: 'NOT_OFFER_OWNER' });
  });

  it('all die with the turn', () => {
    const { state } = openOffer();
    const { state: after, events } = applyOrThrow(state, ANA.id, { type: 'endTurn' });
    expect(after.tradeOffers).toEqual([]);
    expect(events.some((event) => event.type === 'OfferCancelled')).toBe(true);
  });
});

describe('what the view offers a player', () => {
  it('says who may accept, counter, cancel and confirm', () => {
    const { state } = openOffer();
    const offerId = state.tradeOffers[0]?.id ?? '';

    const bruno = getPlayerView(state, BRUNO.id).legalMoves.offers[offerId];
    expect(bruno?.canAccept).toBe(true);
    expect(bruno?.canCounter).toBe(true);
    expect(bruno?.canCancel).toBe(false);
    expect(bruno?.confirmWith).toEqual([]);

    const ana = getPlayerView(state, ANA.id).legalMoves.offers[offerId];
    expect(ana?.canAccept).toBe(false);
    expect(ana?.canCancel).toBe(true);
    expect(ana?.confirmWith).toEqual([]);

    const afterAccept = applyOrThrow(state, BRUNO.id, {
      type: 'respondOffer',
      offerId,
      response: 'accept',
    }).state;
    expect(getPlayerView(afterAccept, ANA.id).legalMoves.offers[offerId]?.confirmWith).toEqual([
      BRUNO.id,
    ]);
  });
});

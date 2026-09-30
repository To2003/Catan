import type { GameEvent } from '../events.js';
import type { GameState, PlayerId, ReadonlyGameState, TradeOffer } from '../types.js';

/**
 * Walking out of a game for good (SPEC.md §7.1).
 *
 * Their pieces and cards stay exactly where they are: taking them off the
 * board would rewrite a game everybody else already played. What changes is
 * what happens from here — the server plays their turns, and nobody can trade
 * with somebody who is not there.
 *
 * This is an action and not a presence flag precisely because of that second
 * part. `connected` never enters the action list, and it can afford not to,
 * since no rule reads it. This one is read by the trade rules, so a replay
 * that did not see it would deal different offers than the game that was
 * played.
 */

/** Everybody still in the game: the ones a trade can reach. */
export const activePlayers = (state: ReadonlyGameState): readonly PlayerId[] =>
  state.players.filter((player) => !player.hasLeft).map((player) => player.id);

export const hasLeft = (state: ReadonlyGameState, playerId: PlayerId): boolean =>
  state.players.find((player) => player.id === playerId)?.hasLeft ?? false;

export const leaveGame = (draft: GameState, playerId: PlayerId, events: GameEvent[]): void => {
  const player = draft.players.find((candidate) => candidate.id === playerId);
  if (!player) throw new Error(`no player ${playerId}`);
  player.hasLeft = true;

  // Their own offers go, and so does their name on everybody else's: an offer
  // waiting on an answer that will never come is an offer nobody can close.
  const surviving: TradeOffer[] = [];
  for (const offer of draft.tradeOffers) {
    if (offer.from === playerId) {
      events.push({ type: 'OfferCancelled', offerId: offer.id });
      continue;
    }

    if (!offer.to.includes(playerId)) {
      surviving.push(offer);
      continue;
    }

    const to = offer.to.filter((target) => target !== playerId);
    if (to.length === 0) {
      events.push({ type: 'OfferCancelled', offerId: offer.id });
      continue;
    }

    const responses = Object.fromEntries(
      Object.entries(offer.responses).filter(([player]) => player !== playerId),
    );
    surviving.push({ ...offer, to, responses });
  }
  draft.tradeOffers = surviving;

  events.push({ type: 'PlayerLeft', player: playerId });
};

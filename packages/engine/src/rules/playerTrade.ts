import { RESOURCES } from '../constants.js';
import type { GameEvent } from '../events.js';
import type {
  GameState,
  PlayerId,
  ReadonlyGameState,
  ResourceBundle,
  TradeOffer,
} from '../types.js';

/**
 * Trading between players (SPEC.md §4.9, §12.5, §12.6).
 *
 * Only the active player opens offers, and only they confirm one. Everybody
 * else answers: accept, reject, or counter. Nothing moves until a confirm, and
 * a confirm revalidates both hands — an offer made three moves ago may no
 * longer be payable.
 */

const playerIn = (draft: GameState, playerId: PlayerId) => {
  const player = draft.players.find((candidate) => candidate.id === playerId);
  if (!player) throw new Error(`no player ${playerId}`);
  return player;
};

export const isCounterOffer = (offer: TradeOffer): boolean => offer.parentOfferId !== undefined;

/** Offers the active player opened, counteroffers aside (SPEC.md §12.6). */
export const openOffersOf = (state: ReadonlyGameState, playerId: PlayerId): TradeOffer[] =>
  state.tradeOffers.filter((offer) => offer.from === playerId && !isCounterOffer(offer));

export const offerById = (state: ReadonlyGameState, offerId: string): TradeOffer | undefined =>
  state.tradeOffers.find((offer) => offer.id === offerId);

/** Whether a player holds everything a bundle asks for. */
export const holds = (
  resources: Readonly<ResourceBundle>,
  bundle: Partial<ResourceBundle>,
): boolean => RESOURCES.every((resource) => resources[resource] >= (bundle[resource] ?? 0));

export const bundleTotal = (bundle: Partial<ResourceBundle>): number =>
  RESOURCES.reduce((sum, resource) => sum + (bundle[resource] ?? 0), 0);

/** No resource may sit on both sides, and neither side may be empty (SPEC.md §12.5). */
export const sidesAreValid = (
  give: Partial<ResourceBundle>,
  want: Partial<ResourceBundle>,
): boolean => {
  if (bundleTotal(give) < 1 || bundleTotal(want) < 1) return false;
  return !RESOURCES.some((resource) => (give[resource] ?? 0) > 0 && (want[resource] ?? 0) > 0);
};

/**
 * Offer ids come from the state's own version counter.
 *
 * The engine has no randomness to spare on this and must stay replayable, and
 * exactly one offer is created per action, so the version an action runs at is
 * already unique.
 */
const nextOfferId = (draft: GameState): string => `o${draft.version + 1}`;

const pendingResponses = (targets: readonly PlayerId[]): TradeOffer['responses'] =>
  Object.fromEntries(targets.map((target) => [target, 'pending' as const]));

export const createOffer = (
  draft: GameState,
  playerId: PlayerId,
  give: Partial<ResourceBundle>,
  want: Partial<ResourceBundle>,
  to: readonly PlayerId[] | 'all',
  events: GameEvent[],
): void => {
  const targets =
    to === 'all'
      ? // "Everybody" means everybody still in the game.
        draft.players
          .filter((player) => player.id !== playerId && !player.hasLeft)
          .map((player) => player.id)
      : [...to];

  const offer: TradeOffer = {
    id: nextOfferId(draft),
    from: playerId,
    give: { ...give },
    want: { ...want },
    to: targets,
    responses: pendingResponses(targets),
  };

  draft.tradeOffers.push(offer);
  events.push({ type: 'OfferCreated', offer });
};

export const respondOffer = (
  draft: GameState,
  playerId: PlayerId,
  offerId: string,
  response: 'accept' | 'reject',
  events: GameEvent[],
): void => {
  const offer = draft.tradeOffers.find((candidate) => candidate.id === offerId);
  if (!offer) throw new Error(`no offer ${offerId}`);

  offer.responses[playerId] = response === 'accept' ? 'accepted' : 'rejected';
  events.push({ type: 'OfferResponded', offerId, player: playerId, response });
};

export const counterOffer = (
  draft: GameState,
  playerId: PlayerId,
  offerId: string,
  give: Partial<ResourceBundle>,
  want: Partial<ResourceBundle>,
  events: GameEvent[],
): void => {
  const parent = draft.tradeOffers.find((candidate) => candidate.id === offerId);
  if (!parent) throw new Error(`no offer ${offerId}`);

  // One live counter per player per offer: a new one replaces the old
  // (SPEC.md §12.6).
  draft.tradeOffers = draft.tradeOffers.filter(
    (candidate) => !(candidate.parentOfferId === offerId && candidate.from === playerId),
  );

  const offer: TradeOffer = {
    id: nextOfferId(draft),
    from: playerId,
    give: { ...give },
    want: { ...want },
    // A counteroffer only ever goes back to whoever made the original.
    to: [parent.from],
    responses: pendingResponses([parent.from]),
    parentOfferId: offerId,
  };

  draft.tradeOffers.push(offer);
  events.push({ type: 'CounterOffered', offer, parentOfferId: offerId });
};

/** Cancels an offer and, with it, every counter that hung off it (SPEC.md §12.6). */
export const cancelOffer = (draft: GameState, offerId: string, events: GameEvent[]): void => {
  draft.tradeOffers = draft.tradeOffers.filter(
    (offer) => offer.id !== offerId && offer.parentOfferId !== offerId,
  );
  events.push({ type: 'OfferCancelled', offerId });
};

export const confirmTrade = (
  draft: GameState,
  playerId: PlayerId,
  offerId: string,
  withPlayer: PlayerId,
  events: GameEvent[],
): void => {
  const offer = draft.tradeOffers.find((candidate) => candidate.id === offerId);
  if (!offer) throw new Error(`no offer ${offerId}`);

  // On your own offer the other side is whoever you named; on a counteroffer
  // sent to you, the other side is you.
  const counterpartyId = offer.from === playerId ? withPlayer : playerId;
  const proposer = playerIn(draft, offer.from);
  const other = playerIn(draft, counterpartyId);

  for (const resource of RESOURCES) {
    const given = offer.give[resource] ?? 0;
    const wanted = offer.want[resource] ?? 0;
    proposer.resources[resource] += wanted - given;
    other.resources[resource] += given - wanted;
  }

  events.push({
    type: 'TradeConfirmed',
    offerId,
    from: offer.from,
    with: counterpartyId,
    give: { ...offer.give },
    want: { ...offer.want },
  });

  // The deal that just happened is over, and so is anything hanging off it.
  // Other offers stay open: nothing in the rules closes them.
  cancelOffer(draft, offer.parentOfferId ?? offerId, events);
};

/** Every offer dies with the turn (SPEC.md §4.9). */
export const clearOffers = (draft: GameState, events: GameEvent[]): void => {
  if (draft.tradeOffers.length === 0) return;
  for (const offer of draft.tradeOffers) events.push({ type: 'OfferCancelled', offerId: offer.id });
  draft.tradeOffers = [];
};

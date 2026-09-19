import { DEV_CARDS, RESOURCES } from './constants.js';
import { availableMaritimeRates } from './rules/trade.js';
import { canCounterOffer, canOpenOffer, isLegalAction, validateAction } from './validate.js';
import type {
  Action,
  DevCard,
  EdgeId,
  ErrorCode,
  HexId,
  PlayerId,
  ReadonlyGameState,
  Resource,
  VertexId,
} from './types.js';

/**
 * Legal moves, for highlighting them in the UI.
 *
 * **These functions contain no rules.** Each one enumerates the candidates and
 * filters them through `validateAction`, so legality here is legality there by
 * construction. A property test pins that down, which is the point: if somebody
 * ever "optimises" this file by restating a rule, the test fails.
 *
 * `discard` is the one action with no enumeration here: a discard is a
 * combination of cards, not a spot on the board, so the space is combinatorial
 * and no UI wants it as a list. For discards `validate` is the whole story —
 * the discard modal checks a selection against it as the player builds one.
 */

export const legalSettlementSpots = (
  state: ReadonlyGameState,
  playerId: PlayerId,
): readonly VertexId[] =>
  state.board.vertexIds.filter((vertex) =>
    isLegalAction(state, playerId, { type: 'placeSettlement', vertex }),
  );

export const legalRoadSpots = (state: ReadonlyGameState, playerId: PlayerId): readonly EdgeId[] =>
  state.board.edgeIds.filter((edge) => isLegalAction(state, playerId, { type: 'placeRoad', edge }));

export const legalCitySpots = (state: ReadonlyGameState, playerId: PlayerId): readonly VertexId[] =>
  state.board.vertexIds.filter((vertex) =>
    isLegalAction(state, playerId, { type: 'upgradeCity', vertex }),
  );

export const canRollDice = (state: ReadonlyGameState, playerId: PlayerId): boolean =>
  isLegalAction(state, playerId, { type: 'rollDice' });

export const canEndTurn = (state: ReadonlyGameState, playerId: PlayerId): boolean =>
  isLegalAction(state, playerId, { type: 'endTurn' });

/**
 * Where the robber may go: anywhere but where it stands. The desert counts
 * (SPEC.md §4.8).
 */
export const legalRobberHexes = (state: ReadonlyGameState, playerId: PlayerId): readonly HexId[] =>
  state.board.hexIds.filter((hex) => isLegalAction(state, playerId, { type: 'moveRobber', hex }));

/** Who may be robbed right now. */
export const legalStealTargets = (
  state: ReadonlyGameState,
  playerId: PlayerId,
): readonly PlayerId[] =>
  state.players
    .map((player) => player.id)
    .filter((target) => isLegalAction(state, playerId, { type: 'steal', target }));

/**
 * Every maritime trade the player could make right now: at most 20 pairs, so
 * unlike a discard this one enumerates comfortably.
 */
export const legalMaritimeTrades = (
  state: ReadonlyGameState,
  playerId: PlayerId,
): readonly { give: Resource; want: Resource }[] =>
  RESOURCES.flatMap((give) =>
    RESOURCES.filter((want) =>
      isLegalAction(state, playerId, { type: 'maritimeTrade', give, want }),
    ).map((want) => ({ give, want })),
  );

/** What a player may do with one open offer. */
export interface OfferOptions {
  readonly canAccept: boolean;
  readonly canReject: boolean;
  readonly canCounter: boolean;
  readonly canCancel: boolean;
  /** Who this player could close the deal with right now. */
  readonly confirmWith: readonly PlayerId[];
}

/** Why a development card cannot be played, straight from the rules. */
export interface DevCardOption {
  readonly playable: boolean;
  /** The engine's own code, for the UI to translate. Absent when playable. */
  readonly reason?: ErrorCode;
}

/**
 * Everything a player could do right now, in one object.
 *
 * It exists because over the network the client no longer holds the state and
 * cannot ask `legal.ts` itself. Rather than teach the client the rules, the
 * server computes this and ships it inside the view; the hot-seat computes the
 * same thing locally. One statement of the rules, two callers.
 */
export interface LegalMoves {
  readonly settlements: readonly VertexId[];
  readonly roads: readonly EdgeId[];
  readonly cities: readonly VertexId[];
  readonly robberHexes: readonly HexId[];
  readonly stealTargets: readonly PlayerId[];
  readonly maritimeTrades: readonly { give: Resource; want: Resource }[];
  /** The rate for every resource, so the UI can show it without computing it. */
  readonly maritimeRates: Readonly<Record<Resource, number>>;
  /**
   * Playability per card type. Deliberately *not* called `devCards`: that name
   * belongs to a hand, and the view's leak test reads keys, not intentions.
   */
  readonly devCardOptions: Readonly<Record<DevCard, DevCardOption>>;
  readonly canBuyDevCard: boolean;
  readonly canCreateOffer: boolean;
  /** What this player may do with each open offer, keyed by offer id. */
  readonly offers: Readonly<Record<string, OfferOptions>>;
  readonly canRoll: boolean;
  readonly canEndTurn: boolean;
  /** How many cards this player owes right now, if any (SPEC.md §4.8). */
  readonly discardOwed?: number;
}

/** The action each card is played with. Victory cards have none: they are never played. */
const PLAY_ACTION: Record<DevCard, Action | undefined> = {
  knight: { type: 'playKnight' },
  roadBuilding: { type: 'playRoadBuilding' },
  // The real resources are chosen by the player; any valid pair answers
  // "could this be played at all?".
  yearOfPlenty: { type: 'playYearOfPlenty', resources: ['wood', 'wood'] },
  monopoly: { type: 'playMonopoly', resource: 'wood' },
  vp: undefined,
};

const devCardOptions = (
  state: ReadonlyGameState,
  playerId: PlayerId,
): Record<DevCard, DevCardOption> => {
  const options = {} as Record<DevCard, DevCardOption>;
  for (const card of DEV_CARDS) {
    const action = PLAY_ACTION[card];
    if (!action) {
      options[card] = { playable: false };
      continue;
    }
    const error = validateAction(state, playerId, action);
    options[card] = error === null ? { playable: true } : { playable: false, reason: error };
  }
  return options;
};

const offerOptions = (
  state: ReadonlyGameState,
  playerId: PlayerId,
): Record<string, OfferOptions> => {
  const options: Record<string, OfferOptions> = {};

  for (const offer of state.tradeOffers) {
    options[offer.id] = {
      canAccept: isLegalAction(state, playerId, {
        type: 'respondOffer',
        offerId: offer.id,
        response: 'accept',
      }),
      canReject: isLegalAction(state, playerId, {
        type: 'respondOffer',
        offerId: offer.id,
        response: 'reject',
      }),
      // Asked without cards, since the player has not chosen any yet: what is
      // being answered is "may I counter this at all?".
      canCounter: canCounterOffer(state, playerId, offer.id) === null,
      canCancel: isLegalAction(state, playerId, { type: 'cancelOffer', offerId: offer.id }),
      confirmWith: state.players
        .map((player) => player.id)
        .filter((withPlayer) =>
          isLegalAction(state, playerId, {
            type: 'confirmTrade',
            offerId: offer.id,
            withPlayer,
          }),
        ),
    };
  }

  return options;
};

export const legalMoves = (state: ReadonlyGameState, playerId: PlayerId): LegalMoves => {
  const owed = state.phase.kind === 'discard' ? state.phase.pending[playerId] : undefined;

  return {
    settlements: legalSettlementSpots(state, playerId),
    roads: legalRoadSpots(state, playerId),
    cities: legalCitySpots(state, playerId),
    robberHexes: legalRobberHexes(state, playerId),
    stealTargets: legalStealTargets(state, playerId),
    maritimeTrades: legalMaritimeTrades(state, playerId),
    maritimeRates: availableMaritimeRates(state, playerId),
    devCardOptions: devCardOptions(state, playerId),
    canBuyDevCard: isLegalAction(state, playerId, { type: 'buyDevCard' }),
    canCreateOffer: canOpenOffer(state, playerId) === null,
    offers: offerOptions(state, playerId),
    canRoll: canRollDice(state, playerId),
    canEndTurn: canEndTurn(state, playerId),
    ...(owed === undefined ? {} : { discardOwed: owed }),
  };
};

import { COSTS, MAX_OPEN_OFFERS, RESOURCES, emptyBundle } from './constants.js';
import {
  holds,
  isCounterOffer,
  offerById,
  openOffersOf,
  sidesAreValid,
} from './rules/playerTrade.js';
import { hasLegalFreeRoad, playableCount } from './rules/devCards.js';
import { canTradeMaritime } from './rules/trade.js';
import { hasLeft } from './rules/leave.js';
import {
  canAfford,
  edgeOf,
  playerOf,
  respectsDistanceRule,
  roadConnects,
  settlementConnects,
  vertexOf,
} from './rules/placement.js';
import type {
  Action,
  DevCard,
  EdgeId,
  ErrorCode,
  HexId,
  PlayerId,
  ReadonlyGameState,
  ResourceBundle,
  VertexId,
} from './types.js';

/**
 * The single statement of "is this move legal?".
 *
 * `applyAction` calls it first and no handler revalidates; `legal.ts` filters
 * candidates through it rather than restating any rule. Returns `null` when the
 * action is legal, or the code to reject it with.
 */

const validateSettlement = (
  state: ReadonlyGameState,
  playerId: PlayerId,
  vertex: VertexId,
): ErrorCode | null => {
  if (!vertexOf(state.board, vertex)) return 'INVALID_TARGET';

  const phase = state.phase;
  const inSetup = phase.kind === 'setup' && phase.step === 'settlement';
  if (!inSetup && phase.kind !== 'main') return 'WRONG_PHASE';

  if (state.buildings[vertex] !== undefined) return 'OCCUPIED';
  if (!respectsDistanceRule(state, vertex)) return 'DISTANCE_RULE';

  const player = playerOf(state, playerId);
  if (!player) return 'INVALID_TARGET';
  if (player.stock.settlements <= 0) return 'NOT_ENOUGH_PIECES';

  // Setup placements are free and need no road (SPEC.md §4.5).
  if (inSetup) return null;

  if (!settlementConnects(state, playerId, vertex)) return 'NOT_CONNECTED';
  if (!canAfford(player.resources, COSTS.settlement)) return 'INSUFFICIENT_RESOURCES';
  return null;
};

const validateRoad = (
  state: ReadonlyGameState,
  playerId: PlayerId,
  edge: EdgeId,
): ErrorCode | null => {
  const link = edgeOf(state.board, edge);
  if (!link) return 'INVALID_TARGET';

  const phase = state.phase;
  const inSetup = phase.kind === 'setup' && phase.step === 'road';
  const freeRoad = phase.kind === 'roadBuilding';
  if (!inSetup && !freeRoad && phase.kind !== 'main') return 'WRONG_PHASE';

  if (state.roads[edge] !== undefined) return 'OCCUPIED';

  const player = playerOf(state, playerId);
  if (!player) return 'INVALID_TARGET';
  if (player.stock.roads <= 0) return 'NOT_ENOUGH_PIECES';

  // The road building card pays for these (SPEC.md §4.10).
  if (freeRoad) return roadConnects(state, playerId, edge) ? null : 'NOT_CONNECTED';

  if (inSetup) {
    // The setup road leaves the settlement just placed, not any other of its
    // owner's (SPEC.md §4.5).
    const from = phase.lastSettlement;
    if (from === undefined) return 'WRONG_PHASE';
    return link.vertices.includes(from) ? null : 'NOT_CONNECTED';
  }

  if (!roadConnects(state, playerId, edge)) return 'NOT_CONNECTED';
  if (!canAfford(player.resources, COSTS.road)) return 'INSUFFICIENT_RESOURCES';
  return null;
};

const validateCity = (
  state: ReadonlyGameState,
  playerId: PlayerId,
  vertex: VertexId,
): ErrorCode | null => {
  if (!vertexOf(state.board, vertex)) return 'INVALID_TARGET';
  if (state.phase.kind !== 'main') return 'WRONG_PHASE';

  const building = state.buildings[vertex];
  if (!building) return 'NO_SETTLEMENT';
  if (building.owner !== playerId) return 'NOT_OWNER';
  if (building.type === 'city') return 'ALREADY_CITY';

  const player = playerOf(state, playerId);
  if (!player) return 'INVALID_TARGET';
  if (player.stock.cities <= 0) return 'NOT_ENOUGH_PIECES';
  if (!canAfford(player.resources, COSTS.city)) return 'INSUFFICIENT_RESOURCES';
  return null;
};

/**
 * Every amount arriving in an action has to be a non-negative integer.
 *
 * In M6 actions come off the wire, where the types do not exist: NaN, 1.5 and
 * -1 are all things a client can send, and validate is the last line of
 * defence before the numbers reach the bank.
 */
const validAmounts = (amounts: Partial<ResourceBundle>): boolean =>
  RESOURCES.every((resource) => {
    const amount = amounts[resource];
    if (amount === undefined) return true;
    return Number.isInteger(amount) && amount >= 0;
  });

const validateDiscard = (
  state: ReadonlyGameState,
  playerId: PlayerId,
  cards: Partial<ResourceBundle>,
): ErrorCode | null => {
  const phase = state.phase;
  if (phase.kind !== 'discard') return 'WRONG_PHASE';

  // Anyone still owing cards may act, whoever's turn it is (SPEC.md §4.8).
  const owed = phase.pending[playerId];
  if (owed === undefined) return 'NOT_YOUR_TURN';

  if (!validAmounts(cards)) return 'INVALID_AMOUNT';

  const player = playerOf(state, playerId);
  if (!player) return 'INVALID_TARGET';

  let total = 0;
  for (const resource of RESOURCES) {
    const amount = cards[resource] ?? 0;
    if (amount > player.resources[resource]) return 'INSUFFICIENT_RESOURCES';
    total += amount;
  }
  // One discard, for exactly what is owed: no partial discards (SPEC.md §4.8).
  return total === owed ? null : 'INVALID_DISCARD';
};

/**
 * The rules every development card shares (SPEC.md §4.10): one card per turn,
 * never one bought this turn, and only the knight may be played before the
 * roll.
 */
const validatePlayCard = (
  state: ReadonlyGameState,
  playerId: PlayerId,
  card: DevCard,
): ErrorCode | null => {
  const allowed = card === 'knight' ? ['preRoll', 'main'] : ['main'];
  if (!allowed.includes(state.phase.kind)) return 'WRONG_PHASE';
  if (state.devCardPlayedThisTurn) return 'ALREADY_PLAYED_DEV_CARD';

  const player = playerOf(state, playerId);
  if (!player) return 'INVALID_TARGET';
  if (!player.devCards.includes(card)) return 'CARD_NOT_IN_HAND';
  if (playableCount(state, playerId, card) < 1) return 'CARD_BOUGHT_THIS_TURN';
  return null;
};

const validateMoveRobber = (state: ReadonlyGameState, hex: HexId): ErrorCode | null => {
  if (state.phase.kind !== 'moveRobber') return 'WRONG_PHASE';
  if (!state.board.hexes[hex]) return 'INVALID_TARGET';
  // It has to move somewhere else; the desert is fair game (SPEC.md §4.8).
  return hex === state.robberHex ? 'INVALID_TARGET' : null;
};

const validateSteal = (state: ReadonlyGameState, target: PlayerId): ErrorCode | null => {
  const phase = state.phase;
  if (phase.kind !== 'steal') return 'WRONG_PHASE';
  return phase.candidates.includes(target) ? null : 'INVALID_TARGET';
};

/** The checks every offer shares, whether it opens a negotiation or answers one. */
const validateSides = (
  player: { resources: Readonly<ResourceBundle> },
  give: Partial<ResourceBundle>,
  want: Partial<ResourceBundle>,
): ErrorCode | null => {
  if (!validAmounts(give) || !validAmounts(want)) return 'INVALID_AMOUNT';
  if (!sidesAreValid(give, want)) return 'INVALID_OFFER';
  // You cannot offer what you do not have. It is checked again on confirm,
  // because a hand can change while an offer sits on the table.
  if (!holds(player.resources, give)) return 'INSUFFICIENT_RESOURCES';
  return null;
};

/**
 * Whether this player could open an offer at all, leaving aside what is in it.
 *
 * Split out because `legal.ts` has to answer "may I open an offer?" before the
 * player has chosen any cards, and a probe with made-up cards would answer a
 * different question.
 */
export const canOpenOffer = (state: ReadonlyGameState, playerId: PlayerId): ErrorCode | null => {
  if (state.phase.kind === 'gameOver') return 'GAME_OVER';
  if (state.phase.kind !== 'main') return 'WRONG_PHASE';
  if (state.currentPlayer !== playerId) return 'NOT_YOUR_TURN';
  if (!playerOf(state, playerId)) return 'INVALID_TARGET';
  if (openOffersOf(state, playerId).length >= MAX_OPEN_OFFERS) return 'TOO_MANY_OFFERS';
  return null;
};

/** The same, for countering one particular offer. */
export const canCounterOffer = (
  state: ReadonlyGameState,
  playerId: PlayerId,
  offerId: string,
): ErrorCode | null => {
  if (state.phase.kind === 'gameOver') return 'GAME_OVER';
  if (state.phase.kind !== 'main') return 'WRONG_PHASE';

  const offer = offerById(state, offerId);
  if (!offer) return 'OFFER_NOT_FOUND';
  if (isCounterOffer(offer)) return 'COUNTER_NOT_ALLOWED';
  if (offer.from === playerId) return 'NOT_OFFER_TARGET';
  if (!offer.to.includes(playerId)) return 'NOT_OFFER_TARGET';
  if (!playerOf(state, playerId)) return 'INVALID_TARGET';
  return null;
};

const validateCreateOffer = (
  state: ReadonlyGameState,
  playerId: PlayerId,
  action: Extract<Action, { type: 'createOffer' }>,
): ErrorCode | null => {
  const eligible = canOpenOffer(state, playerId);
  if (eligible !== null) return eligible;

  const player = playerOf(state, playerId);
  if (!player) return 'INVALID_TARGET';

  if (action.to !== 'all') {
    if (action.to.length === 0) return 'INVALID_TARGET';
    const unique = new Set(action.to);
    if (unique.size !== action.to.length) return 'INVALID_TARGET';
    for (const target of action.to) {
      // Somebody who walked out cannot be traded with; offering to them would
      // be an offer that can never be answered.
      if (target === playerId || !playerOf(state, target) || hasLeft(state, target)) {
        return 'INVALID_TARGET';
      }
    }
  }

  return validateSides(player, action.give, action.want);
};

const validateRespondOffer = (
  state: ReadonlyGameState,
  playerId: PlayerId,
  action: Extract<Action, { type: 'respondOffer' }>,
): ErrorCode | null => {
  if (state.phase.kind !== 'main') return 'WRONG_PHASE';

  const offer = offerById(state, action.offerId);
  if (!offer) return 'OFFER_NOT_FOUND';
  if (offer.from === playerId) return 'NOT_OFFER_TARGET';
  if (!offer.to.includes(playerId)) return 'NOT_OFFER_TARGET';
  // Answers can change while the offer is open, the way they do at a table.
  // Nothing rides on them: confirmTrade revalidates both hands anyway.
  return null;
};

const validateCounterOffer = (
  state: ReadonlyGameState,
  playerId: PlayerId,
  action: Extract<Action, { type: 'counterOffer' }>,
): ErrorCode | null => {
  const eligible = canCounterOffer(state, playerId, action.offerId);
  if (eligible !== null) return eligible;

  const player = playerOf(state, playerId);
  if (!player) return 'INVALID_TARGET';
  return validateSides(player, action.give, action.want);
};

const validateConfirmTrade = (
  state: ReadonlyGameState,
  playerId: PlayerId,
  action: Extract<Action, { type: 'confirmTrade' }>,
): ErrorCode | null => {
  if (state.phase.kind !== 'main') return 'WRONG_PHASE';

  const offer = offerById(state, action.offerId);
  if (!offer) return 'OFFER_NOT_FOUND';

  // Only the active player closes a deal, on their own offer or on a
  // counteroffer sent to them (SPEC.md §12.6).
  const mine = offer.from === playerId;
  const toMe = offer.to.includes(playerId);
  if (!mine && !toMe) return 'NOT_OFFER_OWNER';

  const other = mine ? action.withPlayer : offer.from;
  if (mine && action.withPlayer === playerId) return 'INVALID_TARGET';
  if (!mine && action.withPlayer !== offer.from) return 'INVALID_TARGET';
  if (!playerOf(state, other)) return 'INVALID_TARGET';

  // A counteroffer is its own acceptance; a plain offer needs one.
  if (mine && offer.responses[action.withPlayer] !== 'accepted') return 'NOT_ACCEPTED';

  const proposer = playerOf(state, offer.from);
  const counterparty = playerOf(state, mine ? action.withPlayer : playerId);
  if (!proposer || !counterparty) return 'INVALID_TARGET';

  // Revalidated now: hands move while an offer sits on the table.
  if (!holds(proposer.resources, offer.give)) return 'INSUFFICIENT_RESOURCES';
  if (!holds(counterparty.resources, offer.want)) return 'INSUFFICIENT_RESOURCES';
  return null;
};

const validateCancelOffer = (
  state: ReadonlyGameState,
  playerId: PlayerId,
  offerId: string,
): ErrorCode | null => {
  const offer = offerById(state, offerId);
  if (!offer) return 'OFFER_NOT_FOUND';
  return offer.from === playerId ? null : 'NOT_OFFER_OWNER';
};

export const validateAction = (
  state: ReadonlyGameState,
  playerId: PlayerId,
  action: Action,
): ErrorCode | null => {
  if (state.phase.kind === 'gameOver') return 'GAME_OVER';
  if (!playerOf(state, playerId)) return 'INVALID_TARGET';

  // Who may act depends on the action, not only on whose turn it is: the
  // discard is simultaneous and belongs to everyone who owes cards.
  if (action.type === 'discard') return validateDiscard(state, playerId, action.cards);
  // Answering a trade is the other concurrent case: the players who were sent
  // an offer act on somebody else's turn (SPEC.md §4.9).
  if (action.type === 'respondOffer') return validateRespondOffer(state, playerId, action);
  if (action.type === 'counterOffer') return validateCounterOffer(state, playerId, action);
  // Cancelling is about owning the offer, not about whose turn it is: a
  // player who countered may withdraw it while somebody else plays.
  if (action.type === 'cancelOffer') return validateCancelOffer(state, playerId, action.offerId);
  // Walking out belongs to whoever is walking out, whenever they decide to,
  // and the whole point is that it does not wait for their turn.
  if (action.type === 'leaveGame') return hasLeft(state, playerId) ? 'ALREADY_LEFT' : null;
  if (state.currentPlayer !== playerId) return 'NOT_YOUR_TURN';

  switch (action.type) {
    case 'placeSettlement':
      return validateSettlement(state, playerId, action.vertex);
    case 'placeRoad':
      return validateRoad(state, playerId, action.edge);
    case 'upgradeCity':
      return validateCity(state, playerId, action.vertex);
    case 'rollDice':
      return state.phase.kind === 'preRoll' ? null : 'WRONG_PHASE';
    case 'buyDevCard': {
      if (state.phase.kind !== 'main') return 'WRONG_PHASE';
      if (state.devDeck.length === 0) return 'DECK_EMPTY';
      const player = playerOf(state, playerId);
      if (!player) return 'INVALID_TARGET';
      return canAfford(player.resources, COSTS.devCard) ? null : 'INSUFFICIENT_RESOURCES';
    }
    case 'playKnight':
      return validatePlayCard(state, playerId, 'knight');

    case 'playYearOfPlenty': {
      const error = validatePlayCard(state, playerId, 'yearOfPlenty');
      if (error !== null) return error;
      // All or nothing: the bank has to cover both cards, two of the same
      // resource included. Unlike production, this one is not paid in part.
      const wanted = emptyBundle();
      for (const resource of action.resources) wanted[resource] += 1;
      return RESOURCES.every((resource) => state.bank[resource] >= wanted[resource])
        ? null
        : 'INSUFFICIENT_RESOURCES';
    }

    case 'playMonopoly':
      return validatePlayCard(state, playerId, 'monopoly');

    case 'playRoadBuilding': {
      const error = validatePlayCard(state, playerId, 'roadBuilding');
      if (error !== null) return error;
      // With nowhere legal to build, the card is refused rather than wasted
      // (SPEC.md §12.8).
      const player = playerOf(state, playerId);
      if (!player) return 'INVALID_TARGET';
      if (player.stock.roads <= 0) return 'NO_LEGAL_PLACEMENT';
      return hasLegalFreeRoad(state, playerId) ? null : 'NO_LEGAL_PLACEMENT';
    }

    case 'maritimeTrade': {
      if (state.phase.kind !== 'main') return 'WRONG_PHASE';
      const player = playerOf(state, playerId);
      if (!player) return 'INVALID_TARGET';
      return canTradeMaritime(state, playerId, action.give, action.want, player.resources);
    }
    case 'moveRobber':
      return validateMoveRobber(state, action.hex);
    case 'steal':
      return validateSteal(state, action.target);
    case 'createOffer':
      return validateCreateOffer(state, playerId, action);
    // respondOffer and counterOffer were handled above: they belong to players
    // who are not on turn.
    case 'confirmTrade':
      return validateConfirmTrade(state, playerId, action);
    case 'endTurn':
      return state.phase.kind === 'main' ? null : 'WRONG_PHASE';
  }
};

/** Convenience wrapper for callers that only care whether the move is allowed. */
export const isLegalAction = (
  state: ReadonlyGameState,
  playerId: PlayerId,
  action: Action,
): boolean => validateAction(state, playerId, action) === null;

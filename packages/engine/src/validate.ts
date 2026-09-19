import { COSTS, RESOURCES } from './constants.js';
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

/** Actions whose milestone has not landed yet. They exist in the union already (SPEC.md §5.3). */
const NOT_YET_IMPLEMENTED = new Set([
  'buyDevCard',
  'playKnight',
  'playRoadBuilding',
  'playYearOfPlenty',
  'playMonopoly',
  'maritimeTrade',
  'createOffer',
  'respondOffer',
  'counterOffer',
  'confirmTrade',
  'cancelOffer',
]);

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
  if (!inSetup && phase.kind !== 'main') return 'WRONG_PHASE';

  if (state.roads[edge] !== undefined) return 'OCCUPIED';

  const player = playerOf(state, playerId);
  if (!player) return 'INVALID_TARGET';
  if (player.stock.roads <= 0) return 'NOT_ENOUGH_PIECES';

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

export const validateAction = (
  state: ReadonlyGameState,
  playerId: PlayerId,
  action: Action,
): ErrorCode | null => {
  if (state.phase.kind === 'gameOver') return 'GAME_OVER';
  if (!playerOf(state, playerId)) return 'INVALID_TARGET';
  if (NOT_YET_IMPLEMENTED.has(action.type)) return 'NOT_IMPLEMENTED';

  // Who may act depends on the action, not only on whose turn it is: the
  // discard is simultaneous and belongs to everyone who owes cards.
  if (action.type === 'discard') return validateDiscard(state, playerId, action.cards);
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
    case 'moveRobber':
      return validateMoveRobber(state, action.hex);
    case 'steal':
      return validateSteal(state, action.target);
    case 'endTurn':
      return state.phase.kind === 'main' ? null : 'WRONG_PHASE';
    default:
      return 'NOT_IMPLEMENTED';
  }
};

/** Convenience wrapper for callers that only care whether the move is allowed. */
export const isLegalAction = (
  state: ReadonlyGameState,
  playerId: PlayerId,
  action: Action,
): boolean => validateAction(state, playerId, action) === null;

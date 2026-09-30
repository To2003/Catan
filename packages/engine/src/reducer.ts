import type { GameEvent } from './events.js';
import { buildRoad, buildSettlement, placeFreeRoad, upgradeToCity } from './rules/build.js';
import { rollDice } from './rules/dice.js';
import { recomputeLongestRoad } from './rules/longestRoad.js';
import { discard, moveRobber, steal } from './rules/robber.js';
import {
  advanceRoadBuilding,
  buyDevCard,
  playKnight,
  playMonopoly,
  playRoadBuilding,
  playYearOfPlenty,
} from './rules/devCards.js';
import {
  cancelOffer,
  confirmTrade,
  counterOffer,
  createOffer,
  respondOffer,
} from './rules/playerTrade.js';
import { maritimeTrade } from './rules/trade.js';
import { endTurn } from './rules/turn.js';
import { leaveGame } from './rules/leave.js';
import { checkVictory } from './rules/victory.js';
import { placeSetupRoad, placeSetupSettlement } from './rules/setup.js';
import type { Action, ErrorCode, GameState, PlayerId, ReadonlyGameState } from './types.js';
import { validateAction } from './validate.js';

/**
 * The engine's front door: `applyAction(state, playerId, action)` (SPEC.md §6).
 *
 * Pure, and it never touches the state it is given: it clones, works on the
 * clone and hands back a fresh `DeepReadonly<GameState>`. The reducer tests
 * deep-freeze their input so any slip throws instead of going unnoticed.
 *
 * Validation happens once, here, before any handler runs. No handler
 * revalidates.
 */

export type ApplyResult =
  | { readonly ok: true; readonly state: ReadonlyGameState; readonly events: readonly GameEvent[] }
  | { readonly ok: false; readonly error: ErrorCode };

/**
 * A working copy of the state. The board is carried over by reference: it is
 * immutable for the whole game, so cloning 54 vertices and 72 edges on every
 * action would be pure waste.
 */
const cloneState = (state: ReadonlyGameState): GameState => {
  const { board, ...rest } = state;
  return { ...(structuredClone(rest) as Omit<GameState, 'board'>), board };
};

export const applyAction = (
  state: ReadonlyGameState,
  playerId: PlayerId,
  action: Action,
): ApplyResult => {
  const error = validateAction(state, playerId, action);
  if (error !== null) return { ok: false, error };

  const draft = cloneState(state);
  const events: GameEvent[] = [];

  switch (action.type) {
    case 'placeSettlement':
      if (draft.phase.kind === 'setup')
        placeSetupSettlement(draft, playerId, action.vertex, events);
      else buildSettlement(draft, playerId, action.vertex, events);
      break;

    case 'placeRoad':
      if (draft.phase.kind === 'setup') {
        placeSetupRoad(draft, playerId, action.edge, events);
      } else if (draft.phase.kind === 'roadBuilding') {
        const placed = 3 - draft.phase.remaining;
        placeFreeRoad(draft, playerId, action.edge, events);
        advanceRoadBuilding(draft, playerId, placed, events);
      } else {
        buildRoad(draft, playerId, action.edge, events);
      }
      break;

    case 'upgradeCity':
      upgradeToCity(draft, playerId, action.vertex, events);
      break;

    case 'rollDice':
      rollDice(draft, playerId, events);
      break;

    case 'discard':
      discard(draft, playerId, action.cards, events);
      break;

    case 'moveRobber':
      moveRobber(draft, playerId, action.hex, events);
      break;

    case 'steal':
      steal(draft, playerId, action.target, events);
      break;

    case 'buyDevCard':
      buyDevCard(draft, playerId, events);
      break;

    case 'playKnight':
      playKnight(draft, playerId, events);
      break;

    case 'playYearOfPlenty':
      playYearOfPlenty(draft, playerId, action.resources, events);
      break;

    case 'playMonopoly':
      playMonopoly(draft, playerId, action.resource, events);
      break;

    case 'playRoadBuilding':
      playRoadBuilding(draft, playerId, events);
      break;

    case 'maritimeTrade':
      maritimeTrade(draft, playerId, action.give, action.want, events);
      break;

    case 'createOffer':
      createOffer(draft, playerId, action.give, action.want, action.to, events);
      break;

    case 'respondOffer':
      respondOffer(draft, playerId, action.offerId, action.response, events);
      break;

    case 'counterOffer':
      counterOffer(draft, playerId, action.offerId, action.give, action.want, events);
      break;

    case 'confirmTrade':
      confirmTrade(draft, playerId, action.offerId, action.withPlayer, events);
      break;

    case 'cancelOffer':
      cancelOffer(draft, action.offerId, events);
      break;

    case 'leaveGame':
      leaveGame(draft, playerId, events);
      break;

    case 'endTurn':
      endTurn(draft, playerId, events);
      break;
  }

  // A road or a settlement can change who has the longest road — a settlement
  // even for players who did not act, since it can cut their network
  // (SPEC.md §12.2).
  if (action.type === 'placeRoad' || action.type === 'placeSettlement') {
    recomputeLongestRoad(draft, events);
  }

  // Victory is checked after every action of the *active* player (SPEC.md
  // §12.4). A discard by anyone else cannot win a game, and should not be
  // mistaken for their own turn.
  if (playerId === draft.currentPlayer) checkVictory(draft, playerId, events);

  draft.version += 1;
  return { ok: true, state: draft, events };
};

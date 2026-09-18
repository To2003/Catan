import type { GameEvent } from './events.js';
import { buildRoad, buildSettlement, upgradeToCity } from './rules/build.js';
import { rollDice } from './rules/dice.js';
import { endTurn } from './rules/turn.js';
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
      if (draft.phase.kind === 'setup') placeSetupRoad(draft, playerId, action.edge, events);
      else buildRoad(draft, playerId, action.edge, events);
      break;

    case 'upgradeCity':
      upgradeToCity(draft, playerId, action.vertex, events);
      break;

    case 'rollDice':
      rollDice(draft, playerId, events);
      break;

    case 'endTurn':
      endTurn(draft, playerId, events);
      break;

    default:
      return { ok: false, error: 'NOT_IMPLEMENTED' };
  }

  // Victory is checked after every action of the active player (SPEC.md §12.4);
  // the start-of-turn check lives in endTurn.
  checkVictory(draft, playerId, events);

  draft.version += 1;
  return { ok: true, state: draft, events };
};

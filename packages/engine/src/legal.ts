import { isLegalAction } from './validate.js';
import type { EdgeId, HexId, PlayerId, ReadonlyGameState, VertexId } from './types.js';

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

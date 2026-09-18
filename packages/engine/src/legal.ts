import { isLegalAction } from './validate.js';
import type { EdgeId, PlayerId, ReadonlyGameState, VertexId } from './types.js';

/**
 * Legal moves, for highlighting them in the UI.
 *
 * **These functions contain no rules.** Each one enumerates the candidates and
 * filters them through `validateAction`, so legality here is legality there by
 * construction. A property test pins that down, which is the point: if somebody
 * ever "optimises" this file by restating a rule, the test fails.
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

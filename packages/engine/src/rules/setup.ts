import type { GameEvent } from '../events.js';
import type { EdgeId, GameState, PlayerId, VertexId } from '../types.js';
import { claimsFromVertex, payClaims } from './production.js';

/**
 * The opening placement, in snake order (SPEC.md §4.5).
 *
 * Round 1 runs the turn order forwards, round 2 backwards, and the same player
 * places twice in a row at the turn. Where a player stands in the snake is
 * derived from the phase and the turn order, so there is no separate counter to
 * fall out of sync.
 */

const playerIn = (draft: GameState, playerId: PlayerId) => {
  const player = draft.players.find((candidate) => candidate.id === playerId);
  if (!player) throw new Error(`no player ${playerId}`);
  return player;
};

export const placeSetupSettlement = (
  draft: GameState,
  playerId: PlayerId,
  vertex: VertexId,
  events: GameEvent[],
): void => {
  const phase = draft.phase;
  if (phase.kind !== 'setup') throw new Error('placeSetupSettlement outside setup');

  draft.buildings[vertex] = { owner: playerId, type: 'settlement' };
  playerIn(draft, playerId).stock.settlements -= 1;
  events.push({ type: 'SetupSettlementPlaced', player: playerId, vertex });

  // The second settlement pays out (SPEC.md §4.5), through the same production
  // path as the dice, scarcity included.
  if (phase.round === 2) {
    const payout = payClaims(draft, claimsFromVertex(draft, vertex, playerId));
    events.push({ type: 'SetupResourcesGranted', player: playerId, grants: payout.grants });
    for (const resource of payout.skipped) {
      events.push({ type: 'ProductionSkipped', reason: 'scarcity', resource });
    }
  }

  draft.phase = { kind: 'setup', round: phase.round, step: 'road', lastSettlement: vertex };
  events.push({ type: 'PhaseChanged', phase: draft.phase });
};

export const placeSetupRoad = (
  draft: GameState,
  playerId: PlayerId,
  edge: EdgeId,
  events: GameEvent[],
): void => {
  const phase = draft.phase;
  if (phase.kind !== 'setup') throw new Error('placeSetupRoad outside setup');

  draft.roads[edge] = playerId;
  playerIn(draft, playerId).stock.roads -= 1;
  events.push({ type: 'SetupRoadPlaced', player: playerId, edge });

  advanceSetup(draft, phase.round, events);
};

/** Moves the snake on after a road: next seat, turn around, or start the game. */
const advanceSetup = (draft: GameState, round: 1 | 2, events: GameEvent[]): void => {
  const order = draft.turnOrder;
  const index = order.indexOf(draft.currentPlayer);
  if (index < 0) throw new Error('active player is not in the turn order');

  const seatAt = (position: number): PlayerId => {
    const seat = order[position];
    if (seat === undefined) throw new Error(`no seat at ${position}`);
    return seat;
  };

  if (round === 1) {
    if (index < order.length - 1) {
      draft.currentPlayer = seatAt(index + 1);
      draft.phase = { kind: 'setup', round: 1, step: 'settlement' };
    } else {
      // The snake turns around: the last player places again, in round 2.
      draft.phase = { kind: 'setup', round: 2, step: 'settlement' };
    }
  } else if (index > 0) {
    draft.currentPlayer = seatAt(index - 1);
    draft.phase = { kind: 'setup', round: 2, step: 'settlement' };
  } else {
    draft.currentPlayer = seatAt(0);
    // The game proper starts here: this is turn 1, round 1.
    draft.turn = 1;
    draft.phase = { kind: 'preRoll' };
  }

  events.push({ type: 'PhaseChanged', phase: draft.phase });
};

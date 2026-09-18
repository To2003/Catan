import { VICTORY_POINTS, VICTORY_POINTS_TO_WIN } from '../constants.js';
import type { GameEvent } from '../events.js';
import type { GameState, PlayerId, ReadonlyGameState } from '../types.js';

/**
 * Victory points (SPEC.md §4.12).
 *
 * M2 only has buildings on the board; victory cards, longest road and largest
 * army arrive with their milestones. The shape is final, so nothing else has to
 * move when they do.
 */
export const victoryPoints = (state: ReadonlyGameState, playerId: PlayerId): number => {
  let points = 0;

  for (const vertex of state.board.vertexIds) {
    const building = state.buildings[vertex];
    if (building?.owner !== playerId) continue;
    points += building.type === 'city' ? VICTORY_POINTS.city : VICTORY_POINTS.settlement;
  }

  // TODO(M5): victory cards in hand.
  // TODO(M5): largest army (SPEC.md §4.11).
  // TODO(M5): longest road (SPEC.md §4.11, §12.2).

  return points;
};

/**
 * Ends the game if this player is at 10. Checked after each of their own
 * actions and at the start of their turn (SPEC.md §12.4).
 */
export const checkVictory = (draft: GameState, playerId: PlayerId, events: GameEvent[]): void => {
  if (draft.phase.kind === 'gameOver') return;

  const points = victoryPoints(draft, playerId);
  if (points < VICTORY_POINTS_TO_WIN) return;

  draft.phase = { kind: 'gameOver', winner: playerId };
  events.push({ type: 'GameWon', player: playerId, points });
};

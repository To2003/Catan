import { VICTORY_POINTS, VICTORY_POINTS_TO_WIN } from '../constants.js';
import type { GameEvent } from '../events.js';
import type { GameState, PlayerId, ReadonlyGameState } from '../types.js';

/**
 * Victory points (SPEC.md §4.12).
 *
 * Two functions, because points are partly hidden: victory cards sit in a hand
 * where nobody else can see them.
 *
 *   - `publicVictoryPoints` — what the table can see: buildings and bonuses.
 *   - `victoryPoints`       — the truth, with the victory cards added.
 *
 * The win is checked against the total; anything showing another player's score
 * has to reach for the public one deliberately.
 */

const buildingPoints = (state: ReadonlyGameState, playerId: PlayerId): number => {
  let points = 0;
  for (const vertex of state.board.vertexIds) {
    const building = state.buildings[vertex];
    if (building?.owner !== playerId) continue;
    points += building.type === 'city' ? VICTORY_POINTS.city : VICTORY_POINTS.settlement;
  }
  return points;
};

const bonusPoints = (state: ReadonlyGameState, playerId: PlayerId): number => {
  let points = 0;
  if (state.largestArmy === playerId) points += VICTORY_POINTS.largestArmy;
  if (state.longestRoad?.owner === playerId) points += VICTORY_POINTS.longestRoad;
  return points;
};

/** Victory cards in hand. They are never played: they just count (SPEC.md §4.10). */
export const victoryCardCount = (state: ReadonlyGameState, playerId: PlayerId): number =>
  state.players.find((player) => player.id === playerId)?.devCards.filter((card) => card === 'vp')
    .length ?? 0;

/** What everybody else can see: buildings and bonuses, no hidden cards. */
export const publicVictoryPoints = (state: ReadonlyGameState, playerId: PlayerId): number =>
  buildingPoints(state, playerId) + bonusPoints(state, playerId);

/** The real score, victory cards included. This is what wins a game. */
export const victoryPoints = (state: ReadonlyGameState, playerId: PlayerId): number =>
  publicVictoryPoints(state, playerId) + victoryCardCount(state, playerId);

/**
 * Ends the game if this player is at 10. Checked after each of their own
 * actions and at the start of their turn (SPEC.md §12.4).
 *
 * It ends the game *immediately*, which can cut a chain short: a knight that
 * wins the game never gets to move the robber, and a road building card that
 * wins on its first road never places the second.
 */
export const checkVictory = (draft: GameState, playerId: PlayerId, events: GameEvent[]): void => {
  if (draft.phase.kind === 'gameOver') return;

  const points = victoryPoints(draft, playerId);
  if (points < VICTORY_POINTS_TO_WIN) return;

  draft.phase = { kind: 'gameOver', winner: playerId };
  events.push({
    type: 'GameWon',
    player: playerId,
    points,
    revealedVpCards: victoryCardCount(draft, playerId),
  });
};

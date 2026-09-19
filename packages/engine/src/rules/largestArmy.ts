import { LARGEST_ARMY_MIN_KNIGHTS } from '../constants.js';
import type { GameEvent } from '../events.js';
import type { GameState, PlayerId } from '../types.js';

/**
 * Largest Army (SPEC.md §4.11).
 *
 * Three knights claim it; after that it only moves on a strict majority, so a
 * player who merely ties the holder keeps their hands off it.
 *
 * Only the player who just played a knight can take it, so that is who this
 * looks at: knight counts never go down, and nobody else's changed.
 */
export const recomputeLargestArmy = (
  draft: GameState,
  playerId: PlayerId,
  events: GameEvent[],
): void => {
  if (draft.largestArmy === playerId) return;

  const player = draft.players.find((candidate) => candidate.id === playerId);
  if (!player || player.knightsPlayed < LARGEST_ARMY_MIN_KNIGHTS) return;

  const holder = draft.players.find((candidate) => candidate.id === draft.largestArmy);
  // With no holder, anything from three knights up takes it.
  const toBeat = holder?.knightsPlayed ?? LARGEST_ARMY_MIN_KNIGHTS - 1;
  if (player.knightsPlayed <= toBeat) return;

  draft.largestArmy = playerId;
  events.push({ type: 'LargestArmyChanged', owner: playerId, knights: player.knightsPlayed });
};

import type { GameEvent } from '../events.js';
import type { GameState, PlayerId } from '../types.js';
import { clearOffers } from './playerTrade.js';
import { checkVictory } from './victory.js';

/** Ending a turn and handing over (SPEC.md §4.6). */
export const endTurn = (draft: GameState, playerId: PlayerId, events: GameEvent[]): void => {
  const order = draft.turnOrder;
  const index = order.indexOf(playerId);
  if (index < 0) throw new Error('active player is not in the turn order');

  const next = order[(index + 1) % order.length];
  if (next === undefined) throw new Error('empty turn order');

  // Per-turn flags. Both are always empty in M2; they are cleared here so the
  // rule lives where it will keep living once dev cards arrive (SPEC.md §4.10).
  draft.devCardPlayedThisTurn = false;
  for (const player of draft.players) player.devCardsBoughtThisTurn = [];

  // Open offers die with the turn (SPEC.md §4.9).
  clearOffers(draft, events);

  draft.currentPlayer = next;
  draft.phase = { kind: 'preRoll' };
  events.push({ type: 'TurnEnded', player: playerId, next });
  events.push({ type: 'PhaseChanged', phase: draft.phase });

  // A player can reach 10 during somebody else's turn; they win when their own
  // turn starts (SPEC.md §12.4).
  checkVictory(draft, next, events);
};

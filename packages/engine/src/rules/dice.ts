import type { GameEvent } from '../events.js';
import { rollDie } from '../rng.js';
import type { GameState, HexId, PlayerId } from '../types.js';
import { claimsFromHexes, payClaims } from './production.js';
import { beginSeven } from './robber.js';

/**
 * The roll and what it pays out (SPEC.md §4.6, §4.7).
 *
 * Two draws from the seeded PRNG, d1 then d2, in that order: it is part of the
 * RNG contract (SPEC.md §12.11).
 */

export const rollDice = (draft: GameState, playerId: PlayerId, events: GameEvent[]): void => {
  const first = rollDie(draft.rngState);
  const second = rollDie(first.state);
  draft.rngState = second.state;
  draft.lastRoll = [first.value, second.value];

  const total = first.value + second.value;
  events.push({ type: 'DiceRolled', player: playerId, dice: [first.value, second.value], total });

  // A seven produces nothing: it discards, moves the robber and steals
  // (SPEC.md §4.8).
  if (total === 7) {
    beginSeven(draft, events);
    return;
  }

  const rolled = draft.board.hexIds.filter((hex) => draft.board.hexes[hex]?.number === total);
  const producing: HexId[] = [];
  for (const hex of rolled) {
    if (hex === draft.robberHex) {
      events.push({ type: 'ProductionSkipped', reason: 'robber', hex });
      continue;
    }
    producing.push(hex);
  }

  const payout = payClaims(draft, claimsFromHexes(draft, producing));
  if (payout.grants.length > 0) {
    events.push({ type: 'ResourcesProduced', grants: payout.grants });
  }
  for (const resource of payout.skipped) {
    events.push({ type: 'ProductionSkipped', reason: 'scarcity', resource });
  }

  draft.phase = { kind: 'main' };
  events.push({ type: 'PhaseChanged', phase: draft.phase });
};

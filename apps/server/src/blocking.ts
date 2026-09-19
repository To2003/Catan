import { randomInt } from 'node:crypto';
import {
  RESOURCES,
  legalMoves,
  legalRobberHexes,
  legalStealTargets,
  type Action,
  type PlayerId,
  type ReadonlyGameState,
  type Resource,
  type ResourceBundle,
} from '@tierra-austral/engine';

/** Two minutes of being both away and in the way (SPEC.md §7.1). */
export const FORCE_TURN_DELAY_MS = 2 * 60 * 1000;

/**
 * Whether the game cannot move on without this player.
 *
 * It is not the same as "it is their turn": during a discard the game waits on
 * everyone who owes cards, whoever's turn it is, so a disconnected player can
 * block a room from the outside.
 */
export const isBlocking = (state: ReadonlyGameState, playerId: PlayerId): boolean => {
  const phase = state.phase;
  if (phase.kind === 'lobby' || phase.kind === 'gameOver') return false;
  if (phase.kind === 'discard') return phase.pending[playerId] !== undefined;
  return state.currentPlayer === playerId;
};

const randomFrom = <T>(items: readonly T[]): T | undefined =>
  items.length === 0 ? undefined : items[randomInt(items.length)];

/** A valid discard of exactly what is owed, chosen at random. */
const randomDiscard = (state: ReadonlyGameState, playerId: PlayerId): Action | undefined => {
  if (state.phase.kind !== 'discard') return undefined;
  const owed = state.phase.pending[playerId];
  const player = state.players.find((candidate) => candidate.id === playerId);
  if (owed === undefined || !player) return undefined;

  const hand: Resource[] = [];
  for (const resource of RESOURCES) {
    for (let i = 0; i < player.resources[resource]; i += 1) hand.push(resource);
  }
  // Fisher-Yates with crypto: this is the server's own randomness, not the
  // game's, and it must not touch the engine's PRNG.
  for (let i = hand.length - 1; i > 0; i -= 1) {
    const j = randomInt(i + 1);
    [hand[i], hand[j]] = [hand[j] as Resource, hand[i] as Resource];
  }

  const cards: Partial<ResourceBundle> = {};
  for (const resource of hand.slice(0, owed)) cards[resource] = (cards[resource] ?? 0) + 1;
  return { type: 'discard', cards };
};

/**
 * One legal action for a player who is not here to choose.
 *
 * It is applied like any other action, so it lands in the room's action list
 * and a replay reproduces the game exactly. The randomness is the server's,
 * which is fine precisely because what gets recorded is the *action chosen*,
 * not the draw that chose it.
 */
export const forcedAction = (state: ReadonlyGameState, playerId: PlayerId): Action | undefined => {
  const phase = state.phase;

  if (phase.kind === 'discard') return randomDiscard(state, playerId);

  if (phase.kind === 'moveRobber') {
    const hex = randomFrom(legalRobberHexes(state, playerId));
    return hex === undefined ? undefined : { type: 'moveRobber', hex };
  }

  if (phase.kind === 'steal') {
    const target = randomFrom(legalStealTargets(state, playerId));
    return target === undefined ? undefined : { type: 'steal', target };
  }

  // Placements come from the engine's own list, so a forced move is legal by
  // construction rather than by the server guessing the rules.
  const moves = legalMoves(state, playerId);

  if (phase.kind === 'setup') {
    if (phase.step === 'settlement') {
      const vertex = randomFrom(moves.settlements);
      return vertex === undefined ? undefined : { type: 'placeSettlement', vertex };
    }
    const edge = randomFrom(moves.roads);
    return edge === undefined ? undefined : { type: 'placeRoad', edge };
  }

  if (phase.kind === 'roadBuilding') {
    const edge = randomFrom(moves.roads);
    return edge === undefined ? undefined : { type: 'placeRoad', edge };
  }

  if (phase.kind === 'preRoll') return moves.canRoll ? { type: 'rollDice' } : undefined;
  if (phase.kind === 'main') return moves.canEndTurn ? { type: 'endTurn' } : undefined;

  return undefined;
};

import { DISCARD_THRESHOLD, RESOURCES } from '../constants.js';
import type { GameEvent } from '../events.js';
import { nextInt } from '../rng.js';
import type {
  GameState,
  HexId,
  Phase,
  PlayerId,
  ReadonlyGameState,
  Resource,
  ResourceBundle,
} from '../types.js';

/**
 * What a seven sets off: discard, move the robber, steal (SPEC.md §4.8).
 *
 * The chain carries `source` and `returnTo` from one phase to the next. A seven
 * always comes back to `main`; a knight (M5) comes back to where it was played
 * and never passes through a discard (SPEC.md §12.3).
 */

const playerIn = (draft: GameState, playerId: PlayerId) => {
  const player = draft.players.find((candidate) => candidate.id === playerId);
  if (!player) throw new Error(`no player ${playerId}`);
  return player;
};

/** Resource cards in hand. Development cards do not count (SPEC.md §4.8). */
export const handSize = (resources: Readonly<ResourceBundle>): number =>
  RESOURCES.reduce((total, resource) => total + resources[resource], 0);

/** Who owes a discard, and how much: half of a hand over 7, rounded down. */
export const pendingDiscards = (state: ReadonlyGameState): Record<PlayerId, number> => {
  const pending: Record<PlayerId, number> = {};
  for (const player of state.players) {
    const held = handSize(player.resources);
    if (held > DISCARD_THRESHOLD) pending[player.id] = Math.floor(held / 2);
  }
  return pending;
};

/**
 * Who the active player may rob: owners of a building on the hex, other than
 * themselves, holding at least one card (SPEC.md §4.8, §12.7).
 */
export const stealCandidates = (
  state: ReadonlyGameState,
  hex: HexId,
  thief: PlayerId,
): PlayerId[] => {
  const corners = state.board.hexes[hex]?.corners ?? [];
  const candidates = new Set<PlayerId>();

  for (const vertex of corners) {
    const owner = state.buildings[vertex]?.owner;
    if (owner === undefined || owner === thief) continue;
    const player = state.players.find((candidate) => candidate.id === owner);
    if (player && handSize(player.resources) > 0) candidates.add(owner);
  }

  return [...candidates];
};

/** Enters the robber phase, or the discard that precedes it when anyone is over the limit. */
export const beginSeven = (draft: GameState, events: GameEvent[]): void => {
  const pending = pendingDiscards(draft);

  if (Object.keys(pending).length > 0) {
    draft.phase = { kind: 'discard', pending, source: 'seven', returnTo: 'main' };
    events.push({ type: 'DiscardRequired', pending });
  } else {
    draft.phase = { kind: 'moveRobber', source: 'seven', returnTo: 'main' };
  }
  events.push({ type: 'PhaseChanged', phase: draft.phase });
};

export const discard = (
  draft: GameState,
  playerId: PlayerId,
  cards: Partial<ResourceBundle>,
  events: GameEvent[],
): void => {
  const phase = draft.phase;
  if (phase.kind !== 'discard') throw new Error('discard outside the discard phase');

  const player = playerIn(draft, playerId);
  const discarded: ResourceBundle = { wood: 0, brick: 0, sheep: 0, wheat: 0, ore: 0 };
  let count = 0;

  for (const resource of RESOURCES) {
    const amount = cards[resource] ?? 0;
    if (amount === 0) continue;
    // Discarded cards go back to the bank, like build costs do.
    player.resources[resource] -= amount;
    draft.bank[resource] += amount;
    discarded[resource] = amount;
    count += amount;
  }

  events.push({ type: 'CardsDiscarded', player: playerId, count });
  events.push({
    type: 'DiscardDetail',
    player: playerId,
    cards: discarded,
    visibleTo: [playerId],
  });

  const remaining = Object.fromEntries(
    Object.entries(phase.pending).filter(([owes]) => owes !== playerId),
  );

  if (Object.keys(remaining).length > 0) {
    draft.phase = { ...phase, pending: remaining };
    return;
  }

  draft.phase = { kind: 'moveRobber', source: phase.source, returnTo: phase.returnTo };
  events.push({ type: 'PhaseChanged', phase: draft.phase });
};

export const moveRobber = (
  draft: GameState,
  playerId: PlayerId,
  hex: HexId,
  events: GameEvent[],
): void => {
  const phase = draft.phase;
  if (phase.kind !== 'moveRobber') throw new Error('moveRobber outside its phase');

  const from = draft.robberHex;
  draft.robberHex = hex;
  events.push({ type: 'RobberMoved', player: playerId, from, to: hex });

  const candidates = stealCandidates(draft, hex, playerId);
  if (candidates.length === 0) {
    events.push({ type: 'StealSkipped', reason: 'noCandidates' });
    draft.phase = returnPhase(phase.returnTo);
  } else {
    // With a candidate the steal is compulsory, and always an explicit action
    // even when there is only one (SPEC.md §12.7).
    draft.phase = { kind: 'steal', candidates, returnTo: phase.returnTo };
  }
  events.push({ type: 'PhaseChanged', phase: draft.phase });
};

export const steal = (
  draft: GameState,
  playerId: PlayerId,
  target: PlayerId,
  events: GameEvent[],
): void => {
  const phase = draft.phase;
  if (phase.kind !== 'steal') throw new Error('steal outside its phase');

  const victim = playerIn(draft, target);
  const thief = playerIn(draft, playerId);

  // The victim's hand laid out in a fixed order, one entry per card, and one
  // draw from the game's PRNG picks an index (SPEC.md §12.11, step 8).
  const hand: Resource[] = [];
  for (const resource of RESOURCES) {
    for (let i = 0; i < victim.resources[resource]; i += 1) hand.push(resource);
  }

  const draw = nextInt(draft.rngState, hand.length);
  draft.rngState = draw.state;
  const stolen = hand[draw.value];
  if (stolen === undefined) throw new Error('steal candidate had no cards');

  // Hand to hand: the bank is not involved.
  victim.resources[stolen] -= 1;
  thief.resources[stolen] += 1;

  events.push({ type: 'StealResolved', thief: playerId, victim: target });
  events.push({
    type: 'ResourceStolen',
    thief: playerId,
    victim: target,
    resource: stolen,
    visibleTo: [playerId, target],
  });

  draft.phase = returnPhase(phase.returnTo);
  events.push({ type: 'PhaseChanged', phase: draft.phase });
};

const returnPhase = (returnTo: 'preRoll' | 'main'): Phase =>
  returnTo === 'preRoll' ? { kind: 'preRoll' } : { kind: 'main' };

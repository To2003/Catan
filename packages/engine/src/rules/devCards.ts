import { COSTS, RESOURCES } from '../constants.js';
import type { GameEvent } from '../events.js';
import type { DevCard, GameState, PlayerId, ReadonlyGameState, Resource } from '../types.js';
import { recomputeLargestArmy } from './largestArmy.js';

/**
 * Development cards (SPEC.md §4.10).
 *
 * **The top of the deck is `devDeck[0]`**, drawn with a shift: the shuffle in
 * `createGame` produces the deck read top to bottom, so index 0 is the next
 * card. Drawing consumes no randomness — the deck was shuffled once, at the
 * start (SPEC.md §12.11) — so buying cards never disturbs the dice sequence.
 */

const playerIn = (draft: GameState, playerId: PlayerId) => {
  const player = draft.players.find((candidate) => candidate.id === playerId);
  if (!player) throw new Error(`no player ${playerId}`);
  return player;
};

const countOf = (cards: readonly DevCard[], card: DevCard): number =>
  cards.filter((candidate) => candidate === card).length;

/**
 * How many of a card the player may play right now: what they hold, minus what
 * they bought this turn (SPEC.md §4.10). A multiset is enough — no card needs
 * an identity of its own to answer "can I play a knight?".
 */
export const playableCount = (
  state: ReadonlyGameState,
  playerId: PlayerId,
  card: DevCard,
): number => {
  const player = state.players.find((candidate) => candidate.id === playerId);
  if (!player) return 0;
  return countOf(player.devCards, card) - countOf(player.devCardsBoughtThisTurn, card);
};

export const buyDevCard = (draft: GameState, playerId: PlayerId, events: GameEvent[]): void => {
  const player = playerIn(draft, playerId);

  for (const resource of RESOURCES) {
    player.resources[resource] -= COSTS.devCard[resource];
    draft.bank[resource] += COSTS.devCard[resource];
  }
  events.push({ type: 'ResourcesPaid', player: playerId, cost: COSTS.devCard });

  const card = draft.devDeck.shift();
  if (card === undefined) throw new Error('bought from an empty deck');

  player.devCards.push(card);
  player.devCardsBoughtThisTurn.push(card);

  // Public: a card was bought. Private: which one.
  events.push({ type: 'DevCardBought', player: playerId, deckLeft: draft.devDeck.length });
  events.push({ type: 'DevCardDrawn', player: playerId, card, visibleTo: [playerId] });
};

/** Removes one copy of a played card from hand and marks the turn's card as used. */
export const consumeCard = (
  draft: GameState,
  playerId: PlayerId,
  card: DevCard,
  events: GameEvent[],
): void => {
  const player = playerIn(draft, playerId);
  const index = player.devCards.indexOf(card);
  if (index < 0) throw new Error(`${playerId} does not hold a ${card}`);

  player.devCards.splice(index, 1);
  draft.devCardPlayedThisTurn = true;
  events.push({ type: 'DevCardPlayed', player: playerId, card });
};

/** The knight: play it, then move the robber (SPEC.md §4.10, §12.3). */
export const playKnight = (draft: GameState, playerId: PlayerId, events: GameEvent[]): void => {
  // Where it was played is where the robber will come back to. A knight never
  // passes through a discard: only a seven builds one.
  const returnTo = draft.phase.kind === 'preRoll' ? 'preRoll' : 'main';

  consumeCard(draft, playerId, 'knight', events);
  playerIn(draft, playerId).knightsPlayed += 1;
  recomputeLargestArmy(draft, playerId, events);

  draft.phase = { kind: 'moveRobber', source: 'knight', returnTo };
  events.push({ type: 'PhaseChanged', phase: draft.phase });
};

/** Year of plenty: two cards from the bank, all or nothing (SPEC.md §4.10). */
export const playYearOfPlenty = (
  draft: GameState,
  playerId: PlayerId,
  resources: readonly [Resource, Resource],
  events: GameEvent[],
): void => {
  consumeCard(draft, playerId, 'yearOfPlenty', events);

  const player = playerIn(draft, playerId);
  for (const resource of resources) {
    player.resources[resource] += 1;
    draft.bank[resource] -= 1;
  }
  events.push({ type: 'YearOfPlentyTaken', player: playerId, resources });
};

/** Monopoly: everybody else hands over that resource (SPEC.md §4.10). */
export const playMonopoly = (
  draft: GameState,
  playerId: PlayerId,
  resource: Resource,
  events: GameEvent[],
): void => {
  consumeCard(draft, playerId, 'monopoly', events);

  const player = playerIn(draft, playerId);
  const from: { player: PlayerId; amount: number }[] = [];
  let total = 0;

  for (const other of draft.players) {
    if (other.id === playerId) continue;
    const amount = other.resources[resource];
    if (amount === 0) continue;
    other.resources[resource] = 0;
    player.resources[resource] += amount;
    total += amount;
    from.push({ player: other.id, amount });
  }

  // Public with the breakdown: at a table everyone sees who handed over what.
  events.push({ type: 'MonopolyResolved', player: playerId, resource, from, total });
};

import { COSTS, RESOURCES } from '../constants.js';
import type { GameEvent } from '../events.js';
import type { EdgeId, GameState, PlayerId, Player, ResourceBundle, VertexId } from '../types.js';

/**
 * Building outside setup (SPEC.md §4.3, §4.4).
 *
 * Whether a build is allowed is validate.ts's business; these handlers only
 * carry it out. Costs go back to the bank, which is what keeps the 19 cards per
 * resource conserved.
 */

const playerIn = (draft: GameState, playerId: PlayerId): Player => {
  const player = draft.players.find((candidate) => candidate.id === playerId);
  if (!player) throw new Error(`no player ${playerId}`);
  return player;
};

const payToBank = (
  draft: GameState,
  player: Player,
  cost: Readonly<ResourceBundle>,
  events: GameEvent[],
): void => {
  for (const resource of RESOURCES) {
    player.resources[resource] -= cost[resource];
    draft.bank[resource] += cost[resource];
  }
  events.push({ type: 'ResourcesPaid', player: player.id, cost });
};

export const buildRoad = (
  draft: GameState,
  playerId: PlayerId,
  edge: EdgeId,
  events: GameEvent[],
): void => {
  const player = playerIn(draft, playerId);
  payToBank(draft, player, COSTS.road, events);
  draft.roads[edge] = playerId;
  player.stock.roads -= 1;
  events.push({ type: 'RoadPlaced', player: playerId, edge });
};

export const buildSettlement = (
  draft: GameState,
  playerId: PlayerId,
  vertex: VertexId,
  events: GameEvent[],
): void => {
  const player = playerIn(draft, playerId);
  payToBank(draft, player, COSTS.settlement, events);
  draft.buildings[vertex] = { owner: playerId, type: 'settlement' };
  player.stock.settlements -= 1;
  events.push({ type: 'BuildingPlaced', player: playerId, vertex });
};

export const upgradeToCity = (
  draft: GameState,
  playerId: PlayerId,
  vertex: VertexId,
  events: GameEvent[],
): void => {
  const player = playerIn(draft, playerId);
  payToBank(draft, player, COSTS.city, events);
  draft.buildings[vertex] = { owner: playerId, type: 'city' };
  player.stock.cities -= 1;
  // The settlement goes back to its owner's stock (SPEC.md §4.2).
  player.stock.settlements += 1;
  events.push({ type: 'CityUpgraded', player: playerId, vertex });
};

import { BANK_TRADE_RATE, GENERIC_PORT_RATE, RESOURCES, SPECIFIC_PORT_RATE } from '../constants.js';
import type { GameEvent } from '../events.js';
import type { GameState, PlayerId, ReadonlyGameState, Resource, ResourceBundle } from '../types.js';

/**
 * Maritime trade: with the bank and through harbours (SPEC.md §4.9).
 *
 * **The engine works out the rate, never the client.** A client that could
 * name its own rate could name 1:1, so `maritimeTrade` says only what is given
 * and what is wanted; how many cards that costs is computed here from the
 * player's buildings.
 */

/** The harbours a player has a building on. A city keeps the settlement's harbour. */
const portsOf = (state: ReadonlyGameState, playerId: PlayerId): Set<string> => {
  const ports = new Set<string>();
  for (const vertex of state.board.vertexIds) {
    if (state.buildings[vertex]?.owner !== playerId) continue;
    const port = state.board.vertices[vertex]?.port;
    if (port !== undefined) ports.add(port);
  }
  return ports;
};

/**
 * The best rate this player can get for giving away `resource`: 2 with its own
 * 2:1 harbour, 3 with a generic one, 4 otherwise.
 */
export const maritimeRate = (
  state: ReadonlyGameState,
  playerId: PlayerId,
  resource: Resource,
): number => {
  const ports = portsOf(state, playerId);
  if (ports.has(resource)) return SPECIFIC_PORT_RATE;
  if (ports.has('3:1')) return GENERIC_PORT_RATE;
  return BANK_TRADE_RATE;
};

/** The rate for every resource at once, for the UI and for validation. */
export const availableMaritimeRates = (
  state: ReadonlyGameState,
  playerId: PlayerId,
): Record<Resource, number> => {
  const ports = portsOf(state, playerId);
  const generic = ports.has('3:1');

  const rates = {} as Record<Resource, number>;
  for (const resource of RESOURCES) {
    rates[resource] = ports.has(resource)
      ? SPECIFIC_PORT_RATE
      : generic
        ? GENERIC_PORT_RATE
        : BANK_TRADE_RATE;
  }
  return rates;
};

/** Hands the cards over and takes one back. One unit of `want` per trade. */
export const maritimeTrade = (
  draft: GameState,
  playerId: PlayerId,
  give: Resource,
  want: Resource,
  events: GameEvent[],
): void => {
  const player = draft.players.find((candidate) => candidate.id === playerId);
  if (!player) throw new Error(`no player ${playerId}`);

  const rate = maritimeRate(draft, playerId, give);
  player.resources[give] -= rate;
  draft.bank[give] += rate;
  player.resources[want] += 1;
  draft.bank[want] -= 1;

  events.push({ type: 'MaritimeTraded', player: playerId, give, gave: rate, want, rate });
};

/** What a trade costs, for validation. Exported so validate states no rule of its own. */
export const canTradeMaritime = (
  state: ReadonlyGameState,
  playerId: PlayerId,
  give: Resource,
  want: Resource,
  resources: Readonly<ResourceBundle>,
): 'INSUFFICIENT_RESOURCES' | 'INVALID_TARGET' | null => {
  // Trading a resource for itself is not a trade.
  if (give === want) return 'INVALID_TARGET';
  if (resources[give] < maritimeRate(state, playerId, give)) return 'INSUFFICIENT_RESOURCES';
  // The bank has to have the card being asked for.
  if (state.bank[want] < 1) return 'INSUFFICIENT_RESOURCES';
  return null;
};

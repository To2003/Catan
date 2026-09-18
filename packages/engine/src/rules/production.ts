import { RESOURCES, TERRAIN_RESOURCE } from '../constants.js';
import type { ResourceGrant } from '../events.js';
import type {
  GameState,
  HexId,
  PlayerId,
  ReadonlyGameState,
  Resource,
  VertexId,
} from '../types.js';

/**
 * Production (SPEC.md §4.7) and bank scarcity (SPEC.md §12.1).
 *
 * Two passes, which is what makes scarcity correct: first work out what every
 * player is entitled to, then resolve each resource against what the bank
 * actually holds. Dice rolls and the second setup settlement both go through
 * here, so there is only one production path.
 */

/** What one player is entitled to from one hex, before the bank has a say. */
export interface Claim {
  readonly player: PlayerId;
  readonly resource: Resource;
  readonly amount: number;
  readonly hex: HexId;
}

const claimsFromHex = (state: ReadonlyGameState, hex: HexId): Claim[] => {
  const tile = state.board.hexes[hex];
  if (!tile) return [];
  const resource = TERRAIN_RESOURCE[tile.terrain];
  if (resource === null) return [];

  const claims: Claim[] = [];
  for (const vertex of tile.corners) {
    const building = state.buildings[vertex];
    if (!building) continue;
    claims.push({
      player: building.owner,
      resource,
      amount: building.type === 'city' ? 2 : 1,
      hex,
    });
  }
  return claims;
};

/** Entitlements from every hex carrying the rolled number, robber aside. */
export const claimsFromHexes = (state: ReadonlyGameState, hexes: readonly HexId[]): Claim[] =>
  hexes.flatMap((hex) => claimsFromHex(state, hex));

/** Entitlements of a single building: 1 per adjacent producing hex (SPEC.md §4.5). */
export const claimsFromVertex = (
  state: ReadonlyGameState,
  vertex: VertexId,
  player: PlayerId,
): Claim[] => {
  const node = state.board.vertices[vertex];
  if (!node) return [];

  const claims: Claim[] = [];
  for (const hex of node.hexes) {
    if (hex === state.robberHex) continue;
    const tile = state.board.hexes[hex];
    if (!tile) continue;
    const resource = TERRAIN_RESOURCE[tile.terrain];
    if (resource === null) continue;
    claims.push({ player, resource, amount: 1, hex });
  }
  return claims;
};

export interface Payout {
  readonly grants: ResourceGrant[];
  /** Resources nobody got because the bank ran short (SPEC.md §12.1). */
  readonly skipped: Resource[];
}

/**
 * Resolves claims against the bank and pays out, mutating the draft.
 *
 * Per resource: if the bank covers everyone, everyone is paid. If not, and
 * exactly one player claims it, that player takes whatever is left. With two or
 * more claimants, nobody gets any of that resource. Other resources are
 * unaffected.
 */
export const payClaims = (draft: GameState, claims: readonly Claim[]): Payout => {
  const grants: ResourceGrant[] = [];
  const skipped: Resource[] = [];

  for (const resource of RESOURCES) {
    const forResource = claims.filter((claim) => claim.resource === resource);
    if (forResource.length === 0) continue;

    const demand = forResource.reduce((sum, claim) => sum + claim.amount, 0);
    const claimants = new Set(forResource.map((claim) => claim.player));
    const available = draft.bank[resource];

    if (demand > available && claimants.size > 1) {
      skipped.push(resource);
      continue;
    }

    // Either the bank covers it, or a single claimant takes what is left.
    let remaining = Math.min(demand, available);
    if (remaining === 0) {
      skipped.push(resource);
      continue;
    }

    for (const claim of forResource) {
      if (remaining === 0) break;
      const player = draft.players.find((candidate) => candidate.id === claim.player);
      if (!player) continue;
      const amount = Math.min(claim.amount, remaining);
      remaining -= amount;
      draft.bank[resource] -= amount;
      player.resources[resource] += amount;
      grants.push({ player: claim.player, resource, amount, hex: claim.hex });
    }
  }

  return { grants, skipped };
};

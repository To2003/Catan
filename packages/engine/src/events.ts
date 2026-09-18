import type {
  EdgeId,
  HexId,
  PlayerId,
  Resource,
  ResourceBundle,
  VertexId,
  Phase,
} from './types.js';

/**
 * Everything observable that an action caused.
 *
 * `applyAction` returns these and keeps none: the state is reconstructible from
 * `seed + actions[]`, so a log inside the state would be redundant and would
 * make every structuredClone grow with the game. The consumer accumulates them
 * — the hot-seat now, the server in M6, which is also where private events get
 * filtered per player before being emitted.
 *
 * Events are plain data: serializable, with no references into the board.
 */

/** One player receiving one resource from one hex. */
export interface ResourceGrant {
  readonly player: PlayerId;
  readonly resource: Resource;
  readonly amount: number;
  readonly hex: HexId;
}

export type GameEvent =
  /* Setup (SPEC.md §4.5) */
  | { readonly type: 'SetupSettlementPlaced'; readonly player: PlayerId; readonly vertex: VertexId }
  | { readonly type: 'SetupRoadPlaced'; readonly player: PlayerId; readonly edge: EdgeId }
  /** The second settlement pays out (SPEC.md §4.5). Same production path as the dice. */
  | {
      readonly type: 'SetupResourcesGranted';
      readonly player: PlayerId;
      readonly grants: readonly ResourceGrant[];
    }

  /* Dice and production (SPEC.md §4.7) */
  | {
      readonly type: 'DiceRolled';
      readonly player: PlayerId;
      readonly dice: readonly [number, number];
      readonly total: number;
    }
  | { readonly type: 'ResourcesProduced'; readonly grants: readonly ResourceGrant[] }
  /** A hex that rolled but is under the robber. */
  | { readonly type: 'ProductionSkipped'; readonly reason: 'robber'; readonly hex: HexId }
  /** The bank ran short and two or more players claimed it, so nobody gets any (SPEC.md §12.1). */
  | { readonly type: 'ProductionSkipped'; readonly reason: 'scarcity'; readonly resource: Resource }

  /* Building (SPEC.md §4.3, §4.4) */
  | { readonly type: 'RoadPlaced'; readonly player: PlayerId; readonly edge: EdgeId }
  | { readonly type: 'BuildingPlaced'; readonly player: PlayerId; readonly vertex: VertexId }
  | { readonly type: 'CityUpgraded'; readonly player: PlayerId; readonly vertex: VertexId }
  /** Resources handed back to the bank to pay for something. */
  | {
      readonly type: 'ResourcesPaid';
      readonly player: PlayerId;
      readonly cost: Readonly<ResourceBundle>;
    }

  /* Turn flow */
  | { readonly type: 'PhaseChanged'; readonly phase: Phase }
  | { readonly type: 'TurnEnded'; readonly player: PlayerId; readonly next: PlayerId }
  | { readonly type: 'GameWon'; readonly player: PlayerId; readonly points: number };

export type GameEventType = GameEvent['type'];

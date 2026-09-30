import type {
  DevCard,
  EdgeId,
  HexId,
  Phase,
  PlayerId,
  Resource,
  ResourceBundle,
  TradeOffer,
  VertexId,
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
 *
 * Some carry `visibleTo`: the only players who may see them. Absent means
 * public. The audience is a *field*, not a matter of which type the event is,
 * so in M6 the server filters on one field and never has to know the types. The
 * pattern is a public event stating what happened plus a private one carrying
 * the detail, so filtering means dropping an event whole rather than rewriting
 * its payload.
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

  /* A seven (SPEC.md §4.8) */
  | {
      readonly type: 'DiscardRequired';
      readonly pending: Readonly<Record<PlayerId, number>>;
    }
  | { readonly type: 'CardsDiscarded'; readonly player: PlayerId; readonly count: number }
  | {
      readonly type: 'DiscardDetail';
      readonly player: PlayerId;
      readonly cards: Readonly<ResourceBundle>;
      readonly visibleTo: readonly PlayerId[];
    }
  | {
      readonly type: 'RobberMoved';
      readonly player: PlayerId;
      readonly from: HexId;
      readonly to: HexId;
    }
  | { readonly type: 'StealSkipped'; readonly reason: 'noCandidates' }
  | { readonly type: 'StealResolved'; readonly thief: PlayerId; readonly victim: PlayerId }
  | {
      readonly type: 'ResourceStolen';
      readonly thief: PlayerId;
      readonly victim: PlayerId;
      readonly resource: Resource;
      readonly visibleTo: readonly PlayerId[];
    }

  /* Maritime trade (SPEC.md §4.9) */
  | {
      readonly type: 'MaritimeTraded';
      readonly player: PlayerId;
      readonly give: Resource;
      /** How many cards of `give` went to the bank: the rate the engine worked out. */
      readonly gave: number;
      readonly want: Resource;
      readonly rate: number;
    }

  /* Development cards (SPEC.md §4.10) */
  | { readonly type: 'DevCardBought'; readonly player: PlayerId; readonly deckLeft: number }
  | {
      readonly type: 'DevCardDrawn';
      readonly player: PlayerId;
      readonly card: DevCard;
      readonly visibleTo: readonly PlayerId[];
    }
  | { readonly type: 'DevCardPlayed'; readonly player: PlayerId; readonly card: DevCard }
  | {
      readonly type: 'YearOfPlentyTaken';
      readonly player: PlayerId;
      readonly resources: readonly [Resource, Resource];
    }
  /** Public with the breakdown: at a table everyone sees who handed over what. */
  | {
      readonly type: 'MonopolyResolved';
      readonly player: PlayerId;
      readonly resource: Resource;
      readonly from: readonly { readonly player: PlayerId; readonly amount: number }[];
      readonly total: number;
    }
  | { readonly type: 'RoadBuildingStarted'; readonly player: PlayerId; readonly remaining: number }
  | { readonly type: 'RoadBuildingEnded'; readonly player: PlayerId; readonly placed: number }

  /* Bonuses (SPEC.md §4.11) */
  | {
      readonly type: 'LongestRoadChanged';
      /** Absent when the bonus falls vacant (SPEC.md §12.2). */
      readonly owner?: PlayerId;
      readonly length: number;
    }
  | { readonly type: 'LargestArmyChanged'; readonly owner: PlayerId; readonly knights: number }

  /* Trading between players (SPEC.md §4.9). Offers are public: at a table
     everybody hears them. */
  | { readonly type: 'OfferCreated'; readonly offer: TradeOffer }
  | {
      readonly type: 'OfferResponded';
      readonly offerId: string;
      readonly player: PlayerId;
      readonly response: 'accept' | 'reject';
    }
  | {
      readonly type: 'CounterOffered';
      readonly offer: TradeOffer;
      readonly parentOfferId: string;
    }
  | { readonly type: 'OfferCancelled'; readonly offerId: string }
  | {
      readonly type: 'TradeConfirmed';
      readonly offerId: string;
      readonly from: PlayerId;
      readonly with: PlayerId;
      readonly give: Partial<ResourceBundle>;
      readonly want: Partial<ResourceBundle>;
    }

  /* Turn flow */
  | { readonly type: 'PhaseChanged'; readonly phase: Phase }
  | { readonly type: 'TurnEnded'; readonly player: PlayerId; readonly next: PlayerId }
  /** Somebody walked out of the game for good; their pieces stay (SPEC.md §7.1). */
  | { readonly type: 'PlayerLeft'; readonly player: PlayerId }
  | {
      readonly type: 'GameWon';
      readonly player: PlayerId;
      readonly points: number;
      /** The winner's victory cards, hidden until now (SPEC.md §4.10). */
      readonly revealedVpCards: number;
    };

export type GameEventType = GameEvent['type'];

/**
 * Whether a player may see an event. Public events have no audience; private
 * ones list theirs. This is the whole filter the server needs (M6).
 */
export const isVisibleTo = (event: GameEvent, playerId: PlayerId): boolean =>
  !('visibleTo' in event) || event.visibleTo.includes(playerId);

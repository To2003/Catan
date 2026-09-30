import type { LegalMoves } from './legal.js';
import { legalMoves } from './legal.js';
import type { BoardMode } from './board/generate.js';
import { longestRoadPath } from './rules/longestRoad.js';
import { publicVictoryPoints, victoryPoints } from './rules/victory.js';
import type {
  BoardGraph,
  DevCard,
  EdgeId,
  HexId,
  Phase,
  PlayerColor,
  PlayerId,
  ReadonlyGameState,
  ResourceBundle,
  TradeOffer,
  VertexId,
} from './types.js';

/**
 * What one player is allowed to know (SPEC.md §6).
 *
 * Everything hidden is hidden by *construction*: the view is built field by
 * field from the state, never by deleting from a copy of it, so a new state
 * field cannot leak by being forgotten here.
 *
 * `seed` is as secret as `rngState`. With the seed and the public list of
 * actions anyone can rebuild the whole game, including the shuffled deck and
 * every future roll, so hiding only the RNG state would be theatre.
 */

/** What anyone may know about a player. */
export interface PublicPlayer {
  readonly id: PlayerId;
  readonly name: string;
  readonly color: PlayerColor;
  /** How many resource cards, never which ones. */
  readonly resourceCount: number;
  /** How many development cards, never which ones. */
  readonly devCardCount: number;
  readonly knightsPlayed: number;
  readonly stock: { readonly roads: number; readonly settlements: number; readonly cities: number };
  readonly connected: boolean;
  /** Walked out for good: their pieces stay, but they will not play again. */
  readonly hasLeft: boolean;
  /** Buildings and bonuses only: victory cards stay hidden (SPEC.md §4.10). */
  readonly publicPoints: number;
  /** Roads on the board. Not the same as the route below, and that is the point. */
  readonly roadCount: number;
  /**
   * The longest continuous route, and the roads that make it up.
   *
   * Public: every road is on the table, so anyone could work this out. It
   * travels because the rule is unintuitive — branches do not add up — and the
   * interface can only explain it by drawing the route it counted.
   */
  readonly routeLength: number;
  readonly route: readonly EdgeId[];
}

/** What you may know about yourself, on top of the above. */
export interface OwnPlayer extends PublicPlayer {
  readonly resources: Readonly<ResourceBundle>;
  readonly devCards: readonly DevCard[];
  readonly devCardsBoughtThisTurn: readonly DevCard[];
  /** Your real score, victory cards included. */
  readonly points: number;
}

export interface PlayerView {
  readonly you: PlayerId;
  readonly version: number;
  readonly board: BoardGraph;
  /** How this board was laid out. Public: everybody is looking at the same one. */
  readonly boardMode: BoardMode;
  readonly robberHex: HexId;
  readonly buildings: Readonly<Record<VertexId, { owner: PlayerId; type: 'settlement' | 'city' }>>;
  readonly roads: Readonly<Record<EdgeId, PlayerId>>;
  readonly players: readonly PublicPlayer[];
  readonly me: OwnPlayer;
  readonly bank: Readonly<ResourceBundle>;
  /** How many cards are left, never their order. */
  readonly devDeckCount: number;
  readonly devCardPlayedThisTurn: boolean;
  readonly phase: Phase;
  readonly currentPlayer: PlayerId;
  /** Turns played since the opening placement, from 1. Zero during setup. */
  readonly turn: number;
  /** A full lap of the turn order, from 1. Zero during setup. */
  readonly round: number;
  readonly turnOrder: readonly PlayerId[];
  readonly lastRoll?: readonly [number, number];
  /** Offers are public: at a table everybody hears them (SPEC.md §4.9). */
  readonly tradeOffers: readonly TradeOffer[];
  readonly largestArmy?: PlayerId;
  readonly longestRoad?: { readonly owner: PlayerId; readonly length: number };
  /** Everything this player could do right now, worked out by the engine. */
  readonly legalMoves: LegalMoves;
}

/**
 * Which lap of the table a turn belongs to.
 *
 * Derived rather than stored: two counters that must agree are two counters
 * that can disagree, and the seat count never changes once a game starts.
 */
export const roundOf = (turn: number, players: number): number =>
  turn <= 0 || players <= 0 ? 0 : Math.floor((turn - 1) / players) + 1;

const handSize = (resources: Readonly<ResourceBundle>): number =>
  resources.wood + resources.brick + resources.sheep + resources.wheat + resources.ore;

const toPublic = (state: ReadonlyGameState, playerId: PlayerId): PublicPlayer => {
  const player = state.players.find((candidate) => candidate.id === playerId);
  if (!player) throw new Error(`no player ${playerId}`);
  const route = longestRoadPath(state, playerId);
  return {
    id: player.id,
    name: player.name,
    color: player.color,
    resourceCount: handSize(player.resources),
    devCardCount: player.devCards.length,
    knightsPlayed: player.knightsPlayed,
    stock: { ...player.stock },
    connected: player.connected,
    hasLeft: player.hasLeft,
    publicPoints: publicVictoryPoints(state, player.id),
    roadCount: Object.values(state.roads).filter((owner) => owner === player.id).length,
    routeLength: route.length,
    route,
  };
};

export const getPlayerView = (state: ReadonlyGameState, playerId: PlayerId): PlayerView => {
  const player = state.players.find((candidate) => candidate.id === playerId);
  if (!player) throw new Error(`no player ${playerId}`);

  const me: OwnPlayer = {
    ...toPublic(state, playerId),
    resources: { ...player.resources },
    devCards: [...player.devCards],
    devCardsBoughtThisTurn: [...player.devCardsBoughtThisTurn],
    points: victoryPoints(state, playerId),
  };

  return {
    you: playerId,
    version: state.version,
    board: state.board,
    robberHex: state.robberHex,
    buildings: state.buildings,
    roads: state.roads,
    players: state.players.map((candidate) => toPublic(state, candidate.id)),
    me,
    bank: { ...state.bank },
    devDeckCount: state.devDeck.length,
    devCardPlayedThisTurn: state.devCardPlayedThisTurn,
    tradeOffers: state.tradeOffers,
    phase: state.phase,
    boardMode: state.boardMode,
    currentPlayer: state.currentPlayer,
    turn: state.turn,
    round: roundOf(state.turn, state.turnOrder.length),
    turnOrder: [...state.turnOrder],
    ...(state.lastRoll === undefined ? {} : { lastRoll: [...state.lastRoll] as [number, number] }),
    ...(state.largestArmy === undefined ? {} : { largestArmy: state.largestArmy }),
    ...(state.longestRoad === undefined ? {} : { longestRoad: { ...state.longestRoad } }),
    legalMoves: legalMoves(state, playerId),
  };
};

import {
  BANK_RESOURCE_COUNT,
  DEV_DECK_COMPOSITION,
  DEV_DECK_SIZE,
  MAX_PLAYERS,
  MIN_PLAYERS,
  PIECE_STOCK,
  RESOURCES,
  emptyBundle,
} from './constants.js';
import { generateBoard } from './board/generate.js';
import { shuffle } from './rng.js';
import type {
  DevCard,
  GameState,
  Player,
  PlayerId,
  PlayerSeat,
  ReadonlyGameState,
  ResourceBundle,
} from './types.js';

/**
 * Starting a game.
 *
 * **The order in which the RNG is consumed is part of the contract** (SPEC.md
 * §12.11), because a game replays from `seed + actions[]`:
 *
 *   1. board       — terrains, numbers (with retries), port types
 *   2. turn order  — one shuffle of the seats, in the order they were given
 *   3. dev deck    — one shuffle of the 25 cards
 *   4. dice        — two `rollDie` draws per roll, d1 then d2
 *
 * The board comes first so M1's board snapshot keeps holding, and the dev deck
 * is shuffled here even though nothing draws from it until M5: slotting it in
 * later would change every roll of every seed.
 */

/** The 25 dev cards in a fixed order, so the shuffle is the only source of variation. */
const devDeckBag = (): DevCard[] => {
  const bag = Object.entries(DEV_DECK_COMPOSITION).flatMap(([card, count]) =>
    Array.from({ length: count }, () => card as DevCard),
  );
  // Cheap guard against the composition table and the declared size drifting apart.
  if (bag.length !== DEV_DECK_SIZE) {
    throw new Error(`dev deck composition yields ${bag.length} cards, expected ${DEV_DECK_SIZE}`);
  }
  return bag;
};

const fullBank = (): ResourceBundle => {
  const bank = emptyBundle();
  for (const resource of RESOURCES) bank[resource] = BANK_RESOURCE_COUNT;
  return bank;
};

const seatToPlayer = (seat: PlayerSeat): Player => ({
  id: seat.id,
  name: seat.name,
  color: seat.color,
  resources: emptyBundle(),
  devCards: [],
  devCardsBoughtThisTurn: [],
  knightsPlayed: 0,
  stock: { ...PIECE_STOCK },
  connected: true,
});

/** Seat problems are programming errors, not illegal moves, so they throw instead of returning a Result. */
const validateSeats = (seats: readonly PlayerSeat[]): void => {
  if (seats.length < MIN_PLAYERS || seats.length > MAX_PLAYERS) {
    throw new RangeError(
      `a game needs ${MIN_PLAYERS} to ${MAX_PLAYERS} players, got ${seats.length}`,
    );
  }
  const ids = new Set<PlayerId>(seats.map((seat) => seat.id));
  if (ids.size !== seats.length) throw new Error('player ids must be unique');
  const colors = new Set(seats.map((seat) => seat.color));
  if (colors.size !== seats.length) throw new Error('player colors must be unique');
};

/**
 * Builds the opening state: board, seats, turn order and a shuffled dev deck,
 * with the first player about to place their first settlement.
 */
export const createGame = (seed: number, seats: readonly PlayerSeat[]): ReadonlyGameState => {
  validateSeats(seats);

  // 1. Board.
  const generated = generateBoard(seed);

  // 2. Turn order.
  const orderDraw = shuffle(generated.rngState, seats);
  const turnOrder = orderDraw.value.map((seat) => seat.id);

  // 3. Dev deck.
  const deckDraw = shuffle(orderDraw.state, devDeckBag());

  const first = turnOrder[0] as PlayerId;

  return {
    version: 0,
    seed,
    rngState: deckDraw.state,
    board: generated.board,
    robberHex: generated.robberHex,
    buildings: {},
    roads: {},
    players: seats.map(seatToPlayer),
    turnOrder,
    currentPlayer: first,
    phase: { kind: 'setup', round: 1, step: 'settlement' },
    bank: fullBank(),
    devDeck: deckDraw.value,
    devCardPlayedThisTurn: false,
    tradeOffers: [],
  } satisfies GameState;
};

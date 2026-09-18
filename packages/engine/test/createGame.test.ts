import { describe, expect, it } from 'vitest';
import {
  BANK_RESOURCE_COUNT,
  DEV_DECK_COMPOSITION,
  DEV_DECK_SIZE,
  PIECE_STOCK,
  RESOURCES,
  createGame,
  generateBoard,
  shuffle,
  type DevCard,
  type PlayerSeat,
} from '../src/index.js';

const ANA: PlayerSeat = { id: 'p1', name: 'Ana', color: 'celeste' };
const BRUNO: PlayerSeat = { id: 'p2', name: 'Bruno', color: 'bordo' };
const CATA: PlayerSeat = { id: 'p3', name: 'Cata', color: 'verde' };
const DANTE: PlayerSeat = { id: 'p4', name: 'Dante', color: 'amarillo' };

const SEATS: readonly PlayerSeat[] = [ANA, BRUNO, CATA, DANTE];

/** Indexing into an array is `T | undefined` under noUncheckedIndexedAccess. */
const at = <T>(items: readonly T[], index: number): T => {
  const item = items[index];
  if (item === undefined) throw new Error(`no item at index ${index}`);
  return item;
};

const SEED = 20260918;

describe('createGame', () => {
  it('rejects a seat count outside 3-4', () => {
    expect(() => createGame(SEED, [ANA, BRUNO])).toThrow(RangeError);
    expect(() => createGame(SEED, [...SEATS, { id: 'p5', name: 'Eva', color: 'celeste' }])).toThrow(
      RangeError,
    );
  });

  it('rejects duplicate ids and duplicate colors', () => {
    expect(() => createGame(SEED, [ANA, { ...BRUNO, id: ANA.id }, CATA])).toThrow(
      /ids must be unique/,
    );
    expect(() => createGame(SEED, [ANA, { ...BRUNO, color: ANA.color }, CATA])).toThrow(
      /colors must be unique/,
    );
  });

  it('uses the same board the generator produces for that seed', () => {
    const game = createGame(SEED, SEATS);
    expect(game.board).toEqual(generateBoard(SEED).board);
    expect(game.robberHex).toBe(generateBoard(SEED).robberHex);
  });

  it('draws a turn order that is a permutation of the seats', () => {
    const game = createGame(SEED, SEATS);
    expect([...game.turnOrder].sort()).toEqual(['p1', 'p2', 'p3', 'p4']);
    expect(game.currentPlayer).toBe(game.turnOrder[0]);
  });

  it('keeps the players in seat order, independent of the turn order', () => {
    const game = createGame(SEED, SEATS);
    expect(game.players.map((p) => p.id)).toEqual(['p1', 'p2', 'p3', 'p4']);
  });

  it('is deterministic for a seed and shuffles across seeds', () => {
    expect(createGame(SEED, SEATS)).toEqual(createGame(SEED, SEATS));

    const orders = new Set(
      Array.from({ length: 50 }, (_, i) => createGame(SEED + i, SEATS).turnOrder.join(',')),
    );
    expect(orders.size).toBeGreaterThan(1);
  });

  it('consumes the RNG as board, then turn order, then dev deck (SPEC §12.11)', () => {
    const board = generateBoard(SEED);
    const orderDraw = shuffle(board.rngState, SEATS);
    const deckDraw = shuffle(
      orderDraw.state,
      Object.entries(DEV_DECK_COMPOSITION).flatMap(([card, count]) =>
        Array.from({ length: count }, () => card as DevCard),
      ),
    );

    const game = createGame(SEED, SEATS);
    expect(game.turnOrder).toEqual(orderDraw.value.map((seat) => seat.id));
    expect(game.devDeck).toEqual(deckDraw.value);
    expect(game.rngState).toBe(deckDraw.state);
  });

  it('shuffles a full 25-card dev deck', () => {
    const game = createGame(SEED, SEATS);
    expect(game.devDeck).toHaveLength(DEV_DECK_SIZE);

    const counts = game.devDeck.reduce<Record<string, number>>((acc, card) => {
      acc[card] = (acc[card] ?? 0) + 1;
      return acc;
    }, {});
    expect(counts).toEqual(DEV_DECK_COMPOSITION);
  });

  it('starts every player empty-handed with a full piece stock', () => {
    const game = createGame(SEED, SEATS);
    for (const player of game.players) {
      expect(player.resources).toEqual({ wood: 0, brick: 0, sheep: 0, wheat: 0, ore: 0 });
      expect(player.devCards).toEqual([]);
      expect(player.devCardsBoughtThisTurn).toEqual([]);
      expect(player.knightsPlayed).toBe(0);
      expect(player.stock).toEqual(PIECE_STOCK);
      expect(player.connected).toBe(true);
    }
  });

  it('gives each player their own stock object', () => {
    const game = createGame(SEED, SEATS);
    at(game.players, 0).stock.roads -= 1;
    expect(at(game.players, 1).stock.roads).toBe(PIECE_STOCK.roads);
  });

  it('fills the bank with 19 of each resource', () => {
    const game = createGame(SEED, SEATS);
    for (const resource of RESOURCES) expect(game.bank[resource]).toBe(BANK_RESOURCE_COUNT);
  });

  it('opens on the first setup settlement, with nothing built', () => {
    const game = createGame(SEED, SEATS);
    expect(game.phase).toEqual({ kind: 'setup', round: 1, step: 'settlement' });
    expect(game.buildings).toEqual({});
    expect(game.roads).toEqual({});
    expect(game.version).toBe(0);
    expect(game.lastRoll).toBeUndefined();
    expect(game.tradeOffers).toEqual([]);
    expect(game.devCardPlayedThisTurn).toBe(false);
  });

  it('works with three players', () => {
    const game = createGame(SEED, [ANA, BRUNO, CATA]);
    expect(game.players).toHaveLength(3);
    expect([...game.turnOrder].sort()).toEqual(['p1', 'p2', 'p3']);
  });
});

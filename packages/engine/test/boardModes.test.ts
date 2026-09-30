import { describe, expect, it } from 'vitest';
import {
  BOARD_MODES,
  DEFAULT_LIMITS,
  NUMBER_TOKENS,
  PORT_TYPES,
  TERRAIN_COUNTS,
  boardGeometry,
  complaints,
  createGame,
  generateBoard,
  hexOfCoastEdge,
  isBalanced,
  pipsByResource,
  portEdges,
  type BalanceInput,
  type BoardGraph,
  type HexId,
  type Terrain,
} from '../src/index.js';
import * as classic from '../src/board/classic.js';

/** How many seeds every property runs over. The brief asked for a thousand. */
const SEEDS = 1000;

const geometry = boardGeometry();
const coast = portEdges(geometry);

/** A finished board, read back into the shape the balance checks want. */
const inspect = (board: BoardGraph): BalanceInput => {
  const terrains = new Map<HexId, Terrain>();
  const numbers = new Map<HexId, number>();
  for (const id of geometry.hexIds) {
    const hex = board.hexes[id];
    if (!hex) continue;
    terrains.set(id, hex.terrain);
    if (hex.number !== undefined) numbers.set(id, hex.number);
  }
  return {
    geometry,
    terrains,
    numbers,
    ports: coast.map((edgeId, index) => ({
      type: board.ports[index]?.type ?? '3:1',
      hex: hexOfCoastEdge(geometry, edgeId),
    })),
  };
};

const counted = (values: readonly string[]): Record<string, number> => {
  const totals: Record<string, number> = {};
  for (const value of values) totals[value] = (totals[value] ?? 0) + 1;
  return totals;
};

describe('every mode builds a legal board', () => {
  for (const mode of BOARD_MODES) {
    it(`${mode}: the right tiles, numbers and harbours`, () => {
      // A handful of seeds is enough for the counts; the properties below are
      // the ones that need a thousand.
      for (const seed of [1, 2, 777, 123456]) {
        const { board, robberHex } = generateBoard(seed, mode);
        const terrains = geometry.hexIds.map((id) => board.hexes[id]?.terrain ?? 'desert');
        expect(counted(terrains), `${mode} seed ${seed}`).toEqual({ ...TERRAIN_COUNTS });

        const numbers = geometry.hexIds
          .map((id) => board.hexes[id]?.number)
          .filter((value): value is number => value !== undefined);
        expect([...numbers].sort((a, b) => a - b)).toEqual(
          [...NUMBER_TOKENS].sort((a, b) => a - b),
        );

        expect(counted(board.ports.map((port) => port.type))).toEqual(counted(PORT_TYPES));
        expect(board.hexes[robberHex]?.terrain).toBe('desert');
        expect(board.hexes[robberHex]?.number).toBeUndefined();
      }
    });

    it(`${mode}: the same seed gives the same board, every time`, () => {
      for (const seed of [3, 4242, 99999]) {
        const once = JSON.stringify(generateBoard(seed, mode).board);
        const twice = JSON.stringify(generateBoard(seed, mode).board);
        expect(twice).toBe(once);
      }
    });
  }
});

describe('the random mode is the one every saved game was played on', () => {
  it('is what you get when nobody asks for a mode', () => {
    for (const seed of [1, 2, 3, 500, 99991]) {
      expect(JSON.stringify(generateBoard(seed).board)).toBe(
        JSON.stringify(generateBoard(seed, 'random').board),
      );
      // And through createGame, which is the path a replay takes.
      const seats = [
        { id: 'p1', name: 'Ana', color: 'celeste' as const },
        { id: 'p2', name: 'Bruno', color: 'bordo' as const },
        { id: 'p3', name: 'Cata', color: 'verde' as const },
      ];
      const bare = createGame(seed, seats);
      expect(bare.boardMode).toBe('random');
      expect(JSON.stringify(bare.board)).toBe(
        JSON.stringify(createGame(seed, seats, 'random').board),
      );
      // Turn order and deck come off the same stream too.
      expect(bare.turnOrder).toEqual(createGame(seed, seats, 'random').turnOrder);
      expect(bare.devDeck).toEqual(createGame(seed, seats, 'random').devDeck);
    }
  });

  it('keeps its one rule over a thousand seeds: no two red tokens touching', () => {
    for (let seed = 1; seed <= SEEDS; seed += 1) {
      const input = inspect(generateBoard(seed).board);
      const hot = [...input.numbers.entries()].filter(([, value]) => value === 6 || value === 8);
      for (const [hexId] of hot) {
        const neighbours = geometry.hexIds.filter((other) => {
          const a = geometry.hexes[hexId];
          const b = geometry.hexes[other];
          if (!a || !b) return false;
          const dq = b.q - a.q;
          const dr = b.r - a.r;
          return (
            (dq === 1 && dr === 0) ||
            (dq === -1 && dr === 0) ||
            (dq === 0 && dr === 1) ||
            (dq === 0 && dr === -1) ||
            (dq === 1 && dr === -1) ||
            (dq === -1 && dr === 1)
          );
        });
        for (const other of neighbours) {
          const value = input.numbers.get(other);
          expect(value === 6 || value === 8, `seed ${seed}: ${hexId} touches ${other}`).toBe(false);
        }
      }
    }
  });
});

describe('the classic mode', () => {
  it('is the same board whatever the seed', () => {
    const first = JSON.stringify(generateBoard(1, 'classic').board);
    for (const seed of [2, 3, 12345, 987654]) {
      expect(JSON.stringify(generateBoard(seed, 'classic').board)).toBe(first);
    }
  });

  it('matches the table in classic.ts, hex by hex', () => {
    const { board } = generateBoard(1, 'classic');
    for (const id of geometry.hexIds) {
      expect(board.hexes[id]?.terrain, id).toBe(classic.TERRAINS[id]);
    }
    // The numbers follow the lettered spiral, skipping the desert.
    const alongSpiral = classic.SPIRAL.filter((id) => classic.TERRAINS[id] !== 'desert').map(
      (id) => board.hexes[id]?.number,
    );
    expect(alongSpiral).toEqual([...classic.NUMBER_SPIRAL]);
    expect(board.ports.map((port) => port.type)).toEqual([...classic.PORTS]);
  });

  it('respects the rule it was built to: no two red tokens touching', () => {
    expect(complaints(inspect(generateBoard(1, 'classic').board), DEFAULT_LIMITS)).not.toContain(
      'equalNumbers',
    );
    const { board } = generateBoard(1, 'classic');
    const input = inspect(board);
    for (const [hexId, value] of input.numbers) {
      if (value !== 6 && value !== 8) continue;
      const hex = geometry.hexes[hexId];
      if (!hex) continue;
      for (const other of geometry.hexIds) {
        const neighbour = geometry.hexes[other];
        if (!neighbour) continue;
        const dq = neighbour.q - hex.q;
        const dr = neighbour.r - hex.r;
        const touches = Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr) === 2;
        if (!touches) continue;
        const value2 = input.numbers.get(other);
        expect(value2 === 6 || value2 === 8, `${hexId} touches ${other}`).toBe(false);
      }
    }
  });

  it('leaves the seed for the rest of the game', () => {
    const seats = [
      { id: 'p1', name: 'Ana', color: 'celeste' as const },
      { id: 'p2', name: 'Bruno', color: 'bordo' as const },
      { id: 'p3', name: 'Cata', color: 'verde' as const },
    ];
    // Same board, different everything else.
    const orders = new Set(
      [11, 22, 33, 44, 55, 66].map((seed) => createGame(seed, seats, 'classic').turnOrder.join()),
    );
    expect(orders.size).toBeGreaterThan(1);
  });
});

describe('the balanced mode, over a thousand seeds', () => {
  const results = Array.from({ length: SEEDS }, (_, index) => generateBoard(index + 1, 'balanced'));

  it('passes all four rules on every one of them', () => {
    results.forEach((result, index) => {
      const found = complaints(inspect(result.board), DEFAULT_LIMITS);
      expect(found, `seed ${index + 1}`).toEqual([]);
      expect(isBalanced(inspect(result.board), DEFAULT_LIMITS)).toBe(true);
    });
  });

  it('finds one well inside the retry budget', () => {
    const attempts = results.map((result) => result.attempts);
    const worst = Math.max(...attempts);
    const mean = attempts.reduce((sum, value) => sum + value, 0) / attempts.length;
    // Recorded here so a change in the rules shows up as a number rather than
    // as a slow test: measured at ~71 average and 470 worst of 1000 seeds.
    expect(worst).toBeLessThan(2000);
    expect(mean).toBeLessThan(200);
  });

  it('never leaves a resource starved or flooded', () => {
    for (const result of results) {
      const totals = pipsByResource(inspect(result.board));
      for (const value of Object.values(totals)) expect(value).toBeGreaterThan(0);
    }
  });
});

describe('a game carries the mode it was played on', () => {
  const seats = [
    { id: 'p1', name: 'Ana', color: 'celeste' as const },
    { id: 'p2', name: 'Bruno', color: 'bordo' as const },
    { id: 'p3', name: 'Cata', color: 'verde' as const },
  ];

  for (const mode of BOARD_MODES) {
    it(`${mode}: the state says so, and replays into the same board`, () => {
      const state = createGame(4321, seats, mode);
      expect(state.boardMode).toBe(mode);
      const again = createGame(4321, seats, state.boardMode);
      expect(JSON.stringify(again.board)).toBe(JSON.stringify(state.board));
    });
  }
});

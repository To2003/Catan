import { describe, expect, it } from 'vitest';
import { generateBoard } from '../src/board/generate.js';
import { adjacentHexes, boardGeometry } from '../src/board/geometry.js';
import {
  EDGE_COUNT,
  HEX_COUNT,
  HOT_NUMBERS,
  NUMBER_TOKENS,
  PORT_COUNT,
  PORT_TYPES,
  RESOURCES,
  TERRAIN_COUNTS,
  VERTEX_COUNT,
} from '../src/constants.js';
import type { BoardGraph, Hex, HexId, Terrain } from '../src/types.js';

const geometry = boardGeometry();
const hexOf = (board: BoardGraph, id: HexId): Hex => board.hexes[id] as Hex;
const isRed = (n: number | undefined): boolean =>
  n !== undefined && (HOT_NUMBERS as readonly number[]).includes(n);

/** A compact, reviewable rendering of a board, for the snapshot. */
const describeBoard = (board: BoardGraph): string => {
  const hexes = board.hexIds
    .map((id) => {
      const hex = hexOf(board, id);
      return `${id} (${hex.q},${hex.r}) ${hex.terrain}${hex.number === undefined ? '' : ` ${hex.number}`}`;
    })
    .join('\n');
  const ports = board.ports.map((p) => `${p.edge} ${p.type} [${p.vertices.join(', ')}]`).join('\n');
  return `HEXES\n${hexes}\n\nPORTS\n${ports}`;
};

describe('generateBoard', () => {
  it('is deterministic for a seed', () => {
    expect(generateBoard(42)).toEqual(generateBoard(42));
  });

  it('produces different boards for different seeds', () => {
    const a = generateBoard(1).board;
    const b = generateBoard(2).board;
    expect(a.hexIds.map((id) => hexOf(a, id).terrain)).not.toEqual(
      b.hexIds.map((id) => hexOf(b, id).terrain),
    );
  });

  it('normalises the seed to uint32', () => {
    expect(generateBoard(-1)).toEqual(generateBoard(0xffffffff));
    expect(generateBoard(7)).toEqual(generateBoard(7 + 0x100000000));
  });

  it('advances the RNG state past the seed', () => {
    expect(generateBoard(42).rngState).not.toBe(42);
  });

  it('keeps the full graph', () => {
    const { board } = generateBoard(42);
    expect(board.hexIds).toHaveLength(HEX_COUNT);
    expect(board.vertexIds).toHaveLength(VERTEX_COUNT);
    expect(board.edgeIds).toHaveLength(EDGE_COUNT);
  });

  it('places exactly the right terrains', () => {
    const { board } = generateBoard(42);
    const counts = new Map<Terrain, number>();
    for (const id of board.hexIds) {
      const { terrain } = hexOf(board, id);
      counts.set(terrain, (counts.get(terrain) ?? 0) + 1);
    }
    expect(Object.fromEntries(counts)).toEqual(TERRAIN_COUNTS);
  });

  it('places exactly the 18 number tokens, none on the desert', () => {
    const { board } = generateBoard(42);
    const numbers = board.hexIds.map((id) => hexOf(board, id).number);
    expect(numbers.filter((n) => n !== undefined).sort((a, b) => a - b)).toEqual(
      [...NUMBER_TOKENS].sort((a, b) => a - b),
    );
    for (const id of board.hexIds) {
      const hex = hexOf(board, id);
      expect(hex.number === undefined).toBe(hex.terrain === 'desert');
    }
  });

  it('starts the robber on the desert', () => {
    const { board, robberHex } = generateBoard(42);
    expect(hexOf(board, robberHex).terrain).toBe('desert');
  });

  it('never puts two red numbers side by side, over 500 seeds', () => {
    for (let seed = 0; seed < 500; seed += 1) {
      const { board } = generateBoard(seed);
      for (const id of board.hexIds) {
        if (!isRed(hexOf(board, id).number)) continue;
        for (const other of adjacentHexes(geometry, id)) {
          expect(isRed(hexOf(board, other).number)).toBe(false);
        }
      }
    }
  });

  it('places 9 harbours with the right mix of types', () => {
    const { board } = generateBoard(42);
    expect(board.ports).toHaveLength(PORT_COUNT);
    expect([...board.ports.map((p) => p.type)].sort()).toEqual([...PORT_TYPES].sort());
    expect(board.ports.filter((p) => p.type === '3:1')).toHaveLength(4);
    expect(new Set(board.ports.filter((p) => p.type !== '3:1').map((p) => p.type))).toEqual(
      new Set(RESOURCES),
    );
  });

  it('mirrors each harbour onto both of its vertices and nowhere else', () => {
    const { board } = generateBoard(42);
    const expected = new Map(board.ports.flatMap((p) => p.vertices.map((v) => [v, p.type])));
    for (const id of board.vertexIds) {
      expect(board.vertices[id]?.port).toBe(expected.get(id));
    }
    expect(expected.size).toBe(PORT_COUNT * 2);
  });

  it('shuffles harbour types across seeds but keeps their edges fixed', () => {
    const a = generateBoard(1).board;
    const b = generateBoard(2).board;
    expect(a.ports.map((p) => p.edge)).toEqual(b.ports.map((p) => p.edge));
    expect(a.ports.map((p) => p.type)).not.toEqual(b.ports.map((p) => p.type));
  });

  it('matches the recorded board for seed 20260918', () => {
    // Pins the RNG consumption order documented in generate.ts. If this fails
    // after a deliberate change to that order, re-record it knowingly.
    expect(describeBoard(generateBoard(20260918).board)).toMatchSnapshot();
  });
});

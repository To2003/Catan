import type {
  BoardGraph,
  Edge,
  EdgeId,
  Hex,
  HexId,
  Port,
  PortType,
  Terrain,
  Vertex,
  VertexId,
} from '../types.js';
import { HOT_NUMBERS, NUMBER_TOKENS, PORT_TYPES, TERRAIN_COUNTS } from '../constants.js';
import { createRng, shuffle, type RngState } from '../rng.js';
import {
  adjacentHexes,
  boardGeometry,
  type BoardGeometry,
  type EdgeGeometry,
  type HexGeometry,
  type VertexGeometry,
} from './geometry.js';
import { portEdges } from './layout.js';

/**
 * Board generation.
 *
 * **The order in which the RNG is consumed is part of the contract**, because
 * the snapshot test pins a whole board to a seed:
 *
 *   1. terrains        — one Fisher-Yates shuffle of the terrain bag
 *   2. numbers         — one shuffle per attempt, retried until no two red
 *                        tokens are adjacent (terrains stay put)
 *   3. port types      — one shuffle of the 9 harbour types
 *
 * Changing that order changes every board for every seed and will break the
 * snapshot on purpose. Update it deliberately, never by blindly re-recording.
 */

/** Guards against an unsatisfiable retry loop. In practice a handful of attempts suffice. */
const MAX_NUMBER_ATTEMPTS = 1000;

export interface GeneratedBoard {
  readonly board: BoardGraph;
  /** Where the robber starts: the desert (SPEC.md §12.9). */
  readonly robberHex: HexId;
  readonly rngState: RngState;
}

/** The terrain bag in a fixed order, so the shuffle is the only source of variation. */
const terrainBag = (): Terrain[] =>
  Object.entries(TERRAIN_COUNTS).flatMap(([terrain, count]) =>
    Array.from({ length: count }, () => terrain as Terrain),
  );

const isRedNumber = (value: number | undefined): boolean =>
  value !== undefined && (HOT_NUMBERS as readonly number[]).includes(value);

/** No two hexes carrying a red token (6 or 8) may share an edge (SPEC.md §4.1, §12.9). */
const hasAdjacentRedNumbers = (
  geometry: BoardGeometry,
  numbers: ReadonlyMap<HexId, number>,
): boolean =>
  [...numbers.entries()].some(
    ([hexId, value]) =>
      isRedNumber(value) &&
      adjacentHexes(geometry, hexId).some((other) => isRedNumber(numbers.get(other))),
  );

const assignNumbers = (
  geometry: BoardGeometry,
  terrains: ReadonlyMap<HexId, Terrain>,
  state: RngState,
): { numbers: Map<HexId, number>; state: RngState } => {
  const numbered = geometry.hexIds.filter((id) => terrains.get(id) !== 'desert');
  let current = state;

  for (let attempt = 0; attempt < MAX_NUMBER_ATTEMPTS; attempt += 1) {
    const draw = shuffle(current, NUMBER_TOKENS);
    current = draw.state;
    const numbers = new Map<HexId, number>();
    numbered.forEach((hexId, index) => {
      numbers.set(hexId, draw.value[index] as number);
    });
    if (!hasAdjacentRedNumbers(geometry, numbers)) return { numbers, state: current };
  }

  throw new Error(
    `could not place number tokens without adjacent 6/8 in ${MAX_NUMBER_ATTEMPTS} attempts`,
  );
};

const buildPorts = (
  geometry: BoardGeometry,
  types: readonly PortType[],
): { ports: Port[]; byVertex: Map<VertexId, PortType> } => {
  const byVertex = new Map<VertexId, PortType>();
  const ports = portEdges(geometry).map((edgeId, index) => {
    const edge = geometry.edges[edgeId] as EdgeGeometry;
    const type = types[index] as PortType;
    const [a, b] = edge.vertices;
    byVertex.set(a, type);
    byVertex.set(b, type);
    return { edge: edgeId, type, vertices: [a, b] as const } satisfies Port;
  });
  return { ports, byVertex };
};

/**
 * Builds a full board from a seed. Pure: the only randomness is the seeded PRNG,
 * so the same seed always yields the same board.
 */
export const generateBoard = (seed: number): GeneratedBoard => {
  const geometry = boardGeometry();
  let state = createRng(seed);

  // 1. Terrains.
  const terrainDraw = shuffle(state, terrainBag());
  state = terrainDraw.state;
  const terrains = new Map<HexId, Terrain>(
    geometry.hexIds.map((id, index) => [id, terrainDraw.value[index] as Terrain]),
  );

  // 2. Numbers, retried until the red tokens are spread out.
  const numberResult = assignNumbers(geometry, terrains, state);
  state = numberResult.state;

  // 3. Port types.
  const portDraw = shuffle(state, PORT_TYPES);
  state = portDraw.state;
  const { ports, byVertex } = buildPorts(geometry, portDraw.value);

  const hexes: Record<HexId, Hex> = {};
  for (const id of geometry.hexIds) {
    const base = geometry.hexes[id] as HexGeometry;
    const terrain = terrains.get(id) as Terrain;
    const number = numberResult.numbers.get(id);
    hexes[id] = {
      id,
      q: base.q,
      r: base.r,
      center: base.center,
      terrain,
      corners: base.corners,
      edges: base.edges,
      ...(number === undefined ? {} : { number }),
    };
  }

  const vertices: Record<VertexId, Vertex> = {};
  for (const id of geometry.vertexIds) {
    const base = geometry.vertices[id] as VertexGeometry;
    const port = byVertex.get(id);
    vertices[id] = {
      id,
      x: base.x,
      y: base.y,
      hexes: base.hexes,
      edges: base.edges,
      neighbors: base.neighbors,
      ...(port === undefined ? {} : { port }),
    };
  }

  const edges: Record<EdgeId, Edge> = {};
  for (const id of geometry.edgeIds) {
    const base = geometry.edges[id] as EdgeGeometry;
    edges[id] = { id, vertices: base.vertices, hexes: base.hexes };
  }

  const desert = geometry.hexIds.find((id) => terrains.get(id) === 'desert');
  if (!desert) throw new Error('generated board has no desert');

  return {
    board: {
      hexes,
      vertices,
      edges,
      ports,
      hexIds: geometry.hexIds,
      vertexIds: geometry.vertexIds,
      edgeIds: geometry.edgeIds,
    },
    robberHex: desert,
    rngState: state,
  };
};

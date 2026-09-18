import type { EdgeId, HexId, Point, VertexId } from '../types.js';
import { BOARD_RADIUS } from '../constants.js';

/**
 * Board geometry: the fixed topology of a radius-2 pointy-top hex board.
 *
 * Everything here is computed in **unit space**, where a hex has circumradius 1.
 * The renderer derives its own viewBox from the bounding box, so no pixel size
 * ever leaks into the engine.
 *
 * The geometry is the same for every game: only terrain, numbers and ports are
 * randomised (see generate.ts).
 */

const SQRT3 = Math.sqrt(3);

/**
 * Positions are snapped to a 1e-4 grid before being compared, so shared corners
 * of neighbouring hexes collapse into one vertex despite floating point drift.
 *
 * The margin is enormous: in unit space every x is a multiple of √3/2 ≈ 0.866
 * and every y a multiple of 0.5, so two distinct vertices are never closer than
 * 0.5 — five thousand times the grid step. geometry.test.ts asserts that margin.
 */
const QUANTIZATION = 1e4;

const quantize = (value: number): number => Math.round(value * QUANTIZATION);

const positionKey = (p: Point): string => `${quantize(p.x)}|${quantize(p.y)}`;

export interface HexGeometry {
  readonly id: HexId;
  readonly q: number;
  readonly r: number;
  readonly center: Point;
  /** The 6 corners in drawing order, starting at the east-north-east one. */
  readonly corners: readonly VertexId[];
  /** The 6 sides, where side i joins corners i and i+1. */
  readonly edges: readonly EdgeId[];
}

export interface VertexGeometry {
  readonly id: VertexId;
  readonly x: number;
  readonly y: number;
  readonly hexes: readonly HexId[];
  readonly edges: readonly EdgeId[];
  readonly neighbors: readonly VertexId[];
}

export interface EdgeGeometry {
  readonly id: EdgeId;
  readonly vertices: readonly [VertexId, VertexId];
  readonly hexes: readonly HexId[];
}

export interface BoardGeometry {
  readonly hexes: Readonly<Record<HexId, HexGeometry>>;
  readonly vertices: Readonly<Record<VertexId, VertexGeometry>>;
  readonly edges: Readonly<Record<EdgeId, EdgeGeometry>>;
  /** Ids in canonical order, so callers can iterate deterministically. */
  readonly hexIds: readonly HexId[];
  readonly vertexIds: readonly VertexId[];
  readonly edgeIds: readonly EdgeId[];
}

/**
 * Axial coordinates of the 19 hexes, in row order: r ascending, then q
 * ascending. Rows come out 3-4-5-4-3. This order fixes the hex ids h0..h18.
 */
export const axialCoordinates = (): { q: number; r: number }[] => {
  const coords: { q: number; r: number }[] = [];
  for (let r = -BOARD_RADIUS; r <= BOARD_RADIUS; r += 1) {
    const qMin = Math.max(-BOARD_RADIUS, -BOARD_RADIUS - r);
    const qMax = Math.min(BOARD_RADIUS, BOARD_RADIUS - r);
    for (let q = qMin; q <= qMax; q += 1) {
      coords.push({ q, r });
    }
  }
  return coords;
};

/** Center of a pointy-top hex in unit space. y grows downward, as in SVG. */
export const hexCenter = (q: number, r: number): Point => ({
  x: SQRT3 * (q + r / 2),
  y: 1.5 * r,
});

/** The 6 corners of a pointy-top hex, at 60° steps starting from -30°. */
export const hexCorners = (center: Point): Point[] =>
  Array.from({ length: 6 }, (_, i) => {
    const angle = ((60 * i - 30) * Math.PI) / 180;
    return { x: center.x + Math.cos(angle), y: center.y + Math.sin(angle) };
  });

interface VertexDraft {
  readonly point: Point;
  readonly qx: number;
  readonly qy: number;
  readonly hexes: Set<HexId>;
}

interface EdgeDraft {
  readonly a: number;
  readonly b: number;
  readonly hexes: Set<HexId>;
}

const compareNumeric = (a: number, b: number): number => a - b;

/** Reads the index encoded in an id, e.g. 'v12' -> 12. Ids are engine-generated. */
const idIndex = (id: string): number => Number(id.slice(1));

const buildGeometry = (): BoardGeometry => {
  const coords = axialCoordinates();

  // Pass 1: collect unique corner positions, remembering which hexes touch each.
  const draftsByKey = new Map<string, VertexDraft>();
  const hexCornerKeys: string[][] = [];

  coords.forEach((coord, hexIndex) => {
    const hexId: HexId = `h${hexIndex}`;
    const keys = hexCorners(hexCenter(coord.q, coord.r)).map((point) => {
      const key = positionKey(point);
      const existing = draftsByKey.get(key);
      if (existing) {
        existing.hexes.add(hexId);
        return key;
      }
      draftsByKey.set(key, {
        point,
        qx: quantize(point.x),
        qy: quantize(point.y),
        hexes: new Set([hexId]),
      });
      return key;
    });
    hexCornerKeys.push(keys);
  });

  // Pass 2: vertex ids, ordered top to bottom then left to right.
  const orderedKeys = [...draftsByKey.entries()].sort(([, a], [, b]) =>
    a.qy === b.qy ? compareNumeric(a.qx, b.qx) : compareNumeric(a.qy, b.qy),
  );
  const vertexIdByKey = new Map<string, VertexId>();
  orderedKeys.forEach(([key], index) => {
    vertexIdByKey.set(key, `v${index}`);
  });

  const vertexIdOf = (key: string): VertexId => {
    const id = vertexIdByKey.get(key);
    if (!id) throw new Error(`no vertex for position ${key}`);
    return id;
  };

  // Pass 3: unique edges, keyed by their two vertex indices.
  const edgeDrafts = new Map<string, EdgeDraft>();
  const hexEdgeKeys: string[][] = [];

  hexCornerKeys.forEach((keys, hexIndex) => {
    const hexId: HexId = `h${hexIndex}`;
    const edgeKeys = keys.map((key, i) => {
      const from = idIndex(vertexIdOf(key));
      const to = idIndex(vertexIdOf(keys[(i + 1) % 6] as string));
      const [a, b] = from < to ? [from, to] : [to, from];
      const edgeKey = `${a}|${b}`;
      const existing = edgeDrafts.get(edgeKey);
      if (existing) existing.hexes.add(hexId);
      else edgeDrafts.set(edgeKey, { a, b, hexes: new Set([hexId]) });
      return edgeKey;
    });
    hexEdgeKeys.push(edgeKeys);
  });

  const edgeIdByKey = new Map<string, EdgeId>();
  [...edgeDrafts.entries()]
    .sort(([, x], [, y]) => (x.a === y.a ? compareNumeric(x.b, y.b) : compareNumeric(x.a, y.a)))
    .forEach(([key], index) => {
      edgeIdByKey.set(key, `e${index}`);
    });

  const edgeIdOf = (key: string): EdgeId => {
    const id = edgeIdByKey.get(key);
    if (!id) throw new Error(`no edge for vertices ${key}`);
    return id;
  };

  // Pass 4: assemble the records.
  const hexes: Record<HexId, HexGeometry> = {};
  const hexIds: HexId[] = coords.map((coord, hexIndex) => {
    const id: HexId = `h${hexIndex}`;
    hexes[id] = {
      id,
      q: coord.q,
      r: coord.r,
      center: hexCenter(coord.q, coord.r),
      corners: (hexCornerKeys[hexIndex] as string[]).map(vertexIdOf),
      edges: (hexEdgeKeys[hexIndex] as string[]).map(edgeIdOf),
    };
    return id;
  });

  const edgesOfVertex = new Map<VertexId, EdgeId[]>();
  const neighborsOfVertex = new Map<VertexId, VertexId[]>();
  const edges: Record<EdgeId, EdgeGeometry> = {};
  const edgeIds: EdgeId[] = [];

  for (const [key, draft] of edgeDrafts) {
    const id = edgeIdOf(key);
    const a: VertexId = `v${draft.a}`;
    const b: VertexId = `v${draft.b}`;
    edges[id] = {
      id,
      vertices: [a, b],
      hexes: [...draft.hexes].sort((x, y) => compareNumeric(idIndex(x), idIndex(y))),
    };
    edgeIds.push(id);
    for (const [from, to] of [
      [a, b],
      [b, a],
    ] as const) {
      edgesOfVertex.set(from, [...(edgesOfVertex.get(from) ?? []), id]);
      neighborsOfVertex.set(to, [...(neighborsOfVertex.get(to) ?? []), from]);
    }
  }
  edgeIds.sort((x, y) => compareNumeric(idIndex(x), idIndex(y)));

  const vertices: Record<VertexId, VertexGeometry> = {};
  const vertexIds: VertexId[] = orderedKeys.map(([key, draft]) => {
    const id = vertexIdOf(key);
    const byIndex = <T extends string>(list: readonly T[]): T[] =>
      [...list].sort((x, y) => compareNumeric(idIndex(x), idIndex(y)));
    vertices[id] = {
      id,
      x: draft.point.x,
      y: draft.point.y,
      hexes: byIndex([...draft.hexes]),
      edges: byIndex(edgesOfVertex.get(id) ?? []),
      neighbors: byIndex(neighborsOfVertex.get(id) ?? []),
    };
    return id;
  });

  return { hexes, vertices, edges, hexIds, vertexIds, edgeIds };
};

let cached: BoardGeometry | undefined;

/**
 * The board topology. Memoised because it is a constant: the same pure
 * computation every time, with no dependency on game state or the RNG.
 */
export const boardGeometry = (): BoardGeometry => (cached ??= buildGeometry());

/** Bounding box in unit space, for the renderer's viewBox. */
export const geometryBounds = (
  geometry: BoardGeometry,
): { minX: number; minY: number; maxX: number; maxY: number } => {
  const points = geometry.vertexIds.map((id) => geometry.vertices[id] as VertexGeometry);
  return {
    minX: Math.min(...points.map((p) => p.x)),
    minY: Math.min(...points.map((p) => p.y)),
    maxX: Math.max(...points.map((p) => p.x)),
    maxY: Math.max(...points.map((p) => p.y)),
  };
};

/** Hexes that share an edge with the given hex. Used by the 6/8 adjacency rule. */
export const adjacentHexes = (geometry: BoardGeometry, hexId: HexId): HexId[] => {
  const hex = geometry.hexes[hexId];
  if (!hex) return [];
  const found = new Set<HexId>();
  for (const edgeId of hex.edges) {
    for (const other of geometry.edges[edgeId]?.hexes ?? []) {
      if (other !== hexId) found.add(other);
    }
  }
  return [...found];
};

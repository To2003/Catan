import type { EdgeId, Point, VertexId } from '../types.js';
import { PORT_COUNT } from '../constants.js';
import type { BoardGeometry, EdgeGeometry, VertexGeometry } from './geometry.js';

/**
 * Perimeter walk and harbour positions.
 *
 * Harbours sit on fixed edges of the coast; only their types are randomised
 * (SPEC.md §4.1). To place them without hardcoding ids, we walk the coastline
 * clockwise and take fixed indices along the way.
 */

/**
 * Where the clockwise walk starts: the perimeter edge whose midpoint has the
 * smallest y, breaking ties by the smallest x.
 *
 * On a pointy-top board that is the upper-left edge of the top-left hex. A
 * pointy-top hex has no top edge — it has a top *corner* — so the rule is
 * stated in terms of midpoints rather than by name (SPEC.md §12.10).
 */
const startsWalk = (a: Point, b: Point): number => (a.y === b.y ? a.x - b.x : a.y - b.y);

/**
 * Harbour positions along the 30-edge coastline: steps of 3, 3, 4, repeated.
 * The gaps never fall below 2, so no two harbours share a vertex.
 */
export const PORT_EDGE_INDICES = [0, 3, 6, 10, 13, 16, 20, 23, 26] as const;

/** Rotates every harbour along the coastline. Purely cosmetic (SPEC.md §12.10). */
export const PORT_START_OFFSET = 0;

export const PERIMETER_EDGE_COUNT = 30;

const midpoint = (geometry: BoardGeometry, edge: EdgeGeometry): Point => {
  const [a, b] = edge.vertices;
  const from = geometry.vertices[a] as VertexGeometry;
  const to = geometry.vertices[b] as VertexGeometry;
  return { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
};

/**
 * Shoelace sign. In screen space, where y grows downward, a clockwise polygon
 * has a positive shoelace sum.
 */
const isClockwise = (points: readonly Point[]): boolean => {
  let sum = 0;
  for (let i = 0; i < points.length; i += 1) {
    const current = points[i] as Point;
    const next = points[(i + 1) % points.length] as Point;
    sum += current.x * next.y - next.x * current.y;
  }
  return sum > 0;
};

/** Coast edges: those touching a single hex. */
export const perimeterEdges = (geometry: BoardGeometry): EdgeId[] =>
  geometry.edgeIds.filter((id) => (geometry.edges[id] as EdgeGeometry).hexes.length === 1);

/**
 * The coastline as one cycle, walked clockwise from the documented start edge.
 * Every perimeter vertex belongs to exactly two perimeter edges, so the walk is
 * unambiguous once a direction is chosen.
 */
export const perimeterWalk = (geometry: BoardGeometry): EdgeId[] => {
  const coast = perimeterEdges(geometry);
  const coastSet = new Set(coast);

  const edgesOfVertex = new Map<VertexId, EdgeId[]>();
  for (const id of coast) {
    for (const vertex of (geometry.edges[id] as EdgeGeometry).vertices) {
      edgesOfVertex.set(vertex, [...(edgesOfVertex.get(vertex) ?? []), id]);
    }
  }

  let start = coast[0] as EdgeId;
  for (const id of coast) {
    const candidate = midpoint(geometry, geometry.edges[id] as EdgeGeometry);
    const best = midpoint(geometry, geometry.edges[start] as EdgeGeometry);
    if (startsWalk(candidate, best) < 0) start = id;
  }

  const walk: EdgeId[] = [start];
  const visited = new Set<EdgeId>([start]);
  let current = start;
  let entryVertex = (geometry.edges[start] as EdgeGeometry).vertices[0];

  while (walk.length < coast.length) {
    const edge = geometry.edges[current] as EdgeGeometry;
    const exitVertex = edge.vertices[0] === entryVertex ? edge.vertices[1] : edge.vertices[0];
    const next = (edgesOfVertex.get(exitVertex) ?? []).find(
      (id) => coastSet.has(id) && !visited.has(id),
    );
    if (!next) break;
    walk.push(next);
    visited.add(next);
    current = next;
    entryVertex = exitVertex;
  }

  if (walk.length !== coast.length) {
    throw new Error(`perimeter is not a single cycle: walked ${walk.length} of ${coast.length}`);
  }

  const midpoints = walk.map((id) => midpoint(geometry, geometry.edges[id] as EdgeGeometry));
  if (isClockwise(midpoints)) return walk;

  // Same cycle, other way round, with the start edge still first.
  return [start, ...walk.slice(1).reverse()];
};

/** The 9 harbour edges, in clockwise order from the start edge. */
export const portEdges = (geometry: BoardGeometry): EdgeId[] => {
  const walk = perimeterWalk(geometry);
  const edges = PORT_EDGE_INDICES.map(
    (index) => walk[(index + PORT_START_OFFSET) % walk.length] as EdgeId,
  );
  if (edges.length !== PORT_COUNT) {
    throw new Error(`expected ${PORT_COUNT} port edges, got ${edges.length}`);
  }
  return edges;
};

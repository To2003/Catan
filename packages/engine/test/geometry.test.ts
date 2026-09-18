import { describe, expect, it } from 'vitest';
import {
  adjacentHexes,
  axialCoordinates,
  boardGeometry,
  geometryBounds,
  hexCenter,
  hexCorners,
  type EdgeGeometry,
  type HexGeometry,
  type VertexGeometry,
} from '../src/board/geometry.js';
import { EDGE_COUNT, HEX_COUNT, VERTEX_COUNT } from '../src/constants.js';

const geometry = boardGeometry();
const vertex = (id: string): VertexGeometry => geometry.vertices[id as never] as VertexGeometry;
const edge = (id: string): EdgeGeometry => geometry.edges[id as never] as EdgeGeometry;
const hex = (id: string): HexGeometry => geometry.hexes[id as never] as HexGeometry;

describe('axial coordinates', () => {
  it('lays out 19 hexes in rows of 3-4-5-4-3', () => {
    const coords = axialCoordinates();
    expect(coords).toHaveLength(HEX_COUNT);
    const rows = new Map<number, number>();
    for (const { r } of coords) rows.set(r, (rows.get(r) ?? 0) + 1);
    expect([...rows.entries()].sort(([a], [b]) => a - b).map(([, n]) => n)).toEqual([
      3, 4, 5, 4, 3,
    ]);
  });

  it('stays within the board radius', () => {
    for (const { q, r } of axialCoordinates()) {
      expect(Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r))).toBeLessThanOrEqual(2);
    }
  });
});

describe('hex shape', () => {
  it('is pointy-top: a corner straight above and below the center', () => {
    const corners = hexCorners(hexCenter(0, 0));
    const xs = corners.map((c) => Number(c.x.toFixed(6)));
    expect(xs.filter((x) => x === 0)).toHaveLength(2);
    expect(Math.min(...corners.map((c) => c.y))).toBeCloseTo(-1, 6);
    expect(Math.max(...corners.map((c) => c.y))).toBeCloseTo(1, 6);
  });

  it('has 6 corners, all at distance 1 from the center', () => {
    const center = hexCenter(1, -1);
    const corners = hexCorners(center);
    expect(corners).toHaveLength(6);
    for (const corner of corners) {
      expect(Math.hypot(corner.x - center.x, corner.y - center.y)).toBeCloseTo(1, 10);
    }
  });
});

describe('board graph', () => {
  it('has 19 hexes, 54 vertices and 72 edges', () => {
    expect(geometry.hexIds).toHaveLength(HEX_COUNT);
    expect(geometry.vertexIds).toHaveLength(VERTEX_COUNT);
    expect(geometry.edgeIds).toHaveLength(EDGE_COUNT);
  });

  it('numbers ids contiguously from zero', () => {
    expect(geometry.hexIds).toEqual(Array.from({ length: HEX_COUNT }, (_, i) => `h${i}`));
    expect(geometry.vertexIds).toEqual(Array.from({ length: VERTEX_COUNT }, (_, i) => `v${i}`));
    expect(geometry.edgeIds).toEqual(Array.from({ length: EDGE_COUNT }, (_, i) => `e${i}`));
  });

  it('gives every hex 6 distinct corners and 6 distinct sides', () => {
    for (const id of geometry.hexIds) {
      expect(new Set(hex(id).corners).size).toBe(6);
      expect(new Set(hex(id).edges).size).toBe(6);
    }
  });

  it('gives every vertex 2 or 3 neighbors', () => {
    for (const id of geometry.vertexIds) {
      expect(vertex(id).neighbors.length).toBeGreaterThanOrEqual(2);
      expect(vertex(id).neighbors.length).toBeLessThanOrEqual(3);
    }
  });

  it('gives every vertex 1 to 3 hexes, and as many edges as neighbors', () => {
    for (const id of geometry.vertexIds) {
      const v = vertex(id);
      expect(v.hexes.length).toBeGreaterThanOrEqual(1);
      expect(v.hexes.length).toBeLessThanOrEqual(3);
      expect(v.edges).toHaveLength(v.neighbors.length);
    }
  });

  it('gives every edge 2 vertices and 1 or 2 hexes', () => {
    for (const id of geometry.edgeIds) {
      const e = edge(id);
      expect(e.vertices).toHaveLength(2);
      expect(e.vertices[0]).not.toBe(e.vertices[1]);
      expect(e.hexes.length).toBeGreaterThanOrEqual(1);
      expect(e.hexes.length).toBeLessThanOrEqual(2);
    }
  });

  it('is symmetric: if A neighbors B then B neighbors A', () => {
    for (const id of geometry.vertexIds) {
      for (const neighbor of vertex(id).neighbors) {
        expect(vertex(neighbor).neighbors).toContain(id);
      }
    }
  });

  it('keeps vertex, edge and hex references consistent in both directions', () => {
    for (const id of geometry.edgeIds) {
      const e = edge(id);
      for (const v of e.vertices) expect(vertex(v).edges).toContain(id);
      for (const h of e.hexes) expect(hex(h).edges).toContain(id);
    }
    for (const id of geometry.hexIds) {
      for (const corner of hex(id).corners) expect(vertex(corner).hexes).toContain(id);
    }
  });

  it('has every neighbor pair joined by exactly one edge', () => {
    for (const id of geometry.vertexIds) {
      for (const neighbor of vertex(id).neighbors) {
        const joining = geometry.edgeIds.filter((edgeId) => {
          const [a, b] = edge(edgeId).vertices;
          return (a === id && b === neighbor) || (a === neighbor && b === id);
        });
        expect(joining).toHaveLength(1);
      }
    }
  });
});

describe('vertex deduplication', () => {
  it('keeps distinct vertices far apart, so the 1e-4 rounding is safe', () => {
    let minDistance = Number.POSITIVE_INFINITY;
    const points = geometry.vertexIds.map((id) => vertex(id));
    for (let i = 0; i < points.length; i += 1) {
      for (let j = i + 1; j < points.length; j += 1) {
        const a = points[i] as VertexGeometry;
        const b = points[j] as VertexGeometry;
        minDistance = Math.min(minDistance, Math.hypot(a.x - b.x, a.y - b.y));
      }
    }
    // The rounding step is 1e-4; anything above ~1e-3 leaves a wide margin.
    expect(minDistance).toBeGreaterThan(0.5);
  });

  it('orders vertices top to bottom, then left to right', () => {
    const points = geometry.vertexIds.map((id) => vertex(id));
    for (let i = 1; i < points.length; i += 1) {
      const previous = points[i - 1] as VertexGeometry;
      const current = points[i] as VertexGeometry;
      const sameRow = Math.abs(previous.y - current.y) < 1e-6;
      if (sameRow) expect(current.x).toBeGreaterThan(previous.x);
      else expect(current.y).toBeGreaterThan(previous.y);
    }
  });
});

describe('adjacentHexes', () => {
  it('gives the center hex 6 neighbors', () => {
    const center = geometry.hexIds.find((id) => hex(id).q === 0 && hex(id).r === 0);
    expect(adjacentHexes(geometry, center as never)).toHaveLength(6);
  });

  it('gives corner hexes 3 neighbors', () => {
    const corner = geometry.hexIds.find((id) => hex(id).q === 0 && hex(id).r === -2);
    expect(adjacentHexes(geometry, corner as never)).toHaveLength(3);
  });

  it('is symmetric', () => {
    for (const id of geometry.hexIds) {
      for (const other of adjacentHexes(geometry, id)) {
        expect(adjacentHexes(geometry, other)).toContain(id);
      }
    }
  });
});

describe('geometryBounds', () => {
  it('is centered on the origin', () => {
    const bounds = geometryBounds(geometry);
    expect(bounds.minX).toBeCloseTo(-bounds.maxX, 6);
    expect(bounds.minY).toBeCloseTo(-bounds.maxY, 6);
  });
});

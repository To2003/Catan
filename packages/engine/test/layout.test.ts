import { describe, expect, it } from 'vitest';
import { boardGeometry, type EdgeGeometry, type VertexGeometry } from '../src/board/geometry.js';
import {
  PERIMETER_EDGE_COUNT,
  PORT_EDGE_INDICES,
  perimeterEdges,
  perimeterWalk,
  portEdges,
} from '../src/board/layout.js';
import { PORT_COUNT } from '../src/constants.js';

const geometry = boardGeometry();
const edge = (id: string): EdgeGeometry => geometry.edges[id as never] as EdgeGeometry;
const vertex = (id: string): VertexGeometry => geometry.vertices[id as never] as VertexGeometry;
const midpoint = (id: string): { x: number; y: number } => {
  const [a, b] = edge(id).vertices;
  return { x: (vertex(a).x + vertex(b).x) / 2, y: (vertex(a).y + vertex(b).y) / 2 };
};

describe('perimeter', () => {
  it('has 30 coast edges, each touching a single hex', () => {
    const coast = perimeterEdges(geometry);
    expect(coast).toHaveLength(PERIMETER_EDGE_COUNT);
    for (const id of coast) expect(edge(id).hexes).toHaveLength(1);
  });

  it('walks every coast edge exactly once', () => {
    const walk = perimeterWalk(geometry);
    expect(walk).toHaveLength(PERIMETER_EDGE_COUNT);
    expect(new Set(walk).size).toBe(PERIMETER_EDGE_COUNT);
    expect([...walk].sort()).toEqual([...perimeterEdges(geometry)].sort());
  });

  it('is a closed cycle: consecutive edges share a vertex, including the wrap', () => {
    const walk = perimeterWalk(geometry);
    for (let i = 0; i < walk.length; i += 1) {
      const current = new Set(edge(walk[i] as string).vertices);
      const next = edge(walk[(i + 1) % walk.length] as string).vertices;
      expect(next.some((v) => current.has(v))).toBe(true);
    }
  });

  it('starts at the edge whose midpoint is highest, then leftmost', () => {
    const walk = perimeterWalk(geometry);
    const start = midpoint(walk[0] as string);
    for (const id of perimeterEdges(geometry)) {
      const other = midpoint(id);
      const isHigher = other.y < start.y - 1e-9;
      const isSameRowAndLefter = Math.abs(other.y - start.y) < 1e-9 && other.x < start.x - 1e-9;
      expect(isHigher || isSameRowAndLefter).toBe(false);
    }
  });

  it('starts on the upper-left edge of the top-left hex', () => {
    const walk = perimeterWalk(geometry);
    const [hexId] = edge(walk[0] as string).hexes;
    const hex = geometry.hexes[hexId as never];
    expect(hex).toMatchObject({ q: 0, r: -2 });
  });

  it('runs clockwise on screen, where y grows downward', () => {
    const points = perimeterWalk(geometry).map((id) => midpoint(id));
    let shoelace = 0;
    for (let i = 0; i < points.length; i += 1) {
      const a = points[i] as { x: number; y: number };
      const b = points[(i + 1) % points.length] as { x: number; y: number };
      shoelace += a.x * b.y - b.x * a.y;
    }
    expect(shoelace).toBeGreaterThan(0);
  });
});

describe('port placement', () => {
  it('places 9 harbours', () => {
    expect(portEdges(geometry)).toHaveLength(PORT_COUNT);
    expect(new Set(portEdges(geometry)).size).toBe(PORT_COUNT);
  });

  it('puts every harbour on a coast edge', () => {
    const coast = new Set(perimeterEdges(geometry));
    for (const id of portEdges(geometry)) expect(coast.has(id)).toBe(true);
  });

  it('never lets two harbours share a vertex', () => {
    const seen = new Set<string>();
    for (const id of portEdges(geometry)) {
      for (const v of edge(id).vertices) {
        expect(seen.has(v)).toBe(false);
        seen.add(v);
      }
    }
    expect(seen.size).toBe(PORT_COUNT * 2);
  });

  it('covers 18 vertices', () => {
    const vertices = portEdges(geometry).flatMap((id) => [...edge(id).vertices]);
    expect(new Set(vertices).size).toBe(18);
  });

  it('spaces harbours by 3, 3, 4 around the coast', () => {
    const gaps = PORT_EDGE_INDICES.map(
      (value, i) =>
        ((PORT_EDGE_INDICES[(i + 1) % PORT_EDGE_INDICES.length] as number) -
          value +
          PERIMETER_EDGE_COUNT) %
        PERIMETER_EDGE_COUNT,
    );
    expect(gaps).toEqual([3, 3, 4, 3, 3, 4, 3, 3, 4]);
    expect(gaps.reduce((a, b) => a + b, 0)).toBe(PERIMETER_EDGE_COUNT);
  });

  it('keeps every harbour at least 2 edges from the next, whatever the offset', () => {
    expect(
      Math.min(
        ...PORT_EDGE_INDICES.map((v, i) =>
          i === 0 ? 30 : v - (PORT_EDGE_INDICES[i - 1] as number),
        ),
      ),
    ).toBeGreaterThanOrEqual(2);
  });
});

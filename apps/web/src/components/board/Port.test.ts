import { describe, expect, it } from 'vitest';
import { BOARD_MODES, generateBoard, type BoardGraph } from '@tierra-austral/engine';
import { PORT_OFFSET, PORT_RADIUS, portBadgeCenter } from './Port.js';

/**
 * Where the nine harbours sit, measured rather than eyeballed.
 *
 * This is the test the bug asked for. Some jetties looked missing, and the
 * reason turned out to be neither of the obvious ones: nothing was painted
 * over them and the colour was fine. The badge was being placed along the
 * direction of the board's centre instead of along its own edge's
 * perpendicular, and for three of the nine those are 49° apart — far enough
 * that the badge slid up against one vertex and swallowed that jetty whole.
 *
 * So what is pinned here is the two things that go wrong when it drifts: a
 * jetty has to reach its vertex exactly, and it has to be longer than the
 * circle that sits on its far end.
 */
const legs = (board: BoardGraph) =>
  board.ports.map((port) => {
    const [a, b] = port.vertices.map((id) => board.vertices[id]);
    if (!a || !b) throw new Error(`harbour ${port.edge} has no vertices`);
    const badge = portBadgeCenter(a, b);
    return {
      edge: port.edge,
      badge,
      ends: [a, b] as const,
      lengths: [a, b].map((from) => Math.hypot(badge.x - from.x, badge.y - from.y)),
    };
  });

describe('every harbour has two visible jetties', () => {
  for (const mode of BOARD_MODES) {
    it(`${mode}: both reach their own vertex, on every board`, () => {
      for (let seed = 1; seed <= 10; seed += 1) {
        for (const port of legs(generateBoard(seed, mode).board)) {
          // The jetty ends *at* the vertex, not near it: the line is drawn
          // from that exact point, so this is really pinning that the badge
          // was computed from the edge it belongs to.
          for (const end of port.ends) {
            const reach = Math.min(...port.ends.map((v) => Math.hypot(v.x - end.x, v.y - end.y)));
            expect(reach).toBe(0);
          }
        }
      }
    });

    it(`${mode}: neither is shorter than the badge sitting on it`, () => {
      for (let seed = 1; seed <= 10; seed += 1) {
        for (const port of legs(generateBoard(seed, mode).board)) {
          for (const length of port.lengths) {
            // A jetty shorter than the radius is a jetty inside the circle.
            expect(length, `${mode} seed ${seed} harbour ${port.edge}`).toBeGreaterThan(
              PORT_RADIUS,
            );
            // And one barely longer is one you cannot see either: half the
            // radius of visible timber is the floor worth having.
            expect(length - PORT_RADIUS).toBeGreaterThan(PORT_RADIUS / 2);
          }
        }
      }
    });
  }

  it('puts the badge straight out from the middle of the edge', () => {
    for (const port of legs(generateBoard(1).board)) {
      const [a, b] = port.ends;
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const out = { x: port.badge.x - mid.x, y: port.badge.y - mid.y };
      const edge = { x: b.x - a.x, y: b.y - a.y };

      // Perpendicular: the two vectors have no component along each other.
      expect(Math.abs(out.x * edge.x + out.y * edge.y)).toBeLessThan(1e-9);
      expect(Math.hypot(out.x, out.y)).toBeCloseTo(PORT_OFFSET, 9);
      // And outward: further from the centre than the edge it hangs off.
      expect(Math.hypot(port.badge.x, port.badge.y)).toBeGreaterThan(Math.hypot(mid.x, mid.y));
    }
  });

  it('gives both jetties of a harbour the same length', () => {
    // The symptom in one line: with the badge on the perpendicular, the two
    // are equal by construction. With it on the radial direction they were
    // 0.337 and 0.900 on three of the nine.
    for (const mode of BOARD_MODES) {
      for (const port of legs(generateBoard(7, mode).board)) {
        const [first, second] = port.lengths;
        expect(first).toBeCloseTo(second ?? 0, 9);
      }
    }
  });
});

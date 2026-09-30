import type { BoardGraph, Point, Port as PortModel } from '@tierra-austral/engine';
import { RESOURCE_ICONS, RESOURCE_LABELS } from '../../lib/terrainStyles.js';

interface PortProps {
  readonly port: PortModel;
  readonly board: BoardGraph;
}

/** Harbour colours, from the palette in DESIGN.md rather than the old flat set. */
const RESOURCE_COLORS = {
  wood: '#2b5138',
  brick: '#9c4b2c',
  sheep: '#6d9250',
  wheat: '#cfa43a',
  ore: '#6c7c8b',
} as const;

/** Every generic harbour is the same thing, so they all get the same glacier blue. */
const GENERIC_COLOR = '#6fa8b6';

/** Weathered pier timber, with a dark edge so it reads against the water. */
const JETTY = '#a5825a';
const JETTY_EDGE = '#1b2730';

/** How far off the coast the badge floats, and how big it is. */
export const PORT_OFFSET = 0.46;
export const PORT_RADIUS = 0.33;

/**
 * Where a harbour's badge sits: straight out from the middle of its edge.
 *
 * **Out along the edge's own perpendicular, not along the direction of the
 * board's centre.** Those two are the same thing for only three of the nine
 * harbours; for three others they are 49° apart, which slid the badge up
 * against one of the two vertices. Measured across thirty boards, the short
 * leg came out 0.337 units long against a circle of radius 0.33 — seven
 * thousandths of a unit sticking out, which is why that jetty looked missing.
 * It was not covered by anything and it was not the wrong colour: it was
 * inside its own badge.
 *
 * Exported because the geometry test measures the same thing the screen draws.
 */
export const portBadgeCenter = (a: Point, b: Point): Point => {
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const edge = { x: b.x - a.x, y: b.y - a.y };
  // Either normal of the edge; the outward one is the one pointing away from
  // the board's centre, which is the origin.
  const normal = { x: -edge.y, y: edge.x };
  const length = Math.hypot(normal.x, normal.y) || 1;
  const sign = normal.x * mid.x + normal.y * mid.y >= 0 ? 1 : -1;
  return {
    x: mid.x + (normal.x / length) * sign * PORT_OFFSET,
    y: mid.y + (normal.y / length) * sign * PORT_OFFSET,
  };
};

/**
 * A harbour: two jetties from the coast out to a badge just off the board.
 *
 * A 2:1 wears the colour of what it trades and shows the resource itself; the
 * 3:1s are glacier blue and ring-shaped. Each jetty is drawn twice — a dark
 * line under a lighter one — which is cheaper than a stroke-and-fill and
 * gives the timber an edge against both the water and the coastline.
 */
export function Port({ port, board }: PortProps) {
  const [a, b] = port.vertices.map((id) => board.vertices[id]);
  if (!a || !b) return null;

  const badge = portBadgeCenter(a, b);
  const isGeneric = port.type === '3:1';
  const color = isGeneric ? GENERIC_COLOR : RESOURCE_COLORS[port.type];

  const jetty = (from: { x: number; y: number }, key: string) => (
    <g key={key}>
      <line
        x1={from.x}
        y1={from.y}
        x2={badge.x}
        y2={badge.y}
        stroke={JETTY_EDGE}
        strokeWidth={0.115}
        strokeLinecap="round"
      />
      <line
        x1={from.x}
        y1={from.y}
        x2={badge.x}
        y2={badge.y}
        stroke={JETTY}
        strokeWidth={0.065}
        strokeLinecap="round"
      />
    </g>
  );

  return (
    <g pointerEvents="none">
      {jetty(a, 'a')}
      {jetty(b, 'b')}

      <circle
        cx={badge.x}
        cy={badge.y}
        r={PORT_RADIUS}
        fill={isGeneric ? '#14202a' : color}
        stroke={color}
        strokeWidth={isGeneric ? 0.09 : 0.04}
      />

      {isGeneric ? (
        <text
          x={badge.x}
          y={badge.y}
          textAnchor="middle"
          dominantBaseline="middle"
          fontFamily="Chivo, sans-serif"
          fontSize={0.27}
          fontWeight={900}
          fill={GENERIC_COLOR}
        >
          3:1
        </text>
      ) : (
        <>
          <text
            x={badge.x}
            y={badge.y - 0.09}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize={0.24}
          >
            {RESOURCE_ICONS[port.type]}
          </text>
          <text
            x={badge.x}
            y={badge.y + 0.15}
            textAnchor="middle"
            dominantBaseline="middle"
            fontFamily="Chivo, sans-serif"
            fontSize={0.2}
            fontWeight={900}
            fill="#f2e9d5"
          >
            2:1
          </text>
        </>
      )}

      <title>{isGeneric ? 'Puerto 3:1' : `Puerto 2:1 de ${RESOURCE_LABELS[port.type]}`}</title>
    </g>
  );
}

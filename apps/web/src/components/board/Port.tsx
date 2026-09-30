import type { BoardGraph, Port as PortModel } from '@tierra-austral/engine';
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

/**
 * A harbour: two jetties from the coast out to a badge just off the board.
 *
 * A 2:1 wears the colour of what it trades and shows the resource itself; the
 * 3:1s are glacier blue and ring-shaped. The old version painted the ore 2:1
 * and the generic ones nearly the same grey, which made the one harbour that
 * changes your plans hard to find.
 */
export function Port({ port, board }: PortProps) {
  const [a, b] = port.vertices.map((id) => board.vertices[id]);
  if (!a || !b) return null;

  const midX = (a.x + b.x) / 2;
  const midY = (a.y + b.y) / 2;
  // The board is centred on the origin, so the outward direction is the
  // midpoint's own direction from the centre. Kept close to the coast: every
  // unit out there is a unit the board cannot use.
  const length = Math.hypot(midX, midY) || 1;
  const badgeX = midX + (midX / length) * 0.46;
  const badgeY = midY + (midY / length) * 0.46;

  const isGeneric = port.type === '3:1';
  const color = isGeneric ? GENERIC_COLOR : RESOURCE_COLORS[port.type];

  return (
    <g pointerEvents="none">
      <line x1={a.x} y1={a.y} x2={badgeX} y2={badgeY} stroke="#8a6b4a" strokeWidth={0.05} />
      <line x1={b.x} y1={b.y} x2={badgeX} y2={badgeY} stroke="#8a6b4a" strokeWidth={0.05} />

      <circle
        cx={badgeX}
        cy={badgeY}
        r={0.33}
        fill={isGeneric ? '#14202a' : color}
        stroke={color}
        strokeWidth={isGeneric ? 0.09 : 0.04}
      />

      {isGeneric ? (
        <text
          x={badgeX}
          y={badgeY}
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
            x={badgeX}
            y={badgeY - 0.09}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize={0.24}
          >
            {RESOURCE_ICONS[port.type]}
          </text>
          <text
            x={badgeX}
            y={badgeY + 0.15}
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

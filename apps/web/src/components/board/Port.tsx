import type { BoardGraph, Port as PortModel } from '@tierra-austral/engine';
import { RESOURCE_LABELS, RESOURCE_TAGS } from '../../lib/terrainStyles.js';

interface PortProps {
  readonly port: PortModel;
  readonly board: BoardGraph;
}

const RESOURCE_COLORS = {
  wood: '#2f5d3a',
  brick: '#a85432',
  sheep: '#7cab52',
  wheat: '#e0b23f',
  ore: '#7b8794',
} as const;

/**
 * A harbour: two jetties running from the coast edge's vertices out to a badge
 * placed just outside the board, so it never covers the terrain.
 */
export function Port({ port, board }: PortProps) {
  const [a, b] = port.vertices.map((id) => board.vertices[id]);
  if (!a || !b) return null;

  const midX = (a.x + b.x) / 2;
  const midY = (a.y + b.y) / 2;
  // The board is centred on the origin, so the outward direction is the
  // midpoint's own direction from the centre.
  const length = Math.hypot(midX, midY) || 1;
  const badgeX = midX + (midX / length) * 0.58;
  const badgeY = midY + (midY / length) * 0.58;

  const isGeneric = port.type === '3:1';
  const color = isGeneric ? '#5b6b7c' : RESOURCE_COLORS[port.type];

  return (
    <g pointerEvents="none">
      <line x1={a.x} y1={a.y} x2={badgeX} y2={badgeY} stroke="#8a6b4a" strokeWidth={0.05} />
      <line x1={b.x} y1={b.y} x2={badgeX} y2={badgeY} stroke="#8a6b4a" strokeWidth={0.05} />
      <circle cx={badgeX} cy={badgeY} r={0.34} fill={color} stroke="#f4ecd8" strokeWidth={0.04} />
      <text
        x={badgeX}
        y={isGeneric ? badgeY : badgeY - 0.07}
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize={isGeneric ? 0.26 : 0.22}
        fontWeight={700}
        fill="#f4ecd8"
      >
        {isGeneric ? '3:1' : '2:1'}
      </text>
      {isGeneric ? null : (
        <text
          x={badgeX}
          y={badgeY + 0.15}
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize={0.17}
          fontWeight={700}
          fill="#f4ecd8"
        >
          {RESOURCE_TAGS[port.type]}
        </text>
      )}
      <title>{isGeneric ? 'Puerto 3:1' : `Puerto 2:1 de ${RESOURCE_LABELS[port.type]}`}</title>
    </g>
  );
}

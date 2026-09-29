import type { BoardGraph, EdgeId, PlayerId, VertexId } from '@tierra-austral/engine';
import { shadeOf } from '../../lib/playerColors.js';

interface PiecesProps {
  readonly board: BoardGraph;
  readonly buildings: Readonly<Record<VertexId, { owner: PlayerId; type: 'settlement' | 'city' }>>;
  readonly roads: Readonly<Record<EdgeId, PlayerId>>;
  readonly colorOf: (playerId: PlayerId) => string;
  /** Thicker outlines, for when the board is dimmed and the pieces are the point. */
  readonly emphasis?: boolean;
}

/** Settlements, cities and roads on the board, drawn in unit space. */
export function Pieces({ board, buildings, roads, colorOf, emphasis = false }: PiecesProps) {
  const outline = emphasis ? 0.05 : 0.03;
  return (
    <g pointerEvents="none">
      {board.edgeIds.map((id) => {
        const owner = roads[id];
        if (owner === undefined) return null;
        const edge = board.edges[id];
        const a = edge && board.vertices[edge.vertices[0]];
        const b = edge && board.vertices[edge.vertices[1]];
        if (!a || !b) return null;
        return (
          // A road is a bar with a darker underside: the bevel is what keeps it
          // from disappearing into a textured hex.
          <g key={id}>
            <line
              x1={a.x}
              y1={a.y + 0.03}
              x2={b.x}
              y2={b.y + 0.03}
              stroke={shadeOf(colorOf(owner))}
              strokeWidth={emphasis ? 0.15 : 0.12}
              strokeLinecap="round"
            />
            <line
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              stroke={colorOf(owner)}
              strokeWidth={emphasis ? 0.13 : 0.1}
              strokeLinecap="round"
            />
          </g>
        );
      })}

      {board.vertexIds.map((id) => {
        const building = buildings[id];
        if (!building) return null;
        const vertex = board.vertices[id];
        if (!vertex) return null;
        const fill = colorOf(building.owner);

        const shade = shadeOf(fill);
        const edge = emphasis ? '#f2e9d5' : '#11181f';
        const { x, y } = vertex;

        // A house: gable roof, a darker wall on one side. Two tones are enough
        // to read as a solid object at this size — no gradients needed.
        if (building.type !== 'city') {
          return (
            <g key={id}>
              <ellipse cx={x} cy={y + 0.14} rx={0.14} ry={0.04} fill="#0b1117" opacity={0.35} />
              <path
                d={`M${x - 0.13} ${y + 0.12} V${y - 0.02} L${x} ${y - 0.16} L${x + 0.13} ${y - 0.02} V${y + 0.12} Z`}
                fill={fill}
                stroke={edge}
                strokeWidth={outline}
                strokeLinejoin="round"
              />
              <path
                d={`M${x} ${y - 0.16} L${x + 0.13} ${y - 0.02} V${y + 0.12} H${x} Z`}
                fill={shade}
                opacity={0.85}
              />
            </g>
          );
        }

        // A city: the same house with a taller second body beside it.
        return (
          <g key={id}>
            <ellipse cx={x} cy={y + 0.17} rx={0.2} ry={0.05} fill="#0b1117" opacity={0.35} />
            <path
              d={`M${x - 0.19} ${y + 0.15} V${y - 0.02} L${x - 0.08} ${y - 0.14} L${x + 0.03} ${y - 0.02} V${y + 0.15} Z`}
              fill={fill}
              stroke={edge}
              strokeWidth={outline}
              strokeLinejoin="round"
            />
            <rect
              x={x + 0.02}
              y={y - 0.12}
              width={0.17}
              height={0.27}
              fill={shade}
              stroke={edge}
              strokeWidth={outline}
            />
            <rect
              x={x + 0.06}
              y={y - 0.06}
              width={0.05}
              height={0.06}
              fill="#f2e9d5"
              opacity={0.6}
            />
          </g>
        );
      })}
    </g>
  );
}

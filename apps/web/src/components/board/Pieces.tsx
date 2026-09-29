import type { BoardGraph, EdgeId, PlayerId, VertexId } from '@tierra-austral/engine';

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
          <line
            key={id}
            x1={a.x}
            y1={a.y}
            x2={b.x}
            y2={b.y}
            stroke={colorOf(owner)}
            strokeWidth={emphasis ? 0.14 : 0.11}
            strokeLinecap="round"
          />
        );
      })}

      {board.vertexIds.map((id) => {
        const building = buildings[id];
        if (!building) return null;
        const vertex = board.vertices[id];
        if (!vertex) return null;
        const fill = colorOf(building.owner);

        if (building.type === 'city') {
          const size = 0.15;
          return (
            <rect
              key={id}
              x={vertex.x - size}
              y={vertex.y - size}
              width={size * 2}
              height={size * 2}
              rx={0.03}
              fill={fill}
              stroke={emphasis ? '#ffffff' : '#12100e'}
              strokeWidth={outline}
            />
          );
        }

        return (
          <circle
            key={id}
            cx={vertex.x}
            cy={vertex.y}
            r={0.12}
            fill={fill}
            stroke={emphasis ? '#ffffff' : '#12100e'}
            strokeWidth={outline}
          />
        );
      })}
    </g>
  );
}

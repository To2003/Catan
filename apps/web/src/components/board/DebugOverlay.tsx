import type { BoardGraph } from '@tierra-austral/engine';

interface DebugOverlayProps {
  readonly board: BoardGraph;
}

/**
 * Ids of every hex, vertex and edge, drawn on top of the board. Turned on with
 * the D key. This is a development aid for M2, when vertices and edges become
 * clickable and "which edge is that?" stops being obvious.
 */
export function DebugOverlay({ board }: DebugOverlayProps) {
  return (
    <g pointerEvents="none">
      {board.edgeIds.map((id) => {
        const edge = board.edges[id];
        const a = edge && board.vertices[edge.vertices[0]];
        const b = edge && board.vertices[edge.vertices[1]];
        if (!a || !b) return null;
        return (
          <text
            key={id}
            x={(a.x + b.x) / 2}
            y={(a.y + b.y) / 2}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize={0.11}
            fill="#ffd400"
            stroke="#000000"
            strokeWidth={0.02}
            paintOrder="stroke"
          >
            {id}
          </text>
        );
      })}

      {board.vertexIds.map((id) => {
        const vertex = board.vertices[id];
        if (!vertex) return null;
        return (
          <g key={id}>
            <circle cx={vertex.x} cy={vertex.y} r={0.06} fill="#00e5ff" opacity={0.85} />
            <text
              x={vertex.x}
              y={vertex.y - 0.13}
              textAnchor="middle"
              fontSize={0.12}
              fill="#00e5ff"
              stroke="#000000"
              strokeWidth={0.02}
              paintOrder="stroke"
            >
              {id}
            </text>
          </g>
        );
      })}

      {board.hexIds.map((id) => {
        const hex = board.hexes[id];
        if (!hex) return null;
        return (
          <text
            key={id}
            x={hex.center.x}
            y={hex.center.y + 0.62}
            textAnchor="middle"
            fontSize={0.16}
            fill="#ffffff"
            stroke="#000000"
            strokeWidth={0.03}
            paintOrder="stroke"
          >
            {id}
          </text>
        );
      })}
    </g>
  );
}

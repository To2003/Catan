import type { BoardGraph, EdgeId, HexId, VertexId } from '@tierra-austral/engine';

interface TargetsProps {
  readonly board: BoardGraph;
  readonly vertices: readonly VertexId[];
  readonly edges: readonly EdgeId[];
  readonly hexes: readonly HexId[];
  readonly onVertex: (vertex: VertexId) => void;
  readonly onEdge: (edge: EdgeId) => void;
  readonly onHex: (hex: HexId) => void;
}

/**
 * The legal spots, highlighted and clickable. Which spots those are is the
 * engine's answer (`legal.ts`): this only draws them.
 */
export function Targets({ board, vertices, edges, hexes, onVertex, onEdge, onHex }: TargetsProps) {
  return (
    <g>
      {hexes.map((id) => {
        const hex = board.hexes[id];
        if (!hex) return null;
        const points = hex.corners
          .map((corner) => board.vertices[corner])
          .filter((corner) => corner !== undefined)
          .map((corner) => `${corner.x},${corner.y}`)
          .join(' ');
        return (
          <polygon
            key={id}
            points={points}
            fill="#12100e"
            fillOpacity={0.45}
            stroke="#ffffff"
            strokeWidth={0.05}
            strokeDasharray="0.15 0.1"
            className="cursor-pointer hover:fill-black"
            onClick={() => {
              onHex(id);
            }}
          >
            <title>{id}</title>
          </polygon>
        );
      })}

      {edges.map((id) => {
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
            stroke="#ffffff"
            strokeOpacity={0.55}
            strokeWidth={0.1}
            strokeLinecap="round"
            strokeDasharray="0.12 0.1"
            className="cursor-pointer hover:stroke-white"
            onClick={() => {
              onEdge(id);
            }}
          >
            <title>{id}</title>
          </line>
        );
      })}

      {vertices.map((id) => {
        const vertex = board.vertices[id];
        if (!vertex) return null;
        return (
          <circle
            key={id}
            cx={vertex.x}
            cy={vertex.y}
            r={0.13}
            fill="#ffffff"
            fillOpacity={0.5}
            stroke="#ffffff"
            strokeWidth={0.03}
            className="cursor-pointer hover:fill-white"
            onClick={() => {
              onVertex(id);
            }}
          >
            <title>{id}</title>
          </circle>
        );
      })}
    </g>
  );
}

import type { BoardGraph, EdgeId, HexId, VertexId } from '@tierra-austral/engine';

interface SpotTargetsProps {
  readonly board: BoardGraph;
  readonly vertices: readonly VertexId[];
  readonly edges: readonly EdgeId[];
  readonly onVertex: (vertex: VertexId) => void;
  readonly onEdge: (edge: EdgeId) => void;
}

/** Legal vertices and edges, highlighted and clickable. */
export function SpotTargets({ board, vertices, edges, onVertex, onEdge }: SpotTargetsProps) {
  return (
    <g>
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

interface HexTargetsProps {
  readonly board: BoardGraph;
  readonly hexes: readonly HexId[];
  /** Where the robber stands: the one hex that is not a choice. */
  readonly blocked: HexId | undefined;
  readonly hovered: HexId | undefined;
  readonly onHex: (hex: HexId) => void;
  readonly onHover: (hex: HexId | undefined) => void;
}

/**
 * Picking a hex for the robber.
 *
 * **This layer goes under the pieces, not over them.** Moving the robber is a
 * decision about who you are hurting, so the settlements and roads have to
 * stay readable: the tint sits on the terrain and everything built on it keeps
 * its full colour.
 */
export function HexTargets({ board, hexes, blocked, hovered, onHex, onHover }: HexTargetsProps) {
  const cornersOf = (id: HexId): string =>
    (board.hexes[id]?.corners ?? [])
      .map((corner) => board.vertices[corner])
      .filter((corner) => corner !== undefined)
      .map((corner) => `${corner.x},${corner.y}`)
      .join(' ');

  return (
    <g>
      {hexes.map((id) => (
        <polygon
          key={id}
          points={cornersOf(id)}
          fill="#0b0a09"
          fillOpacity={hovered === id ? 0.08 : 0.28}
          stroke="#ffffff"
          strokeOpacity={hovered === id ? 0.9 : 0.35}
          strokeWidth={hovered === id ? 0.07 : 0.04}
          strokeDasharray="0.15 0.1"
          className="cursor-pointer"
          onClick={() => {
            onHex(id);
          }}
          onMouseEnter={() => {
            onHover(id);
          }}
          onMouseLeave={() => {
            onHover(undefined);
          }}
        >
          <title>{id}</title>
        </polygon>
      ))}

      {blocked ? (
        <polygon
          points={cornersOf(blocked)}
          fill="none"
          stroke="#8c2f39"
          strokeWidth={0.08}
          strokeDasharray="0.06 0.12"
          pointerEvents="none"
        >
          <title>El ladrón ya está acá</title>
        </polygon>
      ) : null}
    </g>
  );
}

interface MarkersProps {
  readonly board: BoardGraph;
  /** Buildings to call out — whoever the robber would hit, or a steal target. */
  readonly vertices: readonly VertexId[];
  /** Roads to call out: the route behind somebody's longest-road number. */
  readonly edges: readonly EdgeId[];
}

/** Rings and traces drawn over the board to answer "which ones?". */
export function Markers({ board, vertices, edges }: MarkersProps) {
  return (
    <g pointerEvents="none">
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
            strokeWidth={0.19}
            strokeOpacity={0.9}
            strokeLinecap="round"
          />
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
            r={0.22}
            fill="none"
            stroke="#ffffff"
            strokeWidth={0.05}
            strokeDasharray="0.09 0.07"
          />
        );
      })}
    </g>
  );
}

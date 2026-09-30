import {
  geometryBounds,
  type BoardGraph,
  type EdgeId,
  type HexId,
  type PlayerId,
  type VertexId,
} from '@tierra-austral/engine';
import { DebugOverlay } from './DebugOverlay.js';
import { Pieces } from './Pieces.js';
import { HexTargets, Markers, SpotTargets } from './Targets.js';
import { Hex } from './Hex.js';
import { NumberToken } from './NumberToken.js';
import { Port } from './Port.js';
import { Robber } from './Robber.js';
import { TerrainPatterns } from './TerrainPatterns.js';
import { useElementSize } from '../../lib/useElementSize.js';

/** Everything the hot-seat adds on top of a plain board: pieces and legal spots. */
export interface BoardInteraction {
  readonly buildings: Readonly<Record<VertexId, { owner: PlayerId; type: 'settlement' | 'city' }>>;
  readonly roads: Readonly<Record<EdgeId, PlayerId>>;
  readonly colorOf: (playerId: PlayerId) => string;
  readonly legalVertices: readonly VertexId[];
  readonly legalEdges: readonly EdgeId[];
  readonly legalHexes: readonly HexId[];
  readonly onVertex: (vertex: VertexId) => void;
  readonly onEdge: (edge: EdgeId) => void;
  readonly onHex: (hex: HexId) => void;
  /** Which hex the pointer is over, while choosing where the robber goes. */
  readonly hoveredHex?: HexId | undefined;
  readonly onHexHover?: (hex: HexId | undefined) => void;
  /** Buildings to ring: who the robber would hit, or whose pieces to point at. */
  readonly markedVertices?: readonly VertexId[];
  /** Roads to trace: somebody's longest route, drawn so the number makes sense. */
  readonly markedEdges?: readonly EdgeId[];
  /** Hexes whose numbers just paid out, for the roll's halo. */
  readonly pulsingHexes?: readonly HexId[];
}

interface BoardProps {
  readonly board: BoardGraph;
  readonly robberHex: HexId;
  readonly debug: boolean;
  /** Absent on the plain M1 board screen, which is not interactive. */
  readonly interaction?: BoardInteraction;
}

/**
 * Margin around the board in unit space: enough for the harbour badges and
 * nothing more. Every extra unit here is board the screen does not get.
 */
const PADDING = 0.85;

/**
 * The board, drawn in unit space.
 *
 * The viewBox is stretched to the container's own proportions rather than
 * letting the SVG letterbox itself: the board then sits centred and as large
 * as the shorter side allows, with the leftover going into margin instead of
 * into a smaller board.
 */
export function Board({ board, robberHex, debug, interaction }: BoardProps) {
  const { ref, size } = useElementSize<HTMLDivElement>();

  const bounds = geometryBounds(board);
  const boardWidth = bounds.maxX - bounds.minX + PADDING * 2;
  const boardHeight = bounds.maxY - bounds.minY + PADDING * 2;

  // Widen or heighten the window onto the board so its shape matches the box
  // it is being drawn into.
  const boxRatio = size.width > 0 && size.height > 0 ? size.width / size.height : 1;
  const boardRatio = boardWidth / boardHeight;
  const width = boxRatio > boardRatio ? boardHeight * boxRatio : boardWidth;
  const height = boxRatio > boardRatio ? boardHeight : boardWidth / boxRatio;
  const minX = bounds.minX - PADDING - (width - boardWidth) / 2;
  const minY = bounds.minY - PADDING - (height - boardHeight) / 2;

  const robber = board.hexes[robberHex];

  return (
    <div ref={ref} className="h-full w-full">
      <svg
        viewBox={`${minX} ${minY} ${width} ${height}`}
        className="h-full w-full"
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label="Tablero"
      >
        <TerrainPatterns />
        <g>
          {board.ports.map((port) => (
            <Port key={port.edge} port={port} board={board} />
          ))}
        </g>
        <g>
          {board.hexIds.map((id) => {
            const hex = board.hexes[id];
            if (!hex) return null;
            return (
              <Hex
                key={id}
                hex={hex}
                board={board}
                pulsing={interaction?.pulsingHexes?.includes(id) ?? false}
              />
            );
          })}
        </g>
        <g>
          {board.hexIds.map((id) => {
            const hex = board.hexes[id];
            if (!hex || hex.number === undefined) return null;
            return <NumberToken key={id} center={hex.center} value={hex.number} />;
          })}
        </g>
        {/* Choosing a hex happens *under* the pieces: the tint dims terrain, and
          what people built on it stays at full strength. */}
        {interaction && interaction.legalHexes.length > 0 ? (
          <HexTargets
            board={board}
            hexes={interaction.legalHexes}
            blocked={robberHex}
            hovered={interaction.hoveredHex}
            onHex={interaction.onHex}
            onHover={interaction.onHexHover ?? (() => undefined)}
          />
        ) : null}

        {interaction ? (
          <Pieces
            board={board}
            buildings={interaction.buildings}
            roads={interaction.roads}
            colorOf={interaction.colorOf}
            emphasis={interaction.legalHexes.length > 0}
          />
        ) : null}

        {interaction ? (
          <Markers
            board={board}
            vertices={interaction.markedVertices ?? []}
            edges={interaction.markedEdges ?? []}
          />
        ) : null}

        {robber ? <Robber center={robber.center} /> : null}

        {interaction ? (
          <SpotTargets
            board={board}
            vertices={interaction.legalVertices}
            edges={interaction.legalEdges}
            onVertex={interaction.onVertex}
            onEdge={interaction.onEdge}
          />
        ) : null}
        {debug ? <DebugOverlay board={board} /> : null}
      </svg>
    </div>
  );
}

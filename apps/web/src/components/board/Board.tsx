import { geometryBounds, type BoardGraph, type HexId } from '@tierra-austral/engine';
import { DebugOverlay } from './DebugOverlay.js';
import { Hex } from './Hex.js';
import { NumberToken } from './NumberToken.js';
import { Port } from './Port.js';
import { Robber } from './Robber.js';

interface BoardProps {
  readonly board: BoardGraph;
  readonly robberHex: HexId;
  readonly debug: boolean;
}

/** Margin around the board in unit space, leaving room for the harbour badges. */
const PADDING = 1.2;

/** The board, drawn in unit space. The viewBox does all the scaling. */
export function Board({ board, robberHex, debug }: BoardProps) {
  const bounds = geometryBounds(board);
  const minX = bounds.minX - PADDING;
  const minY = bounds.minY - PADDING;
  const width = bounds.maxX - bounds.minX + PADDING * 2;
  const height = bounds.maxY - bounds.minY + PADDING * 2;

  const robber = board.hexes[robberHex];

  return (
    <svg
      viewBox={`${minX} ${minY} ${width} ${height}`}
      className="h-full w-full"
      role="img"
      aria-label="Tablero"
    >
      <g>
        {board.ports.map((port) => (
          <Port key={port.edge} port={port} board={board} />
        ))}
      </g>
      <g>
        {board.hexIds.map((id) => {
          const hex = board.hexes[id];
          return hex ? <Hex key={id} hex={hex} board={board} /> : null;
        })}
      </g>
      <g>
        {board.hexIds.map((id) => {
          const hex = board.hexes[id];
          if (!hex || hex.number === undefined) return null;
          return <NumberToken key={id} center={hex.center} value={hex.number} />;
        })}
      </g>
      {robber ? <Robber center={robber.center} /> : null}
      {debug ? <DebugOverlay board={board} /> : null}
    </svg>
  );
}

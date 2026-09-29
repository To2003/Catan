import type { BoardGraph, Hex as HexModel } from '@tierra-austral/engine';
import { TERRAIN_STYLES } from '../../lib/terrainStyles.js';
import { TERRAIN_PATTERN_ID } from './TerrainPatterns.js';

interface HexProps {
  readonly hex: HexModel;
  readonly board: BoardGraph;
  /** Just paid out: worth a halo for a moment. */
  readonly pulsing?: boolean;
}

/**
 * One terrain tile, drawn from its 6 corner vertices.
 *
 * The `data-hex` attribute is how the flying-card animation finds where a
 * resource came from, without the board having to know anything about it.
 */
export function Hex({ hex, board, pulsing = false }: HexProps) {
  const style = TERRAIN_STYLES[hex.terrain];
  const corners = hex.corners.flatMap((id) => {
    const vertex = board.vertices[id];
    return vertex ? [`${vertex.x},${vertex.y}`] : [];
  });
  if (corners.length !== hex.corners.length) return null;

  return (
    <g data-hex={hex.id}>
      <polygon
        points={corners.join(' ')}
        fill={style.fill}
        stroke={style.stroke}
        strokeWidth={0.03}
      />
      {/* The material on top of the colour: see TerrainPatterns. */}
      <polygon
        points={corners.join(' ')}
        fill={`url(#${TERRAIN_PATTERN_ID[hex.terrain]})`}
        pointerEvents="none"
      />
      {pulsing ? (
        <polygon
          className="hex-pulse"
          points={corners.join(' ')}
          fill="none"
          stroke="#fdf6e3"
          strokeWidth={0.12}
          pointerEvents="none"
        />
      ) : null}
    </g>
  );
}

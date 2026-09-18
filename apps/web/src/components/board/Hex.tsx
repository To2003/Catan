import type { BoardGraph, Hex as HexModel } from '@tierra-austral/engine';
import { TERRAIN_STYLES } from '../../lib/terrainStyles.js';

interface HexProps {
  readonly hex: HexModel;
  readonly board: BoardGraph;
}

/** One terrain tile, drawn from its 6 corner vertices. */
export function Hex({ hex, board }: HexProps) {
  const style = TERRAIN_STYLES[hex.terrain];
  const corners = hex.corners.flatMap((id) => {
    const vertex = board.vertices[id];
    return vertex ? [`${vertex.x},${vertex.y}`] : [];
  });
  if (corners.length !== hex.corners.length) return null;

  return (
    <polygon
      points={corners.join(' ')}
      fill={style.fill}
      stroke={style.stroke}
      strokeWidth={0.03}
    />
  );
}

import type { Point } from '@tierra-austral/engine';

interface RobberProps {
  readonly center: Point;
}

/**
 * How far up and to the left the robber stands from the middle of its hex.
 *
 * It used to sit dead centre, which is where the number token is: the one
 * hex whose number you most want to read — the blocked one — was the one you
 * could not. Standing it off to the side keeps both readable and still reads
 * as "on this hex".
 */
const OFFSET = { x: -0.42, y: -0.16 };

/** The robber: a dark pawn standing beside the number of its hex. */
export function Robber({ center }: RobberProps) {
  return (
    <g pointerEvents="none" transform={`translate(${center.x + OFFSET.x}, ${center.y + OFFSET.y})`}>
      <ellipse cx={0} cy={0.3} rx={0.22} ry={0.07} fill="#00000055" />
      <path
        d="M -0.16 0.3 L -0.1 -0.05 A 0.13 0.13 0 0 1 0.1 -0.05 L 0.16 0.3 Z"
        fill="#2b2b2b"
        stroke="#0f0f0f"
        strokeWidth={0.02}
      />
      <circle cx={0} cy={-0.16} r={0.11} fill="#2b2b2b" stroke="#0f0f0f" strokeWidth={0.02} />
      <title>El ladrón</title>
    </g>
  );
}

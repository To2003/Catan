import type { Point } from '@tierra-austral/engine';

interface RobberProps {
  readonly center: Point;
}

/** The robber: a dark pawn sitting on its hex. */
export function Robber({ center }: RobberProps) {
  return (
    <g pointerEvents="none" transform={`translate(${center.x}, ${center.y})`}>
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

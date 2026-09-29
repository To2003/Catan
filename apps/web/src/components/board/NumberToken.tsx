import type { Point } from '@tierra-austral/engine';

interface NumberTokenProps {
  readonly center: Point;
  readonly value: number;
}

/** How many of the 36 dice combinations roll this number: 1 for 2 and 12, 5 for 6 and 8. */
const dotsFor = (value: number): number => 6 - Math.abs(7 - value);

/** 6 and 8 are the likeliest numbers, so the board shows them in red. */
const isRed = (value: number): boolean => value === 6 || value === 8;

/**
 * An enamel disc, the kind bolted to a rural road sign: cream, a thin dark
 * ring, and a shadow towards the bottom that lifts it off the terrain now that
 * the terrain has a texture of its own.
 */
export function NumberToken({ center, value }: NumberTokenProps) {
  const dots = dotsFor(value);
  const color = isRed(value) ? '#9e2b25' : '#2b3138';
  const dotGap = 0.075;
  const firstDotX = center.x - (dotGap * (dots - 1)) / 2;

  return (
    <g pointerEvents="none">
      {/* The disc's own shadow on the ground. */}
      <ellipse cx={center.x} cy={center.y + 0.36} rx={0.3} ry={0.08} fill="#0b1117" opacity={0.3} />
      <circle
        cx={center.x}
        cy={center.y}
        r={0.36}
        fill="#f2e9d5"
        stroke="#7c6c4d"
        strokeWidth={0.025}
      />
      <circle cx={center.x} cy={center.y} r={0.36} fill="url(#enamel-shade)" />
      <circle
        cx={center.x}
        cy={center.y}
        r={0.31}
        fill="none"
        stroke={isRed(value) ? '#9e2b25' : '#b6a882'}
        strokeWidth={0.012}
        opacity={0.8}
      />
      <text
        x={center.x}
        y={center.y - 0.03}
        textAnchor="middle"
        dominantBaseline="middle"
        fontFamily="Chivo, sans-serif"
        fontSize={0.44}
        fontWeight={900}
        fill={color}
      >
        {value}
      </text>
      {Array.from({ length: dots }, (_, i) => (
        <circle key={i} cx={firstDotX + i * dotGap} cy={center.y + 0.22} r={0.025} fill={color} />
      ))}
    </g>
  );
}

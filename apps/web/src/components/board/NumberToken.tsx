import type { Point } from '@tierra-austral/engine';

interface NumberTokenProps {
  readonly center: Point;
  readonly value: number;
}

/** How many of the 36 dice combinations roll this number: 1 for 2 and 12, 5 for 6 and 8. */
const dotsFor = (value: number): number => 6 - Math.abs(7 - value);

/** 6 and 8 are the likeliest numbers, so the board shows them in red. */
const isRed = (value: number): boolean => value === 6 || value === 8;

export function NumberToken({ center, value }: NumberTokenProps) {
  const dots = dotsFor(value);
  const color = isRed(value) ? '#b3261e' : '#2b2b2b';
  const dotGap = 0.075;
  const firstDotX = center.x - (dotGap * (dots - 1)) / 2;

  return (
    <g pointerEvents="none">
      <circle
        cx={center.x}
        cy={center.y}
        r={0.36}
        fill="#f4ecd8"
        stroke="#b3a179"
        strokeWidth={0.02}
      />
      <text
        x={center.x}
        y={center.y - 0.04}
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize={0.42}
        fontWeight={isRed(value) ? 800 : 600}
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

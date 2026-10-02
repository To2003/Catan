import type { Point, Terrain } from '@tierra-austral/engine';
import { TERRAIN_RESOURCE } from '@tierra-austral/engine';
import { GLYPH_BOX, RESOURCE_ART } from '../ResourceGlyph.js';

/** How much of a hex the mark takes up. A quarter: read at a glance, ignorable. */
const SIZE = 0.52;

/** How far above the number token it floats. */
const LIFT = 0.56;

/**
 * What a hex produces, carved into it.
 *
 * The number says how often; this says what of. Together they are the whole
 * question you ask a hex, and until now the second half was a colour you had
 * to have learned.
 *
 * Carved rather than drawn: the mark is the terrain's own dark edge shifted
 * down a pixel under a light one, which reads as cut into the ground instead
 * of placed on top of it. That is also why it survives six very different
 * terrains without a box around it — it is made of the same two tones they
 * are.
 *
 * It is the same artwork as the resource cards and nothing is duplicated:
 * one drawing, three sizes.
 */
export function HexIcon({
  center,
  terrain,
}: {
  readonly center: Point;
  readonly terrain: Terrain;
}) {
  const resource = TERRAIN_RESOURCE[terrain];

  const box = {
    x: center.x - SIZE / 2,
    y: center.y - LIFT - (SIZE * (48 / 36)) / 2,
    w: SIZE,
    h: SIZE * (48 / 36),
  };

  if (resource === null) {
    // The desert gets a sun rather than nothing: an empty space reads as a
    // hex whose icon failed to load.
    return (
      <g pointerEvents="none" opacity={0.5}>
        <circle cx={center.x} cy={box.y + box.h / 2} r={SIZE * 0.22} fill="#8a6b4a" />
        {Array.from({ length: 8 }, (_, index) => {
          const angle = (index / 8) * Math.PI * 2;
          const from = SIZE * 0.32;
          const to = SIZE * 0.45;
          return (
            <line
              key={index}
              x1={center.x + Math.cos(angle) * from}
              y1={box.y + box.h / 2 + Math.sin(angle) * from}
              x2={center.x + Math.cos(angle) * to}
              y2={box.y + box.h / 2 + Math.sin(angle) * to}
              stroke="#8a6b4a"
              strokeWidth={0.035}
              strokeLinecap="round"
            />
          );
        })}
        <title>Desierto: no produce nada</title>
      </g>
    );
  }

  return (
    <g pointerEvents="none">
      {/* The cut: a dark copy, one notch down. */}
      <svg
        x={box.x}
        y={box.y + 0.035}
        width={box.w}
        height={box.h}
        viewBox={GLYPH_BOX}
        fill="none"
        opacity={0.55}
        style={{ color: '#0d141a' }}
        overflow="visible"
      >
        {RESOURCE_ART[resource].art}
      </svg>
      {/* The lit edge on top of it. */}
      <svg
        x={box.x}
        y={box.y}
        width={box.w}
        height={box.h}
        viewBox={GLYPH_BOX}
        fill="none"
        opacity={0.42}
        style={{ color: '#f2e9d5' }}
        overflow="visible"
      >
        {RESOURCE_ART[resource].art}
      </svg>
    </g>
  );
}

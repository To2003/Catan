import type { ReactNode } from 'react';
import type { Resource } from '@tierra-austral/engine';

/**
 * The five resources, drawn once.
 *
 * **Filled silhouettes, not line art.** The first version was thin strokes,
 * which is a technical drawing: precise, cold, and almost invisible at the
 * sizes these are actually used at. A board game wants the shape of the
 * thing, the way a wooden piece has a shape.
 *
 * Everything is `currentColor`, with the inner detail at a lower opacity of
 * the same colour. That is what lets one drawing do both jobs: painted in
 * its own warm tone on a card or a chip, and carved into a hex as two
 * offset copies of dark and light. A second set of artwork for the second
 * job would be a second set to keep in step.
 *
 * Drawn in a 36×48 box.
 */

export const RESOURCE_ART: Record<Resource, { band: string; ink: string; art: ReactNode }> = {
  wood: {
    band: '#2b5138',
    ink: '#1d3a26',
    art: (
      <>
        {/* A pine, in three tiers. */}
        <path d="M18 5 L27 19 H9 Z" fill="currentColor" />
        <path d="M18 14 L29.5 29 H6.5 Z" fill="currentColor" />
        <path d="M18 23 L32 39 H4 Z" fill="currentColor" />
        <rect x="15.4" y="37" width="5.2" height="8" rx="1" fill="currentColor" />
        {/* The lit side, which gives it a bit of body. */}
        <path d="M18 23 L32 39 H18 Z" fill="currentColor" fillOpacity={0.3} />
      </>
    ),
  },
  brick: {
    band: '#9c4b2c',
    ink: '#6b3320',
    art: (
      <>
        {/* Three courses, staggered, with the mortar cut out. */}
        <rect x="4" y="12" width="13" height="8.5" rx="1.2" fill="currentColor" />
        <rect x="19" y="12" width="13" height="8.5" rx="1.2" fill="currentColor" />
        <rect x="4" y="22.5" width="28" height="8.5" rx="1.2" fill="currentColor" />
        <rect x="4" y="33" width="13" height="8.5" rx="1.2" fill="currentColor" />
        <rect x="19" y="33" width="13" height="8.5" rx="1.2" fill="currentColor" />
        <rect
          x="4"
          y="12"
          width="28"
          height="2.4"
          rx="1.2"
          fill="currentColor"
          fillOpacity={0.35}
        />
      </>
    ),
  },
  sheep: {
    band: '#6d9250',
    ink: '#3f5a33',
    art: (
      <>
        {/* The fleece: overlapping lumps, which is what makes it read as wool. */}
        <circle cx="13" cy="22" r="7.5" fill="currentColor" />
        <circle cx="21" cy="19.5" r="7" fill="currentColor" />
        <circle cx="24" cy="26" r="6.5" fill="currentColor" />
        <circle cx="15" cy="29" r="7" fill="currentColor" />
        <rect x="10" y="22" width="16" height="10" rx="5" fill="currentColor" />
        {/* Head and legs, darker, so the animal has a front. */}
        <ellipse cx="29" cy="17" rx="4.6" ry="4" fill="currentColor" fillOpacity={0.45} />
        <rect
          x="11"
          y="33"
          width="3.2"
          height="8"
          rx="1.6"
          fill="currentColor"
          fillOpacity={0.45}
        />
        <rect
          x="21"
          y="33"
          width="3.2"
          height="8"
          rx="1.6"
          fill="currentColor"
          fillOpacity={0.45}
        />
      </>
    ),
  },
  wheat: {
    band: '#cfa43a',
    ink: '#8a6c1f',
    art: (
      <>
        {/* An ear of wheat: a stalk, and grains splaying out and up. The
            first attempt stacked them straight and it read as a ladder. */}
        <path d="M18 45 V18" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
        {[
          { y: 34, lean: 22, reach: 7.5 },
          { y: 27, lean: 26, reach: 7 },
          { y: 20, lean: 30, reach: 6 },
        ].map((grain) => (
          <g key={grain.y}>
            <ellipse
              cx={18 - grain.reach}
              cy={grain.y - 2}
              rx="3.1"
              ry="5.4"
              transform={`rotate(-${grain.lean} ${18 - grain.reach} ${grain.y - 2})`}
              fill="currentColor"
            />
            <ellipse
              cx={18 + grain.reach}
              cy={grain.y - 2}
              rx="3.1"
              ry="5.4"
              transform={`rotate(${grain.lean} ${18 + grain.reach} ${grain.y - 2})`}
              fill="currentColor"
            />
          </g>
        ))}
        {/* The tip. */}
        <ellipse cx="18" cy="9.5" rx="3.3" ry="6" fill="currentColor" />
        {/* Two leaves low on the stalk, which is what says "plant". */}
        <path d="M18 38 q-7 1 -9 6 q7 0 9 -6" fill="currentColor" fillOpacity={0.55} />
        <path d="M18 41 q7 1 9 6 q-7 0 -9 -6" fill="currentColor" fillOpacity={0.55} />
      </>
    ),
  },
  ore: {
    band: '#6c7c8b',
    ink: '#3f4c58',
    art: (
      <>
        {/* A chunk of rock, cut into facets. */}
        <path d="M18 7 L31 20 L26 41 H10 L5 20 Z" fill="currentColor" />
        <path d="M18 7 L31 20 L26 41 H18 Z" fill="currentColor" fillOpacity={0.35} />
        {/* The vein. */}
        <path
          d="M18 7 L14 22 L21 26 L17 41"
          stroke="currentColor"
          strokeOpacity={0.45}
          strokeWidth="2.4"
          fill="none"
          strokeLinejoin="round"
        />
      </>
    ),
  },
};

/**
 * The colour each resource is painted in when it is shown in colour.
 *
 * Warmer and lighter than the terrain's own fill: a chip of wood sitting on
 * a dark panel has to glow a little, where a forest hex has to recede behind
 * a number token.
 */
export const RESOURCE_TONE: Record<Resource, string> = {
  wood: '#4e8a5c',
  brick: '#c4643a',
  sheep: '#e8e2d2',
  wheat: '#e5b945',
  ore: '#93a6b6',
};

/** The box every mark is drawn in. */
export const GLYPH_BOX = '0 0 36 48';

interface ResourceGlyphProps {
  readonly resource: Resource;
  /** Rendered size in pixels. Omit inside an SVG and position it yourself. */
  readonly size?: number;
  readonly className?: string;
  readonly title?: string;
  /** Painted in its own warm tone. Off to inherit the surrounding colour. */
  readonly tone?: boolean;
}

/** One resource mark, as its own little SVG. */
export function ResourceGlyph({
  resource,
  size = 16,
  className,
  title,
  tone = true,
}: ResourceGlyphProps) {
  return (
    <svg
      viewBox={GLYPH_BOX}
      width={size}
      height={size * (48 / 36)}
      fill="none"
      aria-hidden={title === undefined}
      {...(title === undefined ? {} : { role: 'img', 'aria-label': title })}
      className={className}
      {...(tone ? { style: { color: RESOURCE_TONE[resource] } } : {})}
    >
      {title === undefined ? null : <title>{title}</title>}
      {RESOURCE_ART[resource].art}
    </svg>
  );
}

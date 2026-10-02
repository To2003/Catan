import type { ReactNode } from 'react';
import type { Resource } from '@tierra-austral/engine';

/**
 * The five resources, drawn once.
 *
 * They started life inside the resource card and were emoji everywhere else
 * — on the harbours, on the cost card, in the toasts — which meant the game
 * spoke two visual languages at once and the second one looked different on
 * every operating system. This is the only place any of them is drawn now;
 * everything else asks for a `<ResourceGlyph>`.
 *
 * Every mark is strokes in `currentColor` inside a 36×48 box, so the same
 * drawing works carved into a hex, filled on a card and tiny on a badge.
 */

export const RESOURCE_ART: Record<Resource, { band: string; ink: string; art: ReactNode }> = {
  wood: {
    band: '#2b5138',
    ink: '#1d3a26',
    art: (
      <>
        <path d="M18 40 V22" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
        <path
          d="M18 24 l-7 -9 M18 30 l7 -9 M18 34 l-6 -7"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </>
    ),
  },
  brick: {
    band: '#9c4b2c',
    ink: '#6b3320',
    art: (
      <>
        <rect
          x="6"
          y="20"
          width="24"
          height="7"
          rx="1.5"
          stroke="currentColor"
          strokeWidth="1.8"
          fill="none"
        />
        <rect
          x="6"
          y="30"
          width="24"
          height="7"
          rx="1.5"
          stroke="currentColor"
          strokeWidth="1.8"
          fill="none"
        />
        <path d="M18 20 V27 M12 30 V37 M24 30 V37" stroke="currentColor" strokeWidth="1.5" />
      </>
    ),
  },
  sheep: {
    band: '#6d9250',
    ink: '#3f5a33',
    art: (
      <>
        <ellipse cx="17" cy="26" rx="10" ry="8" stroke="currentColor" strokeWidth="2" fill="none" />
        <circle cx="26" cy="22" r="4.5" stroke="currentColor" strokeWidth="2" fill="none" />
        <path d="M12 34 v5 M22 34 v5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </>
    ),
  },
  wheat: {
    band: '#cfa43a',
    ink: '#8a6c1f',
    art: (
      <>
        <path d="M18 40 V18" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
        <path
          d="M18 20 q-6 -1 -7 -7 q6 1 7 7 M18 26 q-6 -1 -7 -7 q6 1 7 7 M18 20 q6 -1 7 -7 q-6 1 -7 7 M18 26 q6 -1 7 -7 q-6 1 -7 7"
          stroke="currentColor"
          strokeWidth="1.6"
          fill="none"
        />
      </>
    ),
  },
  ore: {
    band: '#6c7c8b',
    ink: '#3f4c58',
    art: (
      <>
        <path
          d="M8 38 L18 14 L28 38 Z"
          stroke="currentColor"
          strokeWidth="2"
          fill="none"
          strokeLinejoin="round"
        />
        <path
          d="M18 14 L18 38 M12 30 L24 30"
          stroke="currentColor"
          strokeWidth="1.4"
          opacity="0.7"
        />
      </>
    ),
  },
};

/** The box every mark is drawn in. */
export const GLYPH_BOX = '0 0 36 48';

interface ResourceGlyphProps {
  readonly resource: Resource;
  /** Rendered size in pixels. Omit inside an SVG and position it yourself. */
  readonly size?: number;
  readonly className?: string;
  readonly title?: string;
}

/** One resource mark, as its own little SVG. */
export function ResourceGlyph({ resource, size = 16, className, title }: ResourceGlyphProps) {
  return (
    <svg
      viewBox={GLYPH_BOX}
      width={size}
      height={size * (48 / 36)}
      fill="none"
      aria-hidden={title === undefined}
      {...(title === undefined ? {} : { role: 'img', 'aria-label': title })}
      className={className}
    >
      {title === undefined ? null : <title>{title}</title>}
      {RESOURCE_ART[resource].art}
    </svg>
  );
}

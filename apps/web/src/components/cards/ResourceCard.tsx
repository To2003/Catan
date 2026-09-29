import type { ReactNode } from 'react';
import type { Resource } from '@tierra-austral/engine';
import { RESOURCE_LABELS } from '../../lib/terrainStyles.js';

/** The card stock, per resource: a band colour and a mark drawn in SVG. */
const CARD_STYLE: Record<Resource, { band: string; ink: string; art: ReactNode }> = {
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

interface ResourceCardProps {
  readonly resource: Resource;
  /** Shown as a badge when several identical cards are stacked into one. */
  readonly count?: number;
  readonly selected?: boolean;
  readonly dimmed?: boolean;
  readonly onClick?: () => void;
  readonly title?: string;
}

/**
 * One resource card.
 *
 * Cards rather than a row of numbers because that is what people are holding:
 * you pick cards up, you put them down, you hand them over. The illustrations
 * are inline SVG — a few lines each, sharp at any size, nothing to download.
 */
export function ResourceCard({
  resource,
  count,
  selected = false,
  dimmed = false,
  onClick,
  title,
}: ResourceCardProps) {
  const style = CARD_STYLE[resource];
  const interactive = onClick !== undefined;

  return (
    <button
      type="button"
      disabled={!interactive}
      onClick={onClick}
      title={title ?? RESOURCE_LABELS[resource]}
      aria-pressed={interactive ? selected : undefined}
      className={`group relative block h-[68px] w-[50px] shrink-0 rounded-carta border-2 bg-[#efe6d3] text-left shadow-md transition-transform duration-150 ${
        interactive ? 'cursor-pointer hover:-translate-y-2.5 focus-visible:-translate-y-2.5' : ''
      } ${selected ? '-translate-y-3.5 ring-2 ring-estepa' : ''} ${dimmed ? 'opacity-45' : ''}`}
      style={{ borderColor: style.band }}
    >
      <span
        className="absolute inset-x-0 top-0 h-2 rounded-t-[8px]"
        style={{ backgroundColor: style.band }}
      />
      <svg viewBox="0 0 36 48" className="mt-1.5 h-[38px] w-full" style={{ color: style.ink }}>
        {style.art}
      </svg>
      <span
        className="absolute inset-x-0 bottom-0.5 text-center text-[9px] leading-none font-semibold"
        style={{ color: style.ink }}
      >
        {RESOURCE_LABELS[resource]}
      </span>
      {count !== undefined && count > 1 ? (
        <span className="font-display absolute -top-2 -right-2 rounded-full bg-noche px-1.5 text-[11px] font-bold text-guanaco ring-1 ring-guanaco/40">
          {count}
        </span>
      ) : null}
    </button>
  );
}

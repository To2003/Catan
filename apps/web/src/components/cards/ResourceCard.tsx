import type { Resource } from '@tierra-austral/engine';
import { RESOURCE_LABELS } from '../../lib/terrainStyles.js';
import { GLYPH_BOX, RESOURCE_ART } from '../ResourceGlyph.js';

/** The card stock, per resource: a band colour and a mark drawn in SVG. */
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
  const style = RESOURCE_ART[resource];
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
      <svg viewBox={GLYPH_BOX} className="mt-1.5 h-[38px] w-full" style={{ color: style.ink }}>
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

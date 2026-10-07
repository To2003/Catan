import type { Resource } from '@tierra-austral/engine';
import { RESOURCE_LABELS } from '../../lib/terrainStyles.js';
import { RESOURCE_ART } from '../ResourceGlyph.js';
import { ResourceSprite } from '../ResourceSprite.js';

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
 * How big a card is, in pixels.
 *
 * Grown by half: at 50×68 the drawing on a card was a thumbnail of a
 * thumbnail, and a hand is the thing you look at most in a turn. The hand
 * band is sized off this, so changing it here moves everything that has to
 * make room.
 */
export const CARD_WIDTH = 76;
export const CARD_HEIGHT = 104;

/**
 * One resource card.
 *
 * Cards rather than a row of numbers because that is what people are
 * holding: you pick cards up, you put them down, you hand them over. The
 * art is the painted bundle — logs, a bale of wool, a stack of bricks —
 * which at this size has room to be seen.
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
      style={{ borderColor: style.band, width: CARD_WIDTH, height: CARD_HEIGHT }}
      className={`group relative block shrink-0 rounded-carta border-2 bg-[#efe6d3] text-left shadow-md transition-transform duration-150 ${
        interactive ? 'cursor-pointer hover:-translate-y-3 focus-visible:-translate-y-3' : ''
      } ${selected ? '-translate-y-4 ring-2 ring-estepa' : ''} ${dimmed ? 'opacity-45' : ''}`}
    >
      <span
        className="absolute inset-x-0 top-0 h-2.5 rounded-t-[8px]"
        style={{ backgroundColor: style.band }}
      />

      <span className="absolute inset-x-0 top-3 flex justify-center">
        <ResourceSprite resource={resource} size={CARD_WIDTH - 18} decorative />
      </span>

      <span
        className="absolute inset-x-0 bottom-1 text-center text-[11px] leading-none font-semibold"
        style={{ color: style.ink }}
      >
        {RESOURCE_LABELS[resource]}
      </span>

      {count !== undefined && count > 1 ? (
        <span className="font-display absolute -top-2 -right-2 rounded-full bg-noche px-2 text-[13px] font-bold text-guanaco ring-1 ring-guanaco/40">
          {count}
        </span>
      ) : null}
    </button>
  );
}

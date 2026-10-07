import type { Resource } from '@tierra-austral/engine';
import { RESOURCE_LABELS } from '../lib/terrainStyles.js';

/**
 * The painted resource: a bundle of logs, a bale of wool, a stack of bricks.
 *
 * These are illustrations, not icons, and that is the point — they carry the
 * warmth the line drawings never had. They live as trimmed WebP with the
 * background cut out (about 20 kB each) rather than as SVG, because what
 * makes them work is the shading, and shading is what SVG is worst at.
 *
 * **They are not used everywhere.** The hexes and the harbour badges keep the
 * drawn marks: a hex icon is a quarter of a hex and has to survive being
 * engraved into six different terrains, and a detailed illustration at that
 * size is mud. So: painted where there is room to see it, drawn where it has
 * to be small or monochrome. One decision, two answers.
 */
export function ResourceSprite({
  resource,
  size = 32,
  className = '',
  decorative = false,
}: {
  readonly resource: Resource;
  readonly size?: number;
  readonly className?: string;
  /** True where a label beside it already says which resource this is. */
  readonly decorative?: boolean;
}) {
  return (
    <img
      src={`/recursos/${resource}.webp`}
      width={size}
      height={size}
      loading="lazy"
      decoding="async"
      alt={decorative ? '' : RESOURCE_LABELS[resource]}
      {...(decorative ? { 'aria-hidden': true } : { title: RESOURCE_LABELS[resource] })}
      className={`shrink-0 object-contain select-none ${className}`}
      style={{ width: size, height: size }}
      draggable={false}
    />
  );
}

import type { PlayerColor } from '@tierra-austral/engine';

/**
 * The player colours as hex, mirroring the `@theme` tokens in index.css. SVG
 * fills cannot read Tailwind classes, so the palette lives here too.
 */
export const PLAYER_COLORS: Record<PlayerColor, string> = {
  celeste: '#5fa8d3',
  bordo: '#a63446',
  verde: '#4c8b5b',
  amarillo: '#e0b93f',
};

/** A darker shade of each, for the shaded side of a piece. */
export const PLAYER_SHADOWS: Record<PlayerColor, string> = {
  celeste: '#3d759a',
  bordo: '#742533',
  verde: '#356140',
  amarillo: '#9c7f25',
};

export const PLAYER_COLOR_LABELS: Record<PlayerColor, string> = {
  celeste: 'Celeste',
  bordo: 'Bordó',
  verde: 'Verde',
  amarillo: 'Amarillo',
};

/** The shaded side of a piece painted in `color`. */
export const shadeOf = (color: string): string => {
  const entry = Object.entries(PLAYER_COLORS).find(([, value]) => value === color);
  return entry ? PLAYER_SHADOWS[entry[0] as PlayerColor] : '#11181f';
};

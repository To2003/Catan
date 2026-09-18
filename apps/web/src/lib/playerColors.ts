import type { PlayerColor } from '@tierra-austral/engine';

/**
 * The player colours as hex, mirroring the `@theme` tokens in index.css. SVG
 * fills cannot read Tailwind classes, so the palette lives here too.
 */
export const PLAYER_COLORS: Record<PlayerColor, string> = {
  celeste: '#5aa9e6',
  bordo: '#8c2f39',
  verde: '#4c956c',
  amarillo: '#e8c547',
};

export const PLAYER_COLOR_LABELS: Record<PlayerColor, string> = {
  celeste: 'Celeste',
  bordo: 'Bordó',
  verde: 'Verde',
  amarillo: 'Amarillo',
};

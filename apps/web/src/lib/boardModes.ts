import type { BoardMode } from '@tierra-austral/engine';

/** How each board mode is named on screen. */
export const BOARD_MODE_LABELS: Readonly<Record<BoardMode, string>> = {
  random: 'Aleatorio',
  classic: 'Clásico',
  balanced: 'Balanceado',
};

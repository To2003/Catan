/**
 * How much movement the interface is allowed.
 *
 * Animations here are always decoration over state that has already changed:
 * turning them off changes nothing about what you can do or when. That is why
 * "sin animaciones" is a real setting and not a degraded mode.
 */
export type AnimationSpeed = 'off' | 'normal' | 'fast';

const KEY = 'tierra-austral:animation';

export const prefersReducedMotion = (): boolean => {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
};

export const readAnimationSpeed = (): AnimationSpeed => {
  try {
    const stored = window.localStorage.getItem(KEY);
    if (stored === 'off' || stored === 'normal' || stored === 'fast') return stored;
  } catch {
    // Fall through to the default.
  }
  // Somebody who asked their system for less movement gets less movement.
  return prefersReducedMotion() ? 'off' : 'normal';
};

export const writeAnimationSpeed = (speed: AnimationSpeed): void => {
  try {
    window.localStorage.setItem(KEY, speed);
  } catch {
    // Playing without remembering the setting is fine.
  }
};

/** Multiplier applied to every duration. Zero means "do not animate at all". */
export const speedScale = (speed: AnimationSpeed): number =>
  speed === 'off' ? 0 : speed === 'fast' ? 0.5 : 1;

export const SPEED_LABELS: Record<AnimationSpeed, string> = {
  off: 'Sin animaciones',
  normal: 'Normal',
  fast: 'Rápidas',
};

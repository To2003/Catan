import { useEffect, useState } from 'react';

/**
 * What this browser remembers about how you like to play.
 *
 * Its own module, and not part of the settings menu's file, because the tour
 * reads these and the menu drives the tour: with both in one place that is a
 * cycle, and a cycle that works today is a cycle that breaks the day
 * somebody adds a top-level call to it.
 *
 * None of these changes the game, so none of them travels to the server.
 */
export const SETTINGS = {
  confirmEndTurn: 'tierra-austral:confirmar-fin-turno',
  hexIcons: 'tierra-austral:iconos-hex',
  tips: 'tierra-austral:mostrar-ayudas',
} as const;

/** Everything is on unless it was turned off. */
export const settingEnabled = (key: string): boolean => {
  try {
    return window.localStorage.getItem(key) !== '0';
  } catch {
    return true;
  }
};

export const writeSetting = (key: string, on: boolean): void => {
  try {
    window.localStorage.setItem(key, on ? '1' : '0');
  } catch {
    // Blocked storage just resets the setting between sessions.
  }
};

/** The event a change fires, since nothing subscribes to localStorage. */
export const SETTINGS_CHANGED = 'tierra-austral:settings';

export const announceSettings = (): void => {
  window.dispatchEvent(new Event(SETTINGS_CHANGED));
};

/** Re-reads a setting whenever the menu changes one. */
export const useSetting = (key: string): boolean => {
  const [on, setOn] = useState(() => settingEnabled(key));
  useEffect(() => {
    const update = (): void => {
      setOn(settingEnabled(key));
    };
    window.addEventListener(SETTINGS_CHANGED, update);
    return () => {
      window.removeEventListener(SETTINGS_CHANGED, update);
    };
  }, [key]);
  return on;
};

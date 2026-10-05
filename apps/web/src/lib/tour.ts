import { SETTINGS, settingEnabled } from './settings.js';

/**
 * The guided tours, as data.
 *
 * Every step points at a `data-tour` attribute and never at a class: a class
 * is a styling decision somebody is entitled to change, and a tour that
 * breaks silently when they do is worse than no tour. The ids are part of
 * the markup's contract, and a test walks this table against the real
 * screens to keep it that way.
 */

export interface TourStep {
  /** The `data-tour` value this step points at. */
  readonly anchor: string;
  readonly title: string;
  /** Two lines at most: a tour nobody reads is a tour that does nothing. */
  readonly body: string;
  /** Which screen and phase this step can be shown on, for the test. */
  readonly screen: 'lobby' | 'game';
}

export interface Tour {
  readonly id: string;
  readonly steps: readonly TourStep[];
}

export const LOBBY_TOUR: Tour = {
  id: 'lobby',
  steps: [
    {
      anchor: 'room-code',
      title: 'El código de la sala',
      body: 'Pasáselo a los demás, o copiá el link y mandalo. Con eso entran.',
      screen: 'lobby',
    },
    {
      anchor: 'board-mode',
      title: 'Cómo se arma el tablero',
      body: 'Lo elige el anfitrión. "Otro tablero" sortea uno nuevo sin cambiar el modo.',
      screen: 'lobby',
    },
    {
      anchor: 'ready',
      title: 'Cuando estés listo',
      body: 'Elegí tu color y tocá acá. Arranca cuando están todos.',
      screen: 'lobby',
    },
  ],
};

export const WELCOME_TOUR: Tour = {
  id: 'bienvenida',
  steps: [
    {
      anchor: 'board',
      title: 'El tablero',
      body: 'Cada hex dice qué produce y cada cuánto. Arrancás poniendo dos pueblos y dos caminos.',
      screen: 'game',
    },
    {
      anchor: 'hand',
      title: 'Tu mano',
      body: 'Las cartas que te van entrando. Con eso construís.',
      screen: 'game',
    },
    {
      anchor: 'dice-dock',
      title: 'Los dados y el botón',
      body: 'Acá tirás y acá terminás el turno. Siempre hay un solo botón grande.',
      screen: 'game',
    },
    {
      anchor: 'costs',
      title: 'Qué cuesta cada cosa',
      body: 'Con un tilde en lo que ya te alcanza. También dice cuántas piezas te quedan.',
      screen: 'game',
    },
    {
      anchor: 'players',
      title: 'Cómo viene la mano',
      body: 'Puntos, caminos, caballeros y cartas de cada uno.',
      screen: 'game',
    },
    {
      anchor: 'tabs',
      title: 'Cartas, comercio y chat',
      body: 'Acá comerciás con los demás o con el banco, y hablás con la mesa.',
      screen: 'game',
    },
  ],
};

/**
 * One-step nudges, the first time each thing happens.
 *
 * They are the parts of the game that are invisible until they bite you —
 * you cannot learn that a seven makes you discard by looking at the screen
 * before it does.
 */
export const TIPS: Readonly<Record<string, TourStep>> = {
  seven: {
    anchor: 'turn-instruction',
    title: 'Salió un 7',
    body: 'Nadie cobra. El que tenga más de 7 cartas tira la mitad.',
    screen: 'game',
  },
  robber: {
    anchor: 'board',
    title: 'El ladrón',
    body: 'Elegí un hex: deja de producir y le robás una carta a quien tenga algo ahí.',
    screen: 'game',
  },
  offer: {
    anchor: 'incoming-offer',
    title: 'Te ofrecen un cambio',
    body: 'Podés aceptar, rechazar o contraofertar. Y cambiar de idea mientras siga abierta.',
    screen: 'game',
  },
  canBuild: {
    anchor: 'costs',
    title: 'Te alcanza para construir',
    body: 'El tilde marca lo que ya podés pagar. Tocá el tablero para poner la pieza.',
    screen: 'game',
  },
  devCard: {
    anchor: 'tabs',
    title: 'Compraste una carta',
    body: 'Está en la solapa "Cartas". No se puede jugar en el mismo turno que la compraste.',
    screen: 'game',
  },
};

const KEY = 'tierra-austral:tours-vistos';

const seen = (): Set<string> => {
  try {
    return new Set(JSON.parse(window.localStorage.getItem(KEY) ?? '[]') as string[]);
  } catch {
    return new Set();
  }
};

export const alreadySeen = (id: string): boolean => seen().has(id);

export const markSeen = (id: string): void => {
  try {
    const all = seen();
    all.add(id);
    window.localStorage.setItem(KEY, JSON.stringify([...all]));
  } catch {
    // A browser with storage blocked sees the tour again, which is survivable.
  }
};

/** Only for the "Repasar la interfaz" button, which replays on purpose. */
export const forgetSeen = (id: string): void => {
  try {
    const all = seen();
    all.delete(id);
    window.localStorage.setItem(KEY, JSON.stringify([...all]));
  } catch {
    // Nothing to do.
  }
};

/**
 * When the last tour closed.
 *
 * Without this, dismissing the welcome tour fired a contextual tip
 * immediately and the overlay came straight back — you close one and land
 * under the next, which is the opposite of staying out of the way. A tip has
 * to wait for the screen to be yours again for a bit.
 */
let lastClosedAt = 0;

/** How long the screen stays yours after you dismiss something. */
const QUIET_MS = 25_000;

export const quietAfterTour = (): boolean => Date.now() - lastClosedAt < QUIET_MS;

export const noteTourClosed = (): void => {
  lastClosedAt = Date.now();
};

/** Whether a tour may run at all right now. */
export const toursEnabled = (): boolean => {
  if (!settingEnabled(SETTINGS.tips)) return false;
  // Never while poking at the debug tools: a tour over a screen that is not
  // the game is a tour pointing at nothing.
  const params = new URLSearchParams(window.location.search);
  return !params.has('debug') && !params.has('board') && !params.has('sprites');
};

/**
 * Runs a tour, loading driver.js only when one actually starts.
 *
 * Dynamically imported so the library never lands in the first bundle:
 * almost nobody sees a tour twice, and the ones who never see one should not
 * pay for it.
 */
export const runTour = async (
  steps: readonly TourStep[],
  options: { readonly onDone?: () => void } = {},
): Promise<void> => {
  const present = steps.filter(
    (step) => document.querySelector(`[data-tour="${step.anchor}"]`) !== null,
  );
  // A step whose element is not on screen is skipped rather than shown
  // pointing at nothing. If none is left there is no tour to run.
  if (present.length === 0) {
    options.onDone?.();
    return;
  }

  const { driver } = await import('driver.js');
  await import('driver.js/dist/driver.css');

  const tour = driver({
    showProgress: present.length > 1,
    allowClose: true,
    overlayOpacity: 0.65,
    nextBtnText: 'Siguiente',
    prevBtnText: 'Atrás',
    // Not "Listo": the lobby has an "Estoy listo" right next to it, and two
    // buttons a word apart are two buttons you can press by mistake.
    doneBtnText: 'Entendido',
    progressText: '{{current}} de {{total}}',
    popoverClass: 'tour-popover',
    onDestroyed: () => {
      noteTourClosed();
      options.onDone?.();
    },
    steps: present.map((step) => ({
      element: `[data-tour="${step.anchor}"]`,
      popover: { title: step.title, description: step.body },
    })),
  });

  tour.drive();
};

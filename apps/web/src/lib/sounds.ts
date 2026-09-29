/**
 * A few short sounds, synthesised with the Web Audio API.
 *
 * No files to ship, no licences to chase, and nothing to load before the first
 * click. Muted state lives in localStorage so it survives a reload.
 */
const MUTE_KEY = 'tierra-austral:muted';

let context: AudioContext | undefined;

export const isMuted = (): boolean => {
  try {
    return window.localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
};

export const setMuted = (muted: boolean): void => {
  try {
    window.localStorage.setItem(MUTE_KEY, muted ? '1' : '0');
  } catch {
    // Playing without being able to remember the setting is fine.
  }
};

const tone = (frequency: number, seconds: number, when: number, gain: number): void => {
  if (isMuted()) return;
  try {
    context ??= new AudioContext();
    if (context.state === 'suspended') void context.resume();

    const oscillator = context.createOscillator();
    const volume = context.createGain();
    oscillator.type = 'triangle';
    oscillator.frequency.value = frequency;
    volume.gain.setValueAtTime(gain, context.currentTime + when);
    volume.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + when + seconds);
    oscillator.connect(volume).connect(context.destination);
    oscillator.start(context.currentTime + when);
    oscillator.stop(context.currentTime + when + seconds);
  } catch {
    // A browser that will not make noise is not a problem worth reporting.
  }
};

export const sounds = {
  dice: () => {
    tone(320, 0.06, 0, 0.12);
    tone(260, 0.08, 0.07, 0.12);
  },
  production: () => {
    tone(520, 0.1, 0, 0.09);
    tone(660, 0.12, 0.08, 0.08);
  },
  build: () => {
    tone(180, 0.12, 0, 0.12);
  },
  trade: () => {
    tone(440, 0.08, 0, 0.09);
    tone(560, 0.08, 0.06, 0.09);
  },
  turn: () => {
    tone(392, 0.09, 0, 0.1);
    tone(523, 0.12, 0.08, 0.1);
  },
  win: () => {
    tone(523, 0.15, 0, 0.12);
    tone(659, 0.15, 0.12, 0.12);
    tone(784, 0.3, 0.24, 0.12);
  },
};

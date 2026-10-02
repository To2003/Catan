import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createGame, getPlayerView, type PlayerColor } from '@tierra-austral/engine';
import { LOBBY_TOUR, TIPS, WELCOME_TOUR, alreadySeen, markSeen, toursEnabled } from './tour.js';
import { LobbyScreen } from '../screens/LobbyScreen.js';
import { GameScreen } from '../screens/GameScreen.js';
import { useGame } from '../store/gameStore.js';

/**
 * The tour points at things that exist.
 *
 * A tour is a second copy of the interface's structure, written down in a
 * different file. Nothing stops somebody renaming a panel and leaving the
 * tour pointing at nothing — nothing except this, which renders the real
 * screens and looks for every anchor the tour claims.
 */
const seat = (playerId: string, name: string, color: PlayerColor) => ({
  playerId,
  name,
  color,
  ready: true,
  connected: true,
  state: 'active' as const,
});

const room = {
  code: 'X7K2M',
  seats: [seat('p1', 'Ana', 'celeste'), seat('p2', 'Bruno', 'bordo'), seat('p3', 'Cata', 'verde')],
  hostId: 'p1',
  started: false,
  previewSeed: 4321,
  boardMode: 'random' as const,
  wins: {},
  gamesPlayed: 0,
  restartCooldown: {},
};

const anchors = (): Set<string> =>
  new Set(
    [...document.querySelectorAll('[data-tour]')].map((el) => el.getAttribute('data-tour') ?? ''),
  );

beforeEach(() => {
  window.localStorage.clear();
  // Seen already, so mounting a screen does not try to drive a tour through
  // jsdom while the test is looking at the markup.
  markSeen(LOBBY_TOUR.id);
  markSeen(WELCOME_TOUR.id);
});

afterEach(() => {
  window.localStorage.clear();
});

describe('every step of the lobby tour has something to point at', () => {
  it.each(LOBBY_TOUR.steps.map((step) => [step.anchor, step] as const))('%s', (anchor) => {
    useGame.setState({ room, playerId: 'p1', chat: [], chatSeen: 0, error: undefined });
    render(<LobbyScreen />);
    expect(anchors()).toContain(anchor);
  });
});

describe('every step of the welcome tour has something to point at', () => {
  // Built once: the game screen needs a real view, and the anchors it has do
  // not depend on which of them this step is about.
  const mountGame = (): void => {
    useGame.setState({
      room: { ...room, started: true },
      playerId: 'p1',
      chat: [],
      chatSeen: 0,
      error: undefined,
      events: [],
      effects: [],
      view: makeView(),
    });
    render(<GameScreen />);
  };

  it.each(WELCOME_TOUR.steps.map((step) => [step.anchor] as const))('%s', (anchor) => {
    mountGame();
    expect(anchors()).toContain(anchor);
  });
});

describe('every contextual tip has something to point at', () => {
  it('names an anchor the game screen actually has', () => {
    useGame.setState({
      room: { ...room, started: true },
      playerId: 'p1',
      chat: [],
      chatSeen: 0,
      error: undefined,
      events: [],
      effects: [],
      view: makeView(),
    });
    render(<GameScreen />);
    const present = anchors();

    for (const [key, step] of Object.entries(TIPS)) {
      // `incoming-offer` only exists when there is one, which is the point of
      // that tip; everything else has to be there all the time.
      if (step.anchor === 'incoming-offer') continue;
      expect(present, `la ayuda "${key}" apunta a "${step.anchor}"`).toContain(step.anchor);
    }
  });
});

describe('what has been seen is remembered', () => {
  it('does not offer a tour twice', () => {
    window.localStorage.clear();
    expect(alreadySeen(WELCOME_TOUR.id)).toBe(false);
    markSeen(WELCOME_TOUR.id);
    expect(alreadySeen(WELCOME_TOUR.id)).toBe(true);
  });

  it('stays off while the debug screens are open', () => {
    const url = window.location.href;
    window.history.replaceState(null, '', '?debug=1');
    expect(toursEnabled()).toBe(false);
    window.history.replaceState(null, '', url);
    expect(toursEnabled()).toBe(true);
  });

  it('stays off when the setting is off', () => {
    window.localStorage.setItem('tierra-austral:mostrar-ayudas', '0');
    expect(toursEnabled()).toBe(false);
  });
});

/** A view just real enough to render the game screen. */
function makeView() {
  // Built from the engine so the shape cannot drift from the real one.
  const state = createGame(4321, [
    { id: 'p1', name: 'Ana', color: 'celeste' },
    { id: 'p2', name: 'Bruno', color: 'bordo' },
    { id: 'p3', name: 'Cata', color: 'verde' },
  ]);
  return getPlayerView(state, 'p1');
}

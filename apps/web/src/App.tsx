import { BoardScreen } from './screens/BoardScreen.js';
import { GameOverScreen } from './screens/GameOverScreen.js';
import { GameScreen } from './screens/GameScreen.js';
import { HomeScreen } from './screens/HomeScreen.js';
import { HotSeatScreen } from './screens/HotSeatScreen.js';
import { LobbyScreen } from './screens/LobbyScreen.js';
import { useEffect } from 'react';
import { readHotSeatFromUrl } from './lib/seed.js';
import { useGame } from './store/gameStore.js';

/**
 * Where you land:
 *
 *   ?debug=1  the local hot-seat, which needs no server and is still the
 *             fastest way to exercise the rules
 *   ?board=1  the M1 board viewer
 *   otherwise the real thing: home, lobby, game, game over, driven by what the
 *             server says
 */
const hotSeat = readHotSeatFromUrl();
const boardOnly = new URLSearchParams(window.location.search).get('board') === '1';

export function App() {
  const room = useGame((state) => state.room);
  const view = useGame((state) => state.view);
  const connected = useGame((state) => state.connected);
  const resume = useGame((state) => state.resume);

  // Once the socket is up, try to walk back into the last room.
  useEffect(() => {
    if (connected && !room && !hotSeat && !boardOnly) resume();
  }, [connected, room, resume]);

  if (hotSeat) return <HotSeatScreen />;
  if (boardOnly) return <BoardScreen />;

  if (!room) return <HomeScreen />;
  if (view?.phase.kind === 'gameOver') return <GameOverScreen />;
  if (!room.started || !view) return <LobbyScreen />;
  return <GameScreen />;
}

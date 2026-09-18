import { BoardScreen } from './screens/BoardScreen.js';
import { HotSeatScreen } from './screens/HotSeatScreen.js';
import { readHotSeatFromUrl } from './lib/seed.js';

/**
 * `?debug=1` opens the hot-seat tool; anything else shows the plain board.
 * Read once at startup: switching modes means reloading, which is fine for a
 * development aid.
 */
const hotSeat = readHotSeatFromUrl();

export function App() {
  return hotSeat ? <HotSeatScreen /> : <BoardScreen />;
}

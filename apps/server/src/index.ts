import { mkdirSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname } from 'node:path';
import cors from 'cors';
import express from 'express';
import { Server } from 'socket.io';
import { HEX_COUNT } from '@tierra-austral/engine';
import { registerHandlers, type GameServer } from './handlers.js';
import { MAX_MESSAGE_BYTES } from './limits.js';
import { registerDevRoutes } from './devRoutes.js';
import { sqliteStore } from './persistence.js';
import { restoreRooms, sweepIdleRooms, useStore } from './rooms.js';

const PORT = Number(process.env['PORT'] ?? 3001);
const WEB_ORIGIN = process.env['WEB_ORIGIN'] ?? 'http://localhost:5173';
/** Where the games live between restarts. */
const DB_PATH = process.env['DB_PATH'] ?? './data/tierra-austral.db';
/** Rooms nobody has touched for a day are swept (SPEC.md §7.1). */
const ROOM_TTL_MS = 24 * 60 * 60 * 1000;
const SWEEP_EVERY_MS = 60 * 60 * 1000;

const app = express();
app.use(cors({ origin: WEB_ORIGIN }));

app.get('/health', (_req, res) => {
  res.json({ ok: true, hexes: HEX_COUNT });
});

// Fixtures for looking at the end of a game without playing one. Never in
// production.
if (registerDevRoutes(app, WEB_ORIGIN)) {
  console.log('dev routes on: GET /dev/fixture');
}

const httpServer = createServer(app);

const io: GameServer = new Server(httpServer, {
  cors: { origin: WEB_ORIGIN },
  // A client cannot make the server allocate more than this per message.
  maxHttpBufferSize: MAX_MESSAGE_BYTES,
});

// Persistence first: rooms come back before anybody can connect to them.
mkdirSync(dirname(DB_PATH), { recursive: true });
useStore(sqliteStore(DB_PATH));
const restored = restoreRooms();
console.log(
  `restored ${restored.restored} room(s) from ${DB_PATH}` +
    (restored.failed.length > 0 ? `, dropped ${restored.failed.length} that would not replay` : ''),
);

const sweep = setInterval(() => {
  const dropped = sweepIdleRooms(ROOM_TTL_MS);
  if (dropped.length > 0) console.log(`swept ${dropped.length} idle room(s)`);
}, SWEEP_EVERY_MS);
sweep.unref();

registerHandlers(io);

httpServer.listen(PORT, () => {
  console.log(`server listening on http://localhost:${PORT}`);
});

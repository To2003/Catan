import { createServer } from 'node:http';
import cors from 'cors';
import express from 'express';
import { Server } from 'socket.io';
import { HEX_COUNT } from '@tierra-austral/engine';
import { registerHandlers, type GameServer } from './handlers.js';
import { MAX_MESSAGE_BYTES } from './limits.js';

const PORT = Number(process.env['PORT'] ?? 3001);
const WEB_ORIGIN = process.env['WEB_ORIGIN'] ?? 'http://localhost:5173';

const app = express();
app.use(cors({ origin: WEB_ORIGIN }));

app.get('/health', (_req, res) => {
  res.json({ ok: true, hexes: HEX_COUNT });
});

const httpServer = createServer(app);

const io: GameServer = new Server(httpServer, {
  cors: { origin: WEB_ORIGIN },
  // A client cannot make the server allocate more than this per message.
  maxHttpBufferSize: MAX_MESSAGE_BYTES,
});

registerHandlers(io);

httpServer.listen(PORT, () => {
  console.log(`server listening on http://localhost:${PORT}`);
});

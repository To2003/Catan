import { createServer } from 'node:http';
import cors from 'cors';
import express from 'express';
import { Server } from 'socket.io';
import { HEX_COUNT } from '@tierra-austral/engine';

const PORT = Number(process.env['PORT'] ?? 3001);
const WEB_ORIGIN = process.env['WEB_ORIGIN'] ?? 'http://localhost:5173';

const app = express();
app.use(cors({ origin: WEB_ORIGIN }));

app.get('/health', (_req, res) => {
  res.json({ ok: true, hexes: HEX_COUNT });
});

const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: { origin: WEB_ORIGIN },
});

// Room and game handlers arrive in M6. For now we only prove the socket is up.
io.on('connection', (socket) => {
  console.log(`socket connected: ${socket.id}`);
  socket.on('disconnect', (reason) => {
    console.log(`socket disconnected: ${socket.id} (${reason})`);
  });
});

httpServer.listen(PORT, () => {
  console.log(`server listening on http://localhost:${PORT}`);
});

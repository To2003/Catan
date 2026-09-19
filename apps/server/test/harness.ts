import { createServer, type Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import { io as connect, type Socket } from 'socket.io-client';
import type { PlayerView } from '@tierra-austral/engine';
import { registerHandlers, type GameServer } from '../src/handlers.js';
import { MAX_MESSAGE_BYTES } from '../src/limits.js';
import { resetRooms } from '../src/rooms.js';
import type { ErrorPayload, RoomState } from '../src/protocol.js';

/**
 * A real server on an ephemeral port with real socket.io clients.
 *
 * Nothing is stubbed: these tests go over a socket, so what they exercise is
 * the protocol as a client actually meets it — including the parts that only
 * exist on the wire, like a payload whose types are a lie.
 */

export interface TestClient {
  readonly socket: Socket;
  readonly name: string;
  playerId?: string;
  token?: string;
  room?: RoomState;
  view?: PlayerView;
  readonly errors: ErrorPayload[];
  readonly events: unknown[];
  /** Everything this client was ever sent, for the secret-leak checks. */
  readonly received: { event: string; payload: unknown }[];
}

export interface Harness {
  readonly url: string;
  readonly io: GameServer;
  connect(name: string): Promise<TestClient>;
  close(): Promise<void>;
}

export const startHarness = async (): Promise<Harness> => {
  resetRooms();

  const httpServer: HttpServer = createServer();
  const io: GameServer = new Server(httpServer, { maxHttpBufferSize: MAX_MESSAGE_BYTES });
  registerHandlers(io);

  await new Promise<void>((resolve) => {
    httpServer.listen(0, resolve);
  });
  const address = httpServer.address();
  if (address === null || typeof address === 'string') throw new Error('no port');
  const url = `http://localhost:${address.port}`;

  const clients: TestClient[] = [];

  return {
    url,
    io,
    async connect(name: string): Promise<TestClient> {
      const socket = connect(url, { transports: ['websocket'], forceNew: true });
      const client: TestClient = { socket, name, errors: [], events: [], received: [] };

      socket.onAny((event: string, payload: unknown) => {
        client.received.push({ event, payload });
      });
      socket.on('session', (payload: { playerId: string; token: string }) => {
        client.playerId = payload.playerId;
        client.token = payload.token;
      });
      socket.on('room:state', (state: RoomState) => {
        client.room = state;
      });
      socket.on('game:state', (view: PlayerView) => {
        client.view = view;
      });
      socket.on('game:events', (events: unknown[]) => {
        client.events.push(...events);
      });
      socket.on('game:error', (error: ErrorPayload) => {
        client.errors.push(error);
      });

      await new Promise<void>((resolve, reject) => {
        socket.once('connect', resolve);
        socket.once('connect_error', reject);
      });

      clients.push(client);
      return client;
    },
    async close(): Promise<void> {
      for (const client of clients) client.socket.disconnect();
      await io.close();
      await new Promise<void>((resolve) => {
        httpServer.close(() => {
          resolve();
        });
      });
      resetRooms();
    },
  };
};

/** Waits for a condition the server will reach on its own. */
export const until = async (
  check: () => boolean,
  what = 'condition',
  timeoutMs = 5000,
): Promise<void> => {
  const started = Date.now();
  while (!check()) {
    if (Date.now() - started > timeoutMs) throw new Error(`timed out waiting for ${what}`);
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
};

/** Creates a room and gets three players seated, coloured and ready. */
export const seatThree = async (
  harness: Harness,
): Promise<{ host: TestClient; second: TestClient; third: TestClient; code: string }> => {
  const host = await harness.connect('Ana');
  host.socket.emit('room:create', { name: 'Ana' });
  await until(() => host.room !== undefined, 'the room');
  const code = host.room?.code ?? '';

  const second = await harness.connect('Bruno');
  second.socket.emit('room:join', { code, name: 'Bruno' });
  await until(() => second.room !== undefined, 'Bruno seated');

  const third = await harness.connect('Cata');
  third.socket.emit('room:join', { code, name: 'Cata' });
  await until(() => third.room !== undefined, 'Cata seated');

  host.socket.emit('room:setColor', { color: 'celeste' });
  second.socket.emit('room:setColor', { color: 'bordo' });
  third.socket.emit('room:setColor', { color: 'verde' });
  host.socket.emit('room:ready', { ready: true });
  second.socket.emit('room:ready', { ready: true });
  third.socket.emit('room:ready', { ready: true });

  await until(
    () => (host.room?.seats ?? []).every((seat) => seat.ready && seat.color !== undefined),
    'everyone ready',
  );

  return { host, second, third, code };
};

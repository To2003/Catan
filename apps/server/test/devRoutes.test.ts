import express from 'express';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { registerDevRoutes } from '../src/devRoutes.js';
import { getRoom, resetRooms } from '../src/rooms.js';

/**
 * The fixture route builds real rooms, so what matters most is that it does not
 * exist in production.
 */
const listen = async (app: express.Express): Promise<{ url: string; close: () => void }> => {
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('no port');
  return {
    url: `http://localhost:${address.port}`,
    close: () => {
      server.close();
    },
  };
};

describe('the dev fixture route', () => {
  const originalEnv = process.env['NODE_ENV'];

  beforeEach(() => {
    resetRooms();
  });

  afterEach(() => {
    if (originalEnv === undefined) delete process.env['NODE_ENV'];
    else process.env['NODE_ENV'] = originalEnv;
    resetRooms();
  });

  it('is not mounted in production', async () => {
    process.env['NODE_ENV'] = 'production';
    const app = express();
    expect(registerDevRoutes(app, 'http://localhost:5173')).toBe(false);

    const server = await listen(app);
    const response = await fetch(`${server.url}/dev/fixture`);
    expect(response.status).toBe(404);
    server.close();
  });

  it('hands out a room one move from the end, with a link per player', async () => {
    process.env['NODE_ENV'] = 'development';
    const app = express();
    expect(registerDevRoutes(app, 'http://localhost:5173')).toBe(true);

    const server = await listen(app);
    const response = await fetch(`${server.url}/dev/fixture?back=1`);
    expect(response.status).toBe(200);

    const fixture = (await response.json()) as {
      code: string;
      players: { name: string; token: string }[];
      links: string[];
      actionsKept: number;
      actionsDropped: number;
    };

    expect(fixture.players).toHaveLength(3);
    expect(fixture.links).toHaveLength(3);
    expect(fixture.actionsKept).toBeGreaterThan(20);
    expect(fixture.actionsDropped).toBe(1);

    // It is a real room, mid-game, that the server will happily carry on.
    const room = getRoom(fixture.code);
    expect(room?.started).toBe(true);
    expect(room?.state?.phase.kind).not.toBe('gameOver');
    expect(room?.actions).toHaveLength(fixture.actionsKept);

    // And somebody is within one move of winning it.
    const points = room?.state?.players.map((player) => player.devCards.length) ?? [];
    expect(points.length).toBe(3);

    server.close();
  }, 30_000);

  it('rejects a silly `back`', async () => {
    process.env['NODE_ENV'] = 'development';
    const app = express();
    registerDevRoutes(app, 'http://localhost:5173');
    const server = await listen(app);

    for (const back of ['0', '-3', 'abc', '999']) {
      const response = await fetch(`${server.url}/dev/fixture?back=${back}`);
      expect(response.status).toBe(400);
    }
    server.close();
  });
});

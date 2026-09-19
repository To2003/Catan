import type { Express } from 'express';
import { createFixtureRoom } from './devFixture.js';

/**
 * Development-only routes.
 *
 * They create real rooms out of thin air, so they must never exist in
 * production: `registerDevRoutes` refuses to mount when NODE_ENV says
 * production, and a test pins that it answers 404 there.
 */
export const isProduction = (): boolean => process.env['NODE_ENV'] === 'production';

export const registerDevRoutes = (app: Express, webOrigin: string): boolean => {
  if (isProduction()) return false;

  app.get('/dev/fixture', (request, response) => {
    const back = Number(request.query['back'] ?? 1);
    if (!Number.isInteger(back) || back < 1 || back > 50) {
      response.status(400).json({ error: 'back must be an integer between 1 and 50' });
      return;
    }

    try {
      const fixture = createFixtureRoom(back);
      response.json({
        ...fixture,
        // One link per player: open each in its own incognito window.
        links: fixture.players.map(
          (player) =>
            `${webOrigin}/?room=${fixture.code}&token=${player.token}&name=${encodeURIComponent(
              player.name,
            )}`,
        ),
      });
    } catch (error) {
      response.status(500).json({ error: String(error) });
    }
  });

  return true;
};

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { PlayerView } from '@tierra-austral/engine';
import { seatThree, startHarness, until, type Harness, type TestClient } from './harness.js';

describe('a game over the socket', () => {
  let harness: Harness;

  beforeEach(async () => {
    harness = await startHarness();
  });

  afterEach(async () => {
    await harness.close();
  });

  it('seats three players, starts, and plays the whole setup', async () => {
    const { host, second, third } = await seatThree(harness);
    const players = [host, second, third];

    host.socket.emit('room:start');
    await until(() => players.every((client) => client.view !== undefined), 'the first views');

    // Every client sees the same board and its own seat.
    for (const client of players) {
      expect(client.view?.you).toBe(client.playerId);
      expect(client.view?.board.hexIds).toHaveLength(19);
      expect(client.view?.phase).toMatchObject({ kind: 'setup' });
    }

    const clientFor = (playerId: string): TestClient => {
      const found = players.find((client) => client.playerId === playerId);
      if (!found) throw new Error(`no client for ${playerId}`);
      return found;
    };

    // Play setup following the legal moves the server ships in the view.
    for (let step = 0; step < 24; step += 1) {
      const view = host.view as PlayerView;
      if (view.phase.kind !== 'setup') break;

      const client = clientFor(view.currentPlayer);
      const moves = (client.view as PlayerView).legalMoves;
      const before = client.view?.version ?? 0;

      if (view.phase.step === 'settlement') {
        const vertex = moves.settlements[Math.floor(moves.settlements.length / 2)];
        client.socket.emit('game:action', {
          action: { type: 'placeSettlement', vertex },
          expectedVersion: before,
        });
      } else {
        const edge = moves.roads[0];
        client.socket.emit('game:action', {
          action: { type: 'placeRoad', edge },
          expectedVersion: before,
        });
      }

      await until(() => (host.view?.version ?? 0) > before, `action ${step} to land`);
    }

    expect(host.view?.phase).toEqual({ kind: 'preRoll' });
    expect(Object.keys(host.view?.buildings ?? {})).toHaveLength(6);
    for (const client of players) {
      expect(client.errors).toEqual([]);
    }
  });

  it('gives each player their own legal moves, and nobody else’s cards', async () => {
    const { host, second, third } = await seatThree(harness);
    host.socket.emit('room:start');
    await until(() => host.view !== undefined && second.view !== undefined, 'views');

    const active = host.view?.currentPlayer;
    const waiting = [host, second, third].find((client) => client.playerId !== active);
    expect(waiting?.view?.legalMoves.settlements).toEqual([]);

    // A view never carries another hand.
    const json = JSON.stringify(host.view);
    expect(json).not.toContain('"rngState"');
    expect(json).not.toContain('"seed"');
    expect(json).not.toContain('"devDeck"');
  });

  it('rejects a stale version from the active player', async () => {
    const { host, second, third } = await seatThree(harness);
    const players = [host, second, third];
    host.socket.emit('room:start');
    await until(() => players.every((client) => client.view !== undefined), 'views');

    const active = players.find((client) => client.playerId === host.view?.currentPlayer);
    const moves = active?.view?.legalMoves;
    active?.socket.emit('game:action', {
      action: { type: 'placeSettlement', vertex: moves?.settlements[0] },
      expectedVersion: 999,
    });

    await until(() => (active?.errors.length ?? 0) > 0, 'the rejection');
    expect(active?.errors[0]?.code).toBe('STALE_STATE');
  });
});

/** Any valid discard of exactly what this client owes. */
const pickDiscard = (client: TestClient): Record<string, number> => {
  const owed = client.view?.legalMoves.discardOwed ?? 0;
  const cards: Record<string, number> = {};
  let left = owed;
  for (const [resource, held] of Object.entries(client.view?.me.resources ?? {})) {
    const take = Math.min(left, held);
    if (take > 0) cards[resource] = take;
    left -= take;
  }
  return cards;
};

describe('simultaneous discards', () => {
  let harness: Harness;

  beforeEach(async () => {
    harness = await startHarness();
  });

  afterEach(async () => {
    await harness.close();
  });

  it(
    'accepts both, even though the second one carries a version that just changed',
    { timeout: 60_000 },
    async () => {
      const { host, second, third } = await seatThree(harness);
      const players = [host, second, third];
      host.socket.emit('room:start');
      await until(() => players.every((client) => client.view !== undefined), 'views');

      // Drive the game to a discard: play setup, then roll until a seven lands
      // with enough cards on the table. Rather than wait for one, the test hands
      // the room a seven by rolling repeatedly — the engine decides when.
      for (let step = 0; step < 24; step += 1) {
        const view = host.view as PlayerView;
        if (view.phase.kind !== 'setup') break;
        const client = players.find((candidate) => candidate.playerId === view.currentPlayer);
        const moves = (client?.view as PlayerView).legalMoves;
        const before = client?.view?.version ?? 0;
        const action =
          view.phase.step === 'settlement'
            ? {
                type: 'placeSettlement',
                vertex: moves.settlements[Math.floor(moves.settlements.length / 2)],
              }
            : { type: 'placeRoad', edge: moves.roads[0] };
        client?.socket.emit('game:action', { action, expectedVersion: before });
        await until(() => (host.view?.version ?? 0) > before, `setup step ${step}`);
      }

      // Give everybody cards by rolling; stop as soon as two players owe a
      // discard. How long that takes is up to the dice, so the cap is generous
      // and the test says so if it never got there.
      let rolls = 0;
      while (rolls < 250) {
        const view = host.view as PlayerView;
        if (view.phase.kind === 'discard' && Object.keys(view.phase.pending).length >= 2) break;

        // A seven with a single player over the limit is not the case under
        // test: resolve it and keep rolling until two of them owe at once.
        if (view.phase.kind === 'discard') {
          const [playerId] = Object.keys(view.phase.pending);
          const client = players.find((candidate) => candidate.playerId === playerId);
          if (!client?.view) break;
          const before = client.view.version;
          client.socket.emit('game:action', {
            action: { type: 'discard', cards: pickDiscard(client) },
            expectedVersion: before,
          });
          await until(() => host.view?.phase.kind !== 'discard', `single discard ${rolls}`);
          rolls += 1;
          continue;
        }

        const client = players.find((candidate) => candidate.playerId === view.currentPlayer);
        if (!client?.view) break;
        const before = client.view.version;
        const action =
          view.phase.kind === 'preRoll'
            ? { type: 'rollDice' }
            : view.phase.kind === 'main'
              ? { type: 'endTurn' }
              : view.phase.kind === 'moveRobber'
                ? { type: 'moveRobber', hex: client.view.legalMoves.robberHexes[0] }
                : view.phase.kind === 'steal'
                  ? { type: 'steal', target: client.view.legalMoves.stealTargets[0] }
                  : undefined;
        if (!action) break;
        client.socket.emit('game:action', { action, expectedVersion: before });
        await until(() => (host.view?.version ?? 0) > before, `roll ${rolls}`);
        rolls += 1;
      }

      const view = host.view as PlayerView;
      expect(view.phase.kind, 'the run never reached a discard').toBe('discard');
      if (view.phase.kind !== 'discard') return;

      const owing = Object.keys(view.phase.pending);
      expect(owing.length).toBeGreaterThanOrEqual(2);

      // Both discard without waiting for the other, both carrying the version
      // they last saw. The second one's version is stale by the time it lands.
      const version = view.version;
      const discards = owing.map((playerId) => {
        const client = players.find((candidate) => candidate.playerId === playerId);
        return { client, cards: client ? pickDiscard(client) : {} };
      });

      for (const { client, cards } of discards) {
        client?.socket.emit('game:action', {
          action: { type: 'discard', cards },
          expectedVersion: version,
        });
      }

      await until(() => host.view?.phase.kind !== 'discard', 'the discards to resolve');

      // Nobody was told their valid discard was stale.
      for (const client of players) {
        expect(client.errors.map((error) => error.code)).not.toContain('STALE_STATE');
      }
    },
  );
});

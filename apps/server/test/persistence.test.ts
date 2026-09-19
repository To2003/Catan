import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { PlayerView } from '@tierra-austral/engine';
import { seatThree, startHarness, until, type Harness, type TestClient } from './harness.js';

/**
 * Restarting the server in the middle of a game.
 *
 * What is stored is `seed + actions`, so coming back is a replay: the restored
 * game cannot disagree with the rules, because it is produced by them.
 */
describe('surviving a restart', () => {
  let directory: string;
  let db: string;
  let harness: Harness;

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'tierra-austral-'));
    db = join(directory, 'test.db');
  });

  afterEach(async () => {
    await harness.close();
    rmSync(directory, { recursive: true, force: true });
  });

  it('brings the room and the board back, and the players reconnect into it', async () => {
    harness = await startHarness({ db });
    const { host, second, third, code } = await seatThree(harness);
    const players = [host, second, third];
    host.socket.emit('room:start');
    await until(() => players.every((client) => client.view !== undefined), 'views');

    const clientFor = (playerId: string): TestClient => {
      const found = players.find((client) => client.playerId === playerId);
      if (!found) throw new Error('no client');
      return found;
    };

    // Play a few setup placements, so there is history to replay.
    for (let step = 0; step < 6; step += 1) {
      const view = host.view as PlayerView;
      if (view.phase.kind !== 'setup') break;
      const client = clientFor(view.currentPlayer);
      const moves = (client.view as PlayerView).legalMoves;
      const before = client.view?.version ?? 0;
      const action =
        view.phase.step === 'settlement'
          ? {
              type: 'placeSettlement',
              vertex: moves.settlements[Math.floor(moves.settlements.length / 2)],
            }
          : { type: 'placeRoad', edge: moves.roads[0] };
      client.socket.emit('game:action', { action, expectedVersion: before });
      await until(() => (host.view?.version ?? 0) > before, `setup ${step}`);
    }

    const beforeRestart = host.view as PlayerView;
    const tokens = players.map((client) => ({ client, token: client.token }));

    // The server goes down and comes back up on the same database.
    await harness.close();
    harness = await startHarness({ db });

    const back: TestClient[] = [];
    for (const { client, token } of tokens) {
      const reconnected = await harness.connect(client.name);
      reconnected.socket.emit('room:join', { code, name: client.name, token });
      await until(() => reconnected.view !== undefined, `${client.name} back in`);
      back.push(reconnected);
    }

    const afterRestart = back[0]?.view as PlayerView;
    expect(afterRestart.version).toBe(beforeRestart.version);
    expect(afterRestart.buildings).toEqual(beforeRestart.buildings);
    expect(afterRestart.roads).toEqual(beforeRestart.roads);
    expect(afterRestart.currentPlayer).toBe(beforeRestart.currentPlayer);
    expect(afterRestart.board.hexes).toEqual(beforeRestart.board.hexes);

    // And the game carries on from there.
    const clientForBack = back.find((client) => client.playerId === afterRestart.currentPlayer);
    const moves = clientForBack?.view?.legalMoves;
    const before = clientForBack?.view?.version ?? 0;
    const action =
      afterRestart.phase.kind === 'setup' && afterRestart.phase.step === 'settlement'
        ? { type: 'placeSettlement', vertex: moves?.settlements[0] }
        : { type: 'placeRoad', edge: moves?.roads[0] };
    clientForBack?.socket.emit('game:action', { action, expectedVersion: before });
    await until(() => (clientForBack?.view?.version ?? 0) > before, 'a move after the restart');
  });

  it('keeps a lobby that had not started yet', async () => {
    harness = await startHarness({ db });
    const { host, code } = await seatThree(harness);
    expect(host.room?.seats).toHaveLength(3);

    await harness.close();
    harness = await startHarness({ db });

    const back = await harness.connect('Ana');
    back.socket.emit('room:join', { code, name: 'Ana', token: host.token });
    await until(() => back.room !== undefined, 'the lobby back');

    expect(back.room?.seats).toHaveLength(3);
    expect(back.room?.started).toBe(false);
    expect(back.playerId).toBe(host.playerId);
  });
});

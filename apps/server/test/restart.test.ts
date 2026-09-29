import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { PlayerView } from '@tierra-austral/engine';
import { seatThree, startHarness, until, type Harness, type TestClient } from './harness.js';

/**
 * Starting over.
 *
 * Two different situations, deliberately: in the lobby nothing has happened
 * yet, so the host just draws another board; once a game is running, ending it
 * takes everybody who is present agreeing.
 */
describe('a different board, before anybody starts', () => {
  let harness: Harness;

  beforeEach(async () => {
    harness = await startHarness();
  });

  afterEach(async () => {
    await harness.close();
  });

  it('is the host’s to reroll, and everybody sees the same one', async () => {
    const { host, second, third } = await seatThree(harness);
    const first = host.room?.previewSeed;
    expect(first).toBeGreaterThan(0);
    expect(second.room?.previewSeed).toBe(first);

    host.socket.emit('room:newBoard');
    await until(() => host.room?.previewSeed !== first, 'the new board');

    const rerolled = host.room?.previewSeed;
    await until(() => second.room?.previewSeed === rerolled, 'the others to see it');
    expect(third.room?.previewSeed).toBe(rerolled);

    // And the game starts on the board they were looking at.
    host.socket.emit('room:start');
    await until(() => host.view !== undefined, 'the game');
    expect(host.room?.started).toBe(true);
  });

  it('is refused to everybody else', async () => {
    const { second } = await seatThree(harness);
    second.socket.emit('room:newBoard');
    await until(() => second.errors.length > 0, 'the refusal');
    expect(second.errors.map((error) => error.code)).toContain('NOT_HOST');
  });
});

describe('voting to restart a game in progress', () => {
  let harness: Harness;
  let players: TestClient[];
  let host: TestClient;

  const started = async (): Promise<void> => {
    const seated = await seatThree(harness);
    host = seated.host;
    players = [seated.host, seated.second, seated.third];
    host.socket.emit('room:start');
    await until(() => players.every((client) => client.view !== undefined), 'views');
  };

  beforeEach(async () => {
    harness = await startHarness();
    await started();
  });

  afterEach(async () => {
    await harness.close();
  });

  it('is cancelled by a single no, and the proposer has to wait', async () => {
    const [ana, bruno, cata] = players as [TestClient, TestClient, TestClient];
    const boardBefore = (ana.view as PlayerView).board.hexes;

    ana.socket.emit('room:proposeRestart');
    await until(() => ana.room?.restartVote !== undefined, 'the vote to open');

    const vote = ana.room?.restartVote;
    expect(vote?.by).toBe(ana.playerId);
    // Proposing counts as a yes; the other two are still to answer.
    expect(vote?.votes[ana.playerId ?? '']).toBe('yes');
    expect(vote?.needed).toHaveLength(3);

    bruno.socket.emit('room:voteRestart', { approve: true });
    await until(() => ana.room?.restartVote?.votes[bruno.playerId ?? ''] === 'yes', 'the yes');

    cata.socket.emit('room:voteRestart', { approve: false });
    await until(() => ana.room?.restartVote === undefined, 'the vote to close');

    // Nothing restarted: same board, same game.
    expect((ana.view as PlayerView).board.hexes).toEqual(boardBefore);
    expect(ana.room?.gamesPlayed).toBe(0);

    // And Ana cannot ask again for a while.
    const until5Minutes = ana.room?.restartCooldown[ana.playerId ?? ''] ?? 0;
    expect(until5Minutes).toBeGreaterThan(Date.now());

    ana.socket.emit('room:proposeRestart');
    await until(() => ana.errors.length > 0, 'the cooldown refusal');
    expect(ana.errors.map((error) => error.code)).toContain('ON_COOLDOWN');
  });

  it('restarts when everybody present says yes, and keeps the old game', async () => {
    const [ana, bruno, cata] = players as [TestClient, TestClient, TestClient];

    // Play one action, so the game being replaced has some history.
    const active = players.find((client) => client.playerId === ana.view?.currentPlayer);
    const moves = active?.view?.legalMoves;
    const before = active?.view?.version ?? 0;
    active?.socket.emit('game:action', {
      action: { type: 'placeSettlement', vertex: moves?.settlements[0] },
      expectedVersion: before,
    });
    await until(() => (ana.view?.version ?? 0) > before, 'the first placement');

    const boardBefore = JSON.stringify((ana.view as PlayerView).board.hexes);

    bruno.socket.emit('room:proposeRestart');
    await until(() => ana.room?.restartVote !== undefined, 'the vote');

    ana.socket.emit('room:voteRestart', { approve: true });
    cata.socket.emit('room:voteRestart', { approve: true });

    await until(() => (ana.room?.gamesPlayed ?? 0) === 1, 'the restart');

    // A brand new game: fresh board, empty history, same seats.
    expect(ana.view?.version).toBe(0);
    expect(JSON.stringify((ana.view as PlayerView).board.hexes)).not.toBe(boardBefore);
    expect(ana.view?.phase).toMatchObject({ kind: 'setup' });
    expect(ana.room?.seats).toHaveLength(3);
    expect(ana.room?.restartVote).toBeUndefined();

    // Everybody is in the same new game.
    for (const client of players) {
      expect(client.view?.board.hexIds).toHaveLength(19);
      expect(client.view?.version).toBe(0);
    }
  });

  it('refuses a second vote while one is open, and a vote from nowhere', async () => {
    const [ana, bruno] = players as [TestClient, TestClient];

    ana.socket.emit('room:proposeRestart');
    await until(() => ana.room?.restartVote !== undefined, 'the vote');

    bruno.socket.emit('room:proposeRestart');
    await until(() => bruno.errors.length > 0, 'the refusal');
    expect(bruno.errors.map((error) => error.code)).toContain('VOTE_OPEN');

    bruno.socket.emit('room:voteRestart', { approve: true });
    await until(() => ana.room?.restartVote?.votes[bruno.playerId ?? ''] === 'yes', 'the vote');

    bruno.socket.emit('room:voteRestart', { approve: false });
    await until(() => bruno.errors.length > 1, 'the second refusal');
    expect(bruno.errors.map((error) => error.code)).toContain('ALREADY_VOTED');
  });

  it('lets the game carry on while the vote is open', async () => {
    const ana = players[0] as TestClient;
    ana.socket.emit('room:proposeRestart');
    await until(() => ana.room?.restartVote !== undefined, 'the vote');

    const active = players.find((client) => client.playerId === ana.view?.currentPlayer);
    const before = active?.view?.version ?? 0;
    active?.socket.emit('game:action', {
      action: { type: 'placeSettlement', vertex: active.view?.legalMoves.settlements[0] },
      expectedVersion: before,
    });

    await until(() => (ana.view?.version ?? 0) > before, 'a move during the vote');
    expect(ana.room?.restartVote).toBeDefined();
  });
});

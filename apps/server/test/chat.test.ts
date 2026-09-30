import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { seatThree, startHarness, until, type Harness, type TestClient } from './harness.js';

/**
 * The chat belongs to the room, not to the game.
 *
 * Everything here is one claim in different clothes: the conversation is the
 * same conversation before the game, during it, after a restart and after a
 * reconnection, because the people talking are the same people.
 */

const saidBy = (client: TestClient, text: string): boolean =>
  client.chat.some((line) => line.kind === 'player' && line.text === text);

describe('a room-wide conversation', () => {
  let harness: Harness;

  beforeEach(async () => {
    harness = await startHarness();
  });

  afterEach(async () => {
    await harness.close();
  });

  it('carries a lobby message into the game', async () => {
    const { host, second, third } = await seatThree(harness);

    second.socket.emit('chat:send', { text: 'arranco yo el trueque' });
    await until(() => saidBy(host, 'arranco yo el trueque'), 'the message');

    host.socket.emit('room:start');
    await until(() => host.view !== undefined, 'the game');

    // Nothing was cleared by the game starting.
    for (const client of [host, second, third]) {
      expect(saidBy(client, 'arranco yo el trueque'), client.name).toBe(true);
    }
  });

  it('resolves the sender from the session, not from the payload', async () => {
    const { host, second } = await seatThree(harness);

    // Signing a message with somebody else's name does not even get through
    // the schema, which takes the text and nothing else.
    second.socket.emit('chat:send', { text: 'no fui yo', from: host.playerId });
    await until(() => second.errors.length > 0, 'the refusal');
    expect(second.errors.map((error) => error.code)).toContain('BAD_PAYLOAD');
    expect(saidBy(host, 'no fui yo')).toBe(false);

    // And an ordinary message is signed by whoever's socket sent it.
    second.socket.emit('chat:send', { text: 'ahora sí' });
    await until(() => saidBy(host, 'ahora sí'), 'the message');
    expect(host.chat.find((message) => message.text === 'ahora sí')?.from).toBe(second.playerId);
  });

  it('gives a late arrival everything that was already said', async () => {
    const host = await harness.connect('Ana');
    host.socket.emit('room:create', { name: 'Ana' });
    await until(() => host.room !== undefined, 'the room');
    const code = host.room?.code ?? '';

    host.socket.emit('chat:send', { text: 'primero' });
    host.socket.emit('chat:send', { text: 'segundo' });
    await until(() => saidBy(host, 'segundo'), 'both messages');

    const late = await harness.connect('Bruno');
    late.socket.emit('room:join', { code, name: 'Bruno' });
    await until(() => late.histories > 0, 'the history');

    expect(late.chat.filter((line) => line.kind === 'player').map((line) => line.text)).toEqual([
      'primero',
      'segundo',
    ]);
  });

  it('keeps the conversation through a restart everybody agreed to', async () => {
    const { host, second, third } = await seatThree(harness);
    host.socket.emit('room:start');
    await until(() => host.view !== undefined, 'the game');

    host.socket.emit('chat:send', { text: 'esto quedó mal repartido' });
    await until(() => saidBy(third, 'esto quedó mal repartido'), 'the message');

    // A game with no moves in it is not archived, so play one first.
    const active = [host, second, third].find(
      (client) => client.playerId === host.view?.currentPlayer,
    );
    const version = active?.view?.version ?? 0;
    active?.socket.emit('game:action', {
      action: { type: 'placeSettlement', vertex: active.view?.legalMoves.settlements[0] },
      expectedVersion: version,
    });
    await until(() => (host.view?.version ?? 0) > version, 'the first placement');

    const before = host.room?.gamesPlayed ?? 0;
    host.socket.emit('room:proposeRestart');
    await until(() => host.room?.restartVote !== undefined, 'the vote');
    second.socket.emit('room:voteRestart', { approve: true });
    third.socket.emit('room:voteRestart', { approve: true });
    await until(() => (host.room?.gamesPlayed ?? 0) > before, 'the new game');

    for (const client of [host, second, third]) {
      expect(saidBy(client, 'esto quedó mal repartido'), client.name).toBe(true);
    }
  });

  it('marks who came and went, without an author', async () => {
    const { host } = await seatThree(harness);
    const system = host.chat.filter((line) => line.kind === 'system');

    expect(system.map((line) => line.text)).toContain('Bruno entró a la sala');
    expect(system.every((line) => line.from === undefined)).toBe(true);
  });

  it('numbers every line, so nothing arrives twice', async () => {
    const { host } = await seatThree(harness);
    host.socket.emit('chat:send', { text: 'uno' });
    await until(() => saidBy(host, 'uno'), 'the message');

    const ids = host.chat.map((line) => line.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect([...ids].sort((a, b) => a - b)).toEqual(ids);
  });
});

describe('a conversation that outlives the server', () => {
  let folder: string;
  let db: string;

  beforeEach(() => {
    folder = mkdtempSync(join(tmpdir(), 'tierra-chat-'));
    db = join(folder, 'chat.db');
  });

  afterEach(() => {
    rmSync(folder, { recursive: true, force: true });
  });

  it('comes back when a reconnecting player walks in with their token', async () => {
    const first = await startHarness({ db });
    const { host, second, code } = await seatThree(first);

    second.socket.emit('chat:send', { text: 'me tengo que ir un minuto' });
    await until(() => saidBy(host, 'me tengo que ir un minuto'), 'the message');
    const token = second.token;
    await first.close();

    // The free tier puts the server to sleep; this is what waking up looks
    // like. The room and its conversation are read back off disk.
    const second_ = await startHarness({ db });
    const back = await second_.connect('Bruno');
    back.socket.emit('room:join', { code, name: 'Bruno', token });
    await until(() => back.histories > 0, 'the history');

    expect(saidBy(back, 'me tengo que ir un minuto')).toBe(true);
    await second_.close();
  });
});

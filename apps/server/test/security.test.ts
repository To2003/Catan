import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { PlayerView } from '@tierra-austral/engine';
import { seatThree, startHarness, until, type Harness, type TestClient } from './harness.js';

const codesOf = (client: TestClient): string[] => client.errors.map((error) => error.code);

describe('identity', () => {
  let harness: Harness;

  beforeEach(async () => {
    harness = await startHarness();
  });

  afterEach(async () => {
    await harness.close();
  });

  it('ignores a playerId in the payload: it is a rejected message', async () => {
    const { host, second, third } = await seatThree(harness);
    const players = [host, second, third];
    host.socket.emit('room:start');
    await until(() => players.every((client) => client.view !== undefined), 'views');

    const active = players.find((client) => client.playerId === host.view?.currentPlayer);
    const waiting = players.find((client) => client.playerId !== host.view?.currentPlayer);
    if (!active || !waiting) throw new Error('no players');

    const vertex = active.view?.legalMoves.settlements[0];
    const version = active.view?.version ?? 0;

    // Somebody who is not on turn, claiming to be somebody who is.
    waiting.socket.emit('game:action', {
      action: { type: 'placeSettlement', vertex },
      expectedVersion: version,
      playerId: active.playerId,
    });

    await until(() => waiting.errors.length > 0, 'the rejection');
    expect(codesOf(waiting)).toContain('BAD_PAYLOAD');
    expect(host.view?.version).toBe(version);
    expect(Object.keys(host.view?.buildings ?? {})).toHaveLength(0);
  });

  it('refuses a well-formed action from somebody who is not on turn', async () => {
    const { host, second, third } = await seatThree(harness);
    const players = [host, second, third];
    host.socket.emit('room:start');
    await until(() => players.every((client) => client.view !== undefined), 'views');

    const active = host.view?.currentPlayer;
    const waiting = players.find((client) => client.playerId !== active);
    const vertex = players.find((client) => client.playerId === active)?.view?.legalMoves
      .settlements[0];

    waiting?.socket.emit('game:action', {
      action: { type: 'placeSettlement', vertex },
      expectedVersion: waiting.view?.version ?? 0,
    });

    await until(() => (waiting?.errors.length ?? 0) > 0, 'the rejection');
    expect(codesOf(waiting as TestClient)).toContain('NOT_YOUR_TURN');
  });

  it('refuses to act for a socket with no session at all', async () => {
    const stranger = await harness.connect('Eva');
    stranger.socket.emit('game:action', {
      action: { type: 'rollDice' },
      expectedVersion: 0,
    });
    await until(() => stranger.errors.length > 0, 'the rejection');
    expect(codesOf(stranger)).toContain('NO_SESSION');
  });

  it('refuses to act in a room the client is not in', async () => {
    const { host, second, third } = await seatThree(harness);
    host.socket.emit('room:start');
    await until(() => host.view !== undefined, 'the game');

    // Eva opens her own room, then tries to play in the first one. She has a
    // session, just not that room's.
    const eva = await harness.connect('Eva');
    eva.socket.emit('room:create', { name: 'Eva' });
    await until(() => eva.room !== undefined, 'her own room');

    eva.socket.emit('game:action', { action: { type: 'rollDice' }, expectedVersion: 0 });
    await until(() => eva.errors.length > 0, 'the rejection');
    expect(codesOf(eva)).toContain('GAME_NOT_STARTED');

    // And the other room did not move.
    expect(host.view?.version).toBe(0);
    expect([second, third].every((client) => client.errors.length === 0)).toBe(true);
  });
});

describe('malformed payloads', () => {
  let harness: Harness;

  beforeEach(async () => {
    harness = await startHarness();
  });

  afterEach(async () => {
    await harness.close();
  });

  it('are rejected one by one, and the server keeps going', async () => {
    const { host, second, third } = await seatThree(harness);
    const players = [host, second, third];
    host.socket.emit('room:start');
    await until(() => players.every((client) => client.view !== undefined), 'views');

    const junk: unknown[] = [
      null,
      undefined,
      42,
      'rollDice',
      [],
      { action: null, expectedVersion: 0 },
      { action: { type: 'nonsense' }, expectedVersion: 0 },
      { action: { type: 'placeSettlement' }, expectedVersion: 0 },
      { action: { type: 'placeSettlement', vertex: 'nope' }, expectedVersion: 0 },
      { action: { type: 'placeSettlement', vertex: 'v1'.repeat(500) }, expectedVersion: 0 },
      { action: { type: 'discard', cards: { wood: 1.5 } }, expectedVersion: 0 },
      { action: { type: 'discard', cards: { wood: -1 } }, expectedVersion: 0 },
      { action: { type: 'discard', cards: { wood: Number.NaN } }, expectedVersion: 0 },
      { action: { type: 'discard', cards: { gold: 1 } }, expectedVersion: 0 },
      { action: { type: 'rollDice' } },
      { action: { type: 'rollDice' }, expectedVersion: -5 },
      { action: { type: 'rollDice' }, expectedVersion: 'zero' },
    ];

    for (const payload of junk) host.socket.emit('game:action', payload);
    await until(() => host.errors.length >= junk.length, 'every rejection');
    expect(host.errors.every((error) => error.code === 'BAD_PAYLOAD')).toBe(true);

    // Still alive, and still playing: the real proof.
    const active = players.find((client) => client.playerId === host.view?.currentPlayer);
    const vertex = active?.view?.legalMoves.settlements[0];
    const before = active?.view?.version ?? 0;
    active?.socket.emit('game:action', {
      action: { type: 'placeSettlement', vertex },
      expectedVersion: before,
    });
    await until(() => (host.view?.version ?? 0) > before, 'a good action after the junk');
  });

  it('are rejected in the lobby too, without taking the room with them', async () => {
    const host = await harness.connect('Ana');
    host.socket.emit('room:create', { name: 'Ana' });
    await until(() => host.room !== undefined, 'the room');

    host.socket.emit('room:setColor', { color: 'dorado' });
    host.socket.emit('room:ready', { ready: 'yes' });
    host.socket.emit('chat:send', { text: 'x'.repeat(5000) });
    host.socket.emit('room:join', { code: 'TOOLONGCODE', name: 'Ana' });

    await until(() => host.errors.length >= 4, 'the rejections');
    expect(host.errors.every((error) => error.code === 'BAD_PAYLOAD')).toBe(true);

    host.socket.emit('room:setColor', { color: 'celeste' });
    await until(() => host.room?.seats[0]?.color === 'celeste', 'a good colour after the junk');
  });
});

describe('secrets', () => {
  let harness: Harness;

  beforeEach(async () => {
    harness = await startHarness();
  });

  afterEach(async () => {
    await harness.close();
  });

  it('never sends a token to anybody but its owner', async () => {
    const { host, second, third } = await seatThree(harness);
    host.socket.emit('room:start');
    await until(() => [host, second, third].every((client) => client.view !== undefined), 'views');

    const tokens = [host.token, second.token, third.token].filter(
      (token): token is string => token !== undefined,
    );
    expect(tokens).toHaveLength(3);

    for (const client of [host, second, third]) {
      for (const { event, payload } of client.received) {
        const json = JSON.stringify(payload ?? null);
        for (const token of tokens) {
          if (token === client.token && event === 'session') continue;
          expect(json.includes(token), `${event} leaked a token to ${client.name}`).toBe(false);
        }
      }
    }
  });

  it('never sends the seed, the rng state or the deck to anybody', async () => {
    const { host, second, third } = await seatThree(harness);
    host.socket.emit('room:start');
    await until(() => [host, second, third].every((client) => client.view !== undefined), 'views');

    for (const client of [host, second, third]) {
      const json = JSON.stringify(client.received);
      expect(json).not.toContain('"seed"');
      expect(json).not.toContain('"rngState"');
      expect(json).not.toContain('"devDeck"');
    }
  });
});

describe('joining a game already under way', () => {
  let harness: Harness;

  beforeEach(async () => {
    harness = await startHarness();
  });

  afterEach(async () => {
    await harness.close();
  });

  it('is refused without a token, and with somebody else’s guess', async () => {
    const { host, code } = await seatThree(harness);
    host.socket.emit('room:start');
    await until(() => host.view !== undefined, 'the game');

    const walkIn = await harness.connect('Eva');
    walkIn.socket.emit('room:join', { code, name: 'Eva' });
    await until(() => walkIn.errors.length > 0, 'the refusal');
    expect(codesOf(walkIn)).toContain('GAME_IN_PROGRESS');

    const guesser = await harness.connect('Fede');
    guesser.socket.emit('room:join', {
      code,
      name: 'Fede',
      token: '00000000-0000-4000-8000-000000000000',
    });
    await until(() => guesser.errors.length > 0, 'the second refusal');
    expect(codesOf(guesser)).toContain('GAME_IN_PROGRESS');

    expect(host.room?.seats).toHaveLength(3);
  });

  it('lets the owner of a token come back to their seat', async () => {
    const { host, second, third, code } = await seatThree(harness);
    host.socket.emit('room:start');
    await until(() => [host, second, third].every((client) => client.view !== undefined), 'views');

    const token = second.token;
    const playerId = second.playerId;
    second.socket.disconnect();
    await until(
      () => host.room?.seats.some((seat) => seat.playerId === playerId && !seat.connected) === true,
      'the seat to go quiet',
    );

    const back = await harness.connect('Bruno');
    back.socket.emit('room:join', { code, name: 'Bruno', token });
    await until(() => back.view !== undefined, 'the state on return');

    expect(back.playerId).toBe(playerId);
    expect(back.view?.you).toBe(playerId);
    expect(host.room?.seats).toHaveLength(3);
    expect(host.room?.seats.find((seat) => seat.playerId === playerId)?.connected).toBe(true);
  });

  it('gives the seat to the newest tab when a token connects twice', async () => {
    const { host, second, third, code } = await seatThree(harness);
    host.socket.emit('room:start');
    await until(() => [host, second, third].every((client) => client.view !== undefined), 'views');

    let replaced = false;
    second.socket.on('session:replaced', () => {
      replaced = true;
    });

    const newTab = await harness.connect('Bruno');
    newTab.socket.emit('room:join', { code, name: 'Bruno', token: second.token });
    await until(() => newTab.view !== undefined, 'the new tab');
    await until(() => replaced, 'the old tab being told');

    expect(newTab.playerId).toBe(second.playerId);
    // The seat is connected, held by the newcomer.
    expect(host.room?.seats.find((seat) => seat.playerId === second.playerId)?.connected).toBe(
      true,
    );
  });

  it('passes the host role on when the host leaves', async () => {
    const { host, second, third } = await seatThree(harness);
    expect(host.room?.hostId).toBe(host.playerId);

    host.socket.disconnect();
    await until(() => second.room?.hostId !== host.playerId, 'the host to change');

    expect([second.playerId, third.playerId]).toContain(second.room?.hostId);
  });
});

describe('rate limiting', () => {
  let harness: Harness;

  beforeEach(async () => {
    harness = await startHarness();
  });

  afterEach(async () => {
    await harness.close();
  });

  it('stops a socket from flooding a room', async () => {
    const { host, second, third } = await seatThree(harness);
    host.socket.emit('room:start');
    await until(() => [host, second, third].every((client) => client.view !== undefined), 'views');

    const view = host.view as PlayerView;
    for (let i = 0; i < 60; i += 1) {
      host.socket.emit('game:action', {
        action: { type: 'rollDice' },
        expectedVersion: view.version,
      });
    }

    await until(() => codesOf(host).includes('RATE_LIMITED'), 'the limit to bite');
    expect(codesOf(host).filter((code) => code === 'RATE_LIMITED').length).toBeGreaterThan(0);
  });
});

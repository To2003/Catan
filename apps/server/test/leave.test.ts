import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getRoom } from '../src/rooms.js';
import { seatThree, startHarness, until, type Harness, type TestClient } from './harness.js';

/**
 * Walking out, which means two different things.
 *
 * Before the game starts a seat is just a chair, and somebody who leaves has
 * to stop being counted — otherwise the room waits forever for a player who
 * is not coming back. Once the game is running the seats are baked into the
 * state, so leaving is stepping away from the table and the chair stays.
 */
const left = async (client: TestClient): Promise<{ seatKept: boolean }> => {
  const before = client.received.length;
  client.socket.emit('room:leave');
  await until(
    () => client.received.slice(before).some((entry) => entry.event === 'room:left'),
    'the confirmation',
  );
  const entry = client.received.slice(before).find((item) => item.event === 'room:left');
  return entry?.payload as { seatKept: boolean };
};

describe('leaving the lobby', () => {
  let harness: Harness;

  beforeEach(async () => {
    harness = await startHarness();
  });

  afterEach(async () => {
    await harness.close();
  });

  it('gives the seat back, so the room stops waiting for you', async () => {
    const { host, second, third, code } = await seatThree(harness);

    expect(await left(third)).toEqual({ seatKept: false });
    await until(() => (host.room?.seats.length ?? 0) === 2, 'the seat to go');

    expect(host.room?.seats.map((seat) => seat.name)).toEqual(['Ana', 'Bruno']);
    expect(second.room?.seats).toHaveLength(2);
    expect(getRoom(code)?.seats).toHaveLength(2);
  });

  it('frees the colour for somebody else', async () => {
    const { host, third } = await seatThree(harness);
    // Cata is verde; when she goes, verde is free again.
    expect(host.room?.seats.some((seat) => seat.color === 'verde')).toBe(true);

    await left(third);
    await until(() => (host.room?.seats.length ?? 0) === 2, 'the seat to go');
    expect(host.room?.seats.some((seat) => seat.color === 'verde')).toBe(false);
  });

  it('hands the room over when the host is the one who goes', async () => {
    const { host, second, code } = await seatThree(harness);
    expect(host.room?.hostId).toBe(host.playerId);

    await left(host);
    await until(() => second.room?.hostId !== host.playerId, 'the new host');
    expect(getRoom(code)?.hostId).toBe(second.playerId);
  });

  it('says so in the room, without an author', async () => {
    const { host, third } = await seatThree(harness);
    await left(third);
    await until(
      () => host.chat.some((line) => line.text === 'Cata se fue de la sala'),
      'the system line',
    );
    expect(host.chat.find((line) => line.text === 'Cata se fue de la sala')?.from).toBeUndefined();
  });

  it('throws the room away once the last person walks out', async () => {
    const host = await harness.connect('Ana');
    host.socket.emit('room:create', { name: 'Ana' });
    await until(() => host.room !== undefined, 'the room');
    const code = host.room?.code ?? '';

    await left(host);
    expect(getRoom(code)).toBeUndefined();
  });

  it('lets you walk back in with the code', async () => {
    const { host, third, code } = await seatThree(harness);
    await left(third);
    await until(() => (host.room?.seats.length ?? 0) === 2, 'the seat to go');

    const again = await harness.connect('Cata');
    again.socket.emit('room:join', { code, name: 'Cata' });
    await until(() => again.room !== undefined, 'the seat back');
    expect(again.room?.seats).toHaveLength(3);
  });
});

describe('leaving a game in progress', () => {
  let harness: Harness;

  beforeEach(async () => {
    harness = await startHarness();
  });

  afterEach(async () => {
    await harness.close();
  });

  it('keeps the seat: the players are fixed once the game exists', async () => {
    const { host, second, third, code } = await seatThree(harness);
    host.socket.emit('room:start');
    await until(() => host.view !== undefined, 'the game');

    expect(await left(third)).toEqual({ seatKept: true });
    await until(
      () => host.room?.seats.find((seat) => seat.playerId === third.playerId)?.connected === false,
      'the seat to go quiet',
    );

    const seat = getRoom(code)?.seats.find((entry) => entry.playerId === third.playerId);
    expect(seat).toBeDefined();
    expect(seat?.connected).toBe(false);
    expect(second.view?.players).toHaveLength(3);
  });

  it('lets the same person come back with their token', async () => {
    const { host, third, code } = await seatThree(harness);
    host.socket.emit('room:start');
    await until(() => host.view !== undefined, 'the game');
    const token = third.token;

    await left(third);
    await until(
      () => host.room?.seats.find((seat) => seat.playerId === third.playerId)?.connected === false,
      'the seat to go quiet',
    );

    const back = await harness.connect('Cata');
    back.socket.emit('room:join', { code, name: 'Cata', token });
    await until(() => back.view !== undefined, 'the game back');
    expect(back.playerId).toBe(third.playerId);
  });
});

describe('leaving without a seat', () => {
  let harness: Harness;

  beforeEach(async () => {
    harness = await startHarness();
  });

  afterEach(async () => {
    await harness.close();
  });

  it('is refused to a socket that is not in a room', async () => {
    const stranger = await harness.connect('Nadie');
    stranger.socket.emit('room:leave');
    await until(() => stranger.errors.length > 0, 'the refusal');
    expect(stranger.errors.map((error) => error.code)).toContain('NO_SESSION');
  });

  it('does not let a second leave touch the room again', async () => {
    const { host, third, code } = await seatThree(harness);
    await left(third);
    await until(() => (host.room?.seats.length ?? 0) === 2, 'the seat to go');

    third.socket.emit('room:leave');
    await until(() => third.errors.length > 0, 'the refusal');
    expect(getRoom(code)?.seats).toHaveLength(2);
  });
});

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getRoom } from '../src/rooms.js';
import { seatThree, startHarness, until, type Harness, type TestClient } from './harness.js';

/**
 * Who runs the room, and how somebody stops being in it.
 *
 * The thread through all of it is that a seat and an arrival are different
 * things. The room passes down the order people walked in, which stops
 * matching the order of the seat list the first time anybody leaves — and
 * that is exactly the case where getting it wrong hands the room to the
 * wrong person.
 */
const waitFor = async (client: TestClient, event: string): Promise<unknown> => {
  const from = client.received.length;
  await until(
    () => client.received.slice(from).some((entry) => entry.event === event),
    `the ${event}`,
  );
  return client.received.slice(from).find((entry) => entry.event === event)?.payload;
};

const leave = async (client: TestClient): Promise<void> => {
  client.socket.emit('room:leave');
  await waitFor(client, 'room:left');
};

const leaveForGood = async (client: TestClient): Promise<void> => {
  client.socket.emit('room:leaveForGood');
  await waitFor(client, 'room:left');
};

const seatOf = (client: TestClient, playerId: string | undefined) =>
  client.room?.seats.find((seat) => seat.playerId === playerId);

describe('the room passes down the order people arrived in', () => {
  let harness: Harness;

  beforeEach(async () => {
    harness = await startHarness();
  });

  afterEach(async () => {
    await harness.close();
  });

  it('sends somebody who left and came back to the back of the queue', async () => {
    const { host, second, third, code } = await seatThree(harness);
    expect(getRoom(code)?.seats.map((seat) => seat.joined)).toEqual([1, 2, 3]);

    // Bruno arrived second. He walks out and walks back in, which is a new
    // arrival, not the old one resumed: he gave up his place in the queue.
    await leave(second);
    await until(() => (host.room?.seats.length ?? 0) === 2, 'Bruno out');

    const again = await harness.connect('Bruno');
    again.socket.emit('room:join', { code, name: 'Bruno' });
    await until(() => (host.room?.seats.length ?? 0) === 3, 'Bruno back');
    expect(getRoom(code)?.seats.map((seat) => seat.joined)).toEqual([1, 3, 4]);

    // So when Ana goes, the room is Cata's — she has been here longer than
    // the Bruno who is here now.
    await leave(host);
    await until(() => third.room?.hostId !== host.playerId, 'a new host');
    expect(getRoom(code)?.hostId).toBe(third.playerId);
  });

  it('records the arrival number, rather than trusting the array order', async () => {
    const { code } = await seatThree(harness);
    const room = getRoom(code);
    // The two happen to agree today, because seats are appended and removal
    // keeps the order. The number is what makes it a rule instead of a
    // coincidence somebody could break by sorting the list one day.
    expect(room?.seats.map((seat) => seat.joined)).toEqual([1, 2, 3]);
    expect(room?.nextJoined).toBe(4);
  });

  it('prefers somebody who is actually here', async () => {
    const { host, second, third, code } = await seatThree(harness);
    second.socket.disconnect();
    await until(() => seatOf(host, second.playerId)?.connected === false, 'Bruno away');

    await leave(host);
    await until(() => third.room?.hostId !== host.playerId, 'a new host');
    expect(getRoom(code)?.hostId).toBe(third.playerId);
  });
});

describe('handing the room over', () => {
  let harness: Harness;

  beforeEach(async () => {
    harness = await startHarness();
  });

  afterEach(async () => {
    await harness.close();
  });

  it('is the host’s to give', async () => {
    const { host, second, third } = await seatThree(harness);

    host.socket.emit('room:transferHost', { target: second.playerId });
    await until(() => third.room?.hostId === second.playerId, 'the new host');

    expect(host.room?.hostId).toBe(second.playerId);
    expect(host.chat.some((line) => line.text === 'Bruno es el nuevo host')).toBe(true);
  });

  it('is refused to everybody else', async () => {
    const { host, second, third } = await seatThree(harness);

    second.socket.emit('room:transferHost', { target: third.playerId });
    await until(() => second.errors.length > 0, 'the refusal');
    expect(second.errors.map((error) => error.code)).toContain('NOT_HOST');
    expect(host.room?.hostId).toBe(host.playerId);
  });

  it('refuses a seat that is not in the room, and refuses yourself', async () => {
    const { host } = await seatThree(harness);

    host.socket.emit('room:transferHost', { target: 'nobody-at-all' });
    await until(() => host.errors.length > 0, 'the refusal');
    expect(host.errors.map((error) => error.code)).toContain('TARGET_NOT_FOUND');

    host.errors.length = 0;
    host.socket.emit('room:transferHost', { target: host.playerId });
    await until(() => host.errors.length > 0, 'the second refusal');
    expect(host.errors.map((error) => error.code)).toContain('CANNOT_TARGET_SELF');
  });
});

describe('throwing somebody out', () => {
  let harness: Harness;

  beforeEach(async () => {
    harness = await startHarness();
  });

  afterEach(async () => {
    await harness.close();
  });

  it('frees the seat in the lobby, and the token is spent', async () => {
    const { host, second, third, code } = await seatThree(harness);
    const token = third.token;

    host.socket.emit('room:kick', { target: third.playerId });
    await waitFor(third, 'room:kicked');
    await until(() => (host.room?.seats.length ?? 0) === 2, 'the seat to go');

    expect(second.room?.seats.map((seat) => seat.name)).toEqual(['Ana', 'Bruno']);
    expect(host.chat.some((line) => line.text === 'Cata fue expulsada')).toBe(false);
    expect(host.chat.some((line) => line.text === 'Cata fue expulsado')).toBe(true);

    const back = await harness.connect('Cata');
    back.socket.emit('room:join', { code, name: 'Cata', token });
    await until(() => back.errors.length > 0, 'the closed door');
    expect(back.errors.map((error) => error.code)).toContain('KICKED');
  });

  it('retires the seat in a game, and the game carries on', async () => {
    const { host, second, third, code } = await seatThree(harness);
    host.socket.emit('room:start');
    await until(() => host.view !== undefined, 'the game');

    host.socket.emit('room:kick', { target: third.playerId });
    await waitFor(third, 'room:kicked');
    await until(() => seatOf(host, third.playerId)?.state === 'kicked', 'the retired seat');

    // Their pieces are still on the board, and the game did not end.
    expect(second.view?.players).toHaveLength(3);
    expect(getRoom(code)?.started).toBe(true);
    expect(host.view?.players.find((p) => p.id === third.playerId)?.hasLeft).toBe(true);
  });

  it('is refused to everybody else, and nothing moves', async () => {
    const { host, second, third } = await seatThree(harness);

    second.socket.emit('room:kick', { target: third.playerId });
    await until(() => second.errors.length > 0, 'the refusal');
    expect(second.errors.map((error) => error.code)).toContain('NOT_HOST');
    expect(host.room?.seats).toHaveLength(3);
  });

  it('will not let the host throw themselves out', async () => {
    const { host } = await seatThree(harness);
    host.socket.emit('room:kick', { target: host.playerId });
    await until(() => host.errors.length > 0, 'the refusal');
    expect(host.errors.map((error) => error.code)).toContain('CANNOT_TARGET_SELF');
    expect(host.room?.seats).toHaveLength(3);
  });
});

describe('abandoning a game for good', () => {
  let harness: Harness;

  beforeEach(async () => {
    harness = await startHarness();
  });

  afterEach(async () => {
    await harness.close();
  });

  const startedGame = async () => {
    const seated = await seatThree(harness);
    seated.host.socket.emit('room:start');
    await until(
      () => [seated.host, seated.second, seated.third].every((c) => c.view !== undefined),
      'the game',
    );
    return seated;
  };

  it('keeps the pieces, spends the token and moves the room on', async () => {
    const { host, second, third, code } = await startedGame();
    const token = third.token;

    await leaveForGood(third);
    await until(() => seatOf(host, third.playerId)?.state === 'left', 'the retired seat');

    expect(host.view?.players.find((p) => p.id === third.playerId)?.hasLeft).toBe(true);
    expect(second.view?.players).toHaveLength(3);
    expect(host.chat.some((line) => line.text === 'Cata abandonó la partida')).toBe(true);

    const back = await harness.connect('Cata');
    back.socket.emit('room:join', { code, name: 'Cata', token });
    await until(() => back.errors.length > 0, 'the closed door');
    expect(back.errors.map((error) => error.code)).toContain('KICKED');
  });

  it('hands the room over when the one leaving was the host', async () => {
    const { host, second, code } = await startedGame();

    await leaveForGood(host);
    await until(() => second.room?.hostId !== host.playerId, 'the new host');
    expect(getRoom(code)?.hostId).toBe(second.playerId);
  });

  it('plays their turns at once, without waiting the two minutes', async () => {
    const { host, second, third } = await startedGame();
    // Whoever is first to place: if they walk out, the placement happens now.
    const everyone = [host, second, third];
    const active = everyone.find((c) => c.playerId === host.view?.currentPlayer);
    if (!active) throw new Error('no active player');
    // Watched from somebody who is staying: the one leaving stops being sent
    // anything the moment they go, so they are the one client that cannot
    // see what happened next.
    const watcher = everyone.find((c) => c !== active);
    if (!watcher) throw new Error('no watcher');
    const version = watcher.view?.version ?? 0;

    await leaveForGood(active);
    // The turn moved on by itself, which is only possible if the server
    // played it. Nobody waited two minutes for it.
    await until(() => (watcher.view?.version ?? 0) > version + 1, 'the forced placements');
    expect(watcher.view?.currentPlayer).not.toBe(active.playerId);
  });

  it('ends the game when fewer than two are left, without a winner', async () => {
    const { host, second, third, code } = await startedGame();

    await leaveForGood(second);
    await until(() => seatOf(host, second.playerId)?.state === 'left', 'Bruno gone');
    await leaveForGood(third);

    await until(() => host.room?.started === false, 'the room back in the lobby');
    expect(getRoom(code)?.started).toBe(false);
    // Nobody won it, so the scoreboard did not move.
    expect(Object.values(host.room?.wins ?? {}).every((wins) => wins === 0)).toBe(true);
    // And the retired seats are not sitting in the lobby any more.
    expect(host.room?.seats.map((seat) => seat.name)).toEqual(['Ana']);
  });

  it('throws the room away when the last one walks out', async () => {
    const { host, second, third, code } = await startedGame();
    await leaveForGood(third);
    await until(() => seatOf(host, third.playerId)?.state === 'left', 'Cata gone');
    await leaveForGood(second);
    await until(() => host.room?.started === false, 'the room back in the lobby');
    await leave(host);

    expect(getRoom(code)).toBeUndefined();
  });

  it('is refused in the lobby, where there is no game to abandon', async () => {
    const { third } = await seatThree(harness);
    third.socket.emit('room:leaveForGood');
    await until(() => third.errors.length > 0, 'the refusal');
    expect(third.errors.map((error) => error.code)).toContain('GAME_NOT_STARTED');
  });
});

describe('a vote cannot outlive the people voting', () => {
  let harness: Harness;

  beforeEach(async () => {
    harness = await startHarness();
  });

  afterEach(async () => {
    await harness.close();
  });

  it('is cancelled when somebody is thrown out mid-vote', async () => {
    const { host, second, third } = await seatThree(harness);
    host.socket.emit('room:start');
    await until(() => host.view !== undefined, 'the game');

    second.socket.emit('room:proposeRestart');
    await until(() => host.room?.restartVote !== undefined, 'the vote');

    host.socket.emit('room:kick', { target: third.playerId });
    await until(() => host.room?.restartVote === undefined, 'the vote to go');
    expect(host.chat.some((line) => line.text.startsWith('Se canceló la votación'))).toBe(true);
  });
});

describe('a room written down and read back', () => {
  let folder: string;
  let db: string;

  beforeEach(() => {
    folder = mkdtempSync(join(tmpdir(), 'tierra-host-'));
    db = join(folder, 'host.db');
  });

  afterEach(() => {
    rmSync(folder, { recursive: true, force: true });
  });

  it('remembers who left, who was thrown out, and who is next in line', async () => {
    const first = await startHarness({ db });
    const { host, second, third, code } = await seatThree(first);

    host.socket.emit('room:start');
    await until(() => host.view !== undefined, 'the game');

    third.socket.emit('room:leaveForGood');
    await waitFor(third, 'room:left');
    await until(() => seatOf(host, third.playerId)?.state === 'left', 'Cata gone');
    const kickedToken = third.token;
    const nextInLine = second.playerId;
    await first.close();

    // The free tier puts the server to sleep. Waking up, the room has to come
    // back the same: the same people gone, the same tokens spent, the same
    // person next in line for the room.
    const second_ = await startHarness({ db });
    const back = await second_.connect('Ana');
    back.socket.emit('room:join', { code, name: 'Ana', token: host.token });
    await until(() => back.room !== undefined, 'the room back');

    const retired = back.room?.seats.find((seat) => seat.playerId === third.playerId);
    expect(retired?.state).toBe('left');
    expect(back.room?.seats.map((seat) => seat.name)).toEqual(['Ana', 'Bruno', 'Cata']);

    // And the spent token is still spent.
    const ghost = await second_.connect('Cata');
    ghost.socket.emit('room:join', { code, name: 'Cata', token: kickedToken });
    await until(() => ghost.errors.length > 0, 'the closed door');
    expect(ghost.errors.map((error) => error.code)).toContain('KICKED');

    // The room is Ana's; if she goes, it is Bruno's, by arrival.
    expect(back.room?.hostId).toBe(host.playerId);
    back.socket.emit('room:leaveForGood');
    await waitFor(back, 'room:left');
    await until(() => getRoom(code)?.hostId === nextInLine, 'the new host');

    await second_.close();
  });
});

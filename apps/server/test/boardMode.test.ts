import { createRequire } from 'node:module';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { generateBoard } from '@tierra-austral/engine';
import { sqliteStore } from '../src/persistence.js';
import { seatThree, startHarness, until, type Harness } from './harness.js';

const require = createRequire(import.meta.url);
const DatabaseSync = (require('node:sqlite') as { DatabaseSync: new (path: string) => Database })
  .DatabaseSync;

interface Database {
  exec(sql: string): void;
  prepare(sql: string): {
    run(...params: (string | number | null)[]): unknown;
    all(...params: (string | number | null)[]): unknown[];
  };
  close(): void;
}

describe('the host picks how the board is laid out', () => {
  let harness: Harness;

  beforeEach(async () => {
    harness = await startHarness();
  });

  afterEach(async () => {
    await harness.close();
  });

  it('defaults to the random one', async () => {
    const { host } = await seatThree(harness);
    expect(host.room?.boardMode).toBe('random');
  });

  it('is shown to everybody, and the preview follows', async () => {
    const { host, second, third } = await seatThree(harness);

    host.socket.emit('room:setBoardMode', { mode: 'balanced' });
    await until(() => third.room?.boardMode === 'balanced', 'the mode');
    expect(second.room?.boardMode).toBe('balanced');

    host.socket.emit('room:start');
    await until(() => host.view !== undefined, 'the game');
    expect(host.view?.boardMode).toBe('balanced');

    // The board everybody looked at is the board they got.
    const preview = generateBoard(second.room?.previewSeed ?? 0, 'balanced');
    expect(JSON.stringify(host.view?.board)).toBe(JSON.stringify(preview.board));
  });

  it('is refused to everybody else, and once the game is running', async () => {
    const { host, second } = await seatThree(harness);

    second.socket.emit('room:setBoardMode', { mode: 'classic' });
    await until(() => second.errors.length > 0, 'the refusal');
    expect(second.errors.map((error) => error.code)).toContain('NOT_HOST');

    host.socket.emit('room:start');
    await until(() => host.view !== undefined, 'the game');
    host.socket.emit('room:setBoardMode', { mode: 'classic' });
    await until(() => host.errors.length > 0, 'the second refusal');
    expect(host.errors.map((error) => error.code)).toContain('GAME_IN_PROGRESS');
  });

  it('refuses a mode nobody has heard of', async () => {
    const { host } = await seatThree(harness);
    host.socket.emit('room:setBoardMode', { mode: 'hexagonal' });
    await until(() => host.errors.length > 0, 'the refusal');
    expect(host.errors.map((error) => error.code)).toContain('BAD_PAYLOAD');
  });

  it('survives a restart the whole table voted for', async () => {
    const { host, second, third } = await seatThree(harness);
    host.socket.emit('room:setBoardMode', { mode: 'classic' });
    await until(() => host.room?.boardMode === 'classic', 'the mode');
    host.socket.emit('room:start');
    await until(() => host.view !== undefined, 'the game');

    const active = [host, second, third].find(
      (client) => client.playerId === host.view?.currentPlayer,
    );
    const version = active?.view?.version ?? 0;
    active?.socket.emit('game:action', {
      action: { type: 'placeSettlement', vertex: active.view?.legalMoves.settlements[0] },
      expectedVersion: version,
    });
    await until(() => (host.view?.version ?? 0) > version, 'a move to archive');

    host.socket.emit('room:proposeRestart');
    await until(() => host.room?.restartVote !== undefined, 'the vote');
    second.socket.emit('room:voteRestart', { approve: true });
    third.socket.emit('room:voteRestart', { approve: true });
    await until(() => (host.room?.gamesPlayed ?? 0) === 1, 'the new game');

    expect(host.room?.boardMode).toBe('classic');
    expect(host.view?.boardMode).toBe('classic');
  });
});

describe('a database written before board modes existed', () => {
  let folder: string;
  let db: string;

  beforeEach(() => {
    folder = mkdtempSync(join(tmpdir(), 'tierra-mode-'));
    db = join(folder, 'old.db');
  });

  afterEach(() => {
    rmSync(folder, { recursive: true, force: true });
  });

  it('opens, and its rooms come back as random', () => {
    // The `rooms` table exactly as an older build left it: no board_mode
    // column at all. `CREATE TABLE IF NOT EXISTS` would leave it that way, so
    // this is what the migration is for.
    const old = new DatabaseSync(db);
    old.exec(`
      CREATE TABLE rooms (
        code TEXT PRIMARY KEY,
        seed INTEGER,
        host_id TEXT NOT NULL,
        started INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        last_activity INTEGER NOT NULL,
        seats TEXT NOT NULL,
        preview_seed INTEGER NOT NULL DEFAULT 0,
        wins TEXT NOT NULL DEFAULT '{}'
      );
    `);
    old
      .prepare(
        'INSERT INTO rooms (code, seed, host_id, started, created_at, last_activity, seats, preview_seed, wins) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      )
      .run('VIEJA', null, 'p1', 0, 1, 2, '[]', 77, '{}');
    old.close();

    const store = sqliteStore(db);
    const rooms = store.loadRooms();
    store.close();

    expect(rooms).toHaveLength(1);
    expect(rooms[0]?.code).toBe('VIEJA');
    expect(rooms[0]?.previewSeed).toBe(77);
    expect(rooms[0]?.boardMode).toBe('random');
  });
});

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { sqliteStore } from '../src/persistence.js';
import {
  createRoom,
  getRoom,
  persistRoom,
  resetRooms,
  sweepIdleRooms,
  useStore,
} from '../src/rooms.js';

/** Rooms nobody has touched in a day go away, in memory and on disk. */
describe('sweeping idle rooms', () => {
  let directory: string;
  let db: string;

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'tierra-austral-sweep-'));
    db = join(directory, 'sweep.db');
    resetRooms();
  });

  afterEach(() => {
    resetRooms();
    rmSync(directory, { recursive: true, force: true });
  });

  it('drops the quiet ones and leaves the live ones alone', () => {
    const store = sqliteStore(db);
    useStore(store);

    const { room: stale } = createRoom('Ana');
    stale.lastActivity = Date.now() - 48 * 60 * 60 * 1000;
    persistRoom(stale);

    const { room: fresh } = createRoom('Bruno');
    persistRoom(fresh);

    const dropped = sweepIdleRooms(24 * 60 * 60 * 1000);

    expect(dropped).toContain(stale.code);
    expect(dropped).not.toContain(fresh.code);
    expect(getRoom(stale.code)).toBeUndefined();
    expect(getRoom(fresh.code)).toBeDefined();

    // And it is gone from the database too, not just from memory.
    const codes = store.loadRooms().map((row) => row.code);
    expect(codes).not.toContain(stale.code);
    expect(codes).toContain(fresh.code);
    store.close();
  });
});

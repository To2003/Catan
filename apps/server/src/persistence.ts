import { createRequire } from 'node:module';
import type { Action, PlayerColor, PlayerId } from '@tierra-austral/engine';

/**
 * Persistence: `seed` plus the list of actions, per room.
 *
 * That is the whole of a game — replaying the actions from the seed rebuilds
 * the state exactly (SPEC.md §6) — so this stores no derived state at all. A
 * restart cannot disagree with itself about a board it saved.
 *
 * **`node:sqlite` rather than better-sqlite3.** It ships with Node, so there is
 * no native module to compile in a container, which is the whole reason M0
 * flagged this decision. Node still prints an experimental warning for it; the
 * API used here is a handful of calls, and the cost of moving to better-sqlite3
 * later is this file.
 *
 * It is loaded through `createRequire` rather than imported: `node:sqlite` is
 * newer than esbuild's list of Node builtins, so the production bundle rewrote
 * `import 'node:sqlite'` into `import 'sqlite'` — a package that does not
 * exist — and the server only failed once it started. A require at runtime is
 * out of the bundler's reach.
 */
const require = createRequire(import.meta.url);

interface SqliteModule {
  new (path: string): {
    exec(sql: string): void;
    prepare(sql: string): {
      run(...params: (string | number | null)[]): unknown;
      all(...params: (string | number | null)[]): unknown[];
    };
    close(): void;
  };
}

const DatabaseSync = (require('node:sqlite') as { DatabaseSync: SqliteModule }).DatabaseSync;

export interface StoredSeat {
  readonly playerId: PlayerId;
  readonly name: string;
  readonly color?: PlayerColor;
  readonly ready: boolean;
  readonly token: string;
}

/** A game that is over: kept whole, because a room can hold several. */
export interface StoredGame {
  readonly seed: number;
  readonly actions: { playerId: PlayerId; action: Action }[];
  readonly winner?: PlayerId;
  readonly endedAt: number;
}

export interface StoredRoom {
  readonly code: string;
  readonly seed: number | undefined;
  readonly hostId: PlayerId;
  readonly started: boolean;
  readonly createdAt: number;
  readonly lastActivity: number;
  readonly seats: StoredSeat[];
  readonly actions: { playerId: PlayerId; action: Action }[];
  /** The board the lobby is showing before anybody presses start. */
  readonly previewSeed: number;
  /** Games already finished in this room, oldest first. */
  readonly games: StoredGame[];
  readonly wins: Readonly<Record<PlayerId, number>>;
}

export interface Store {
  saveRoom(room: Omit<StoredRoom, 'actions' | 'games'>): void;
  archiveGame(code: string, index: number, game: StoredGame): void;
  appendAction(code: string, index: number, playerId: PlayerId, action: Action): void;
  loadRooms(): StoredRoom[];
  /** Forgets the running game's moves, keeping the room and its archive. */
  clearActions(code: string): void;
  deleteRoom(code: string): void;
  deleteIdleRooms(before: number): string[];
  close(): void;
}

/** A store that keeps nothing, for tests and for running without a database. */
export const memoryStore = (): Store => ({
  saveRoom: () => undefined,
  archiveGame: () => undefined,
  appendAction: () => undefined,
  loadRooms: () => [],
  clearActions: () => undefined,
  deleteRoom: () => undefined,
  deleteIdleRooms: () => [],
  close: () => undefined,
});

export const sqliteStore = (path: string): Store => {
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS rooms (
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
    CREATE TABLE IF NOT EXISTS archived_games (
      code TEXT NOT NULL,
      idx INTEGER NOT NULL,
      seed INTEGER NOT NULL,
      actions TEXT NOT NULL,
      winner TEXT,
      ended_at INTEGER NOT NULL,
      PRIMARY KEY (code, idx)
    );
    CREATE TABLE IF NOT EXISTS actions (
      code TEXT NOT NULL,
      idx INTEGER NOT NULL,
      player_id TEXT NOT NULL,
      action TEXT NOT NULL,
      PRIMARY KEY (code, idx)
    );
  `);

  const upsertRoom = db.prepare(`
    INSERT INTO rooms (code, seed, host_id, started, created_at, last_activity, seats, preview_seed, wins)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(code) DO UPDATE SET
      seed = excluded.seed,
      host_id = excluded.host_id,
      started = excluded.started,
      last_activity = excluded.last_activity,
      seats = excluded.seats,
      preview_seed = excluded.preview_seed,
      wins = excluded.wins
  `);
  const insertArchived = db.prepare(
    'INSERT OR REPLACE INTO archived_games (code, idx, seed, actions, winner, ended_at) VALUES (?, ?, ?, ?, ?, ?)',
  );
  const selectArchived = db.prepare('SELECT * FROM archived_games WHERE code = ? ORDER BY idx');
  const removeArchived = db.prepare('DELETE FROM archived_games WHERE code = ?');
  const insertAction = db.prepare(
    'INSERT OR REPLACE INTO actions (code, idx, player_id, action) VALUES (?, ?, ?, ?)',
  );
  const selectRooms = db.prepare('SELECT * FROM rooms ORDER BY created_at');
  const selectActions = db.prepare('SELECT * FROM actions WHERE code = ? ORDER BY idx');
  const removeRoom = db.prepare('DELETE FROM rooms WHERE code = ?');
  const removeActions = db.prepare('DELETE FROM actions WHERE code = ?');
  const selectIdle = db.prepare('SELECT code FROM rooms WHERE last_activity < ?');

  return {
    saveRoom(room) {
      upsertRoom.run(
        room.code,
        room.seed ?? null,
        room.hostId,
        room.started ? 1 : 0,
        room.createdAt,
        room.lastActivity,
        JSON.stringify(room.seats),
        room.previewSeed,
        JSON.stringify(room.wins),
      );
    },

    archiveGame(code, index, game) {
      insertArchived.run(
        code,
        index,
        game.seed,
        JSON.stringify(game.actions),
        game.winner ?? null,
        game.endedAt,
      );
    },

    appendAction(code, index, playerId, action) {
      insertAction.run(code, index, playerId, JSON.stringify(action));
    },

    loadRooms() {
      const rows = selectRooms.all() as {
        code: string;
        seed: number | null;
        host_id: string;
        started: number;
        created_at: number;
        last_activity: number;
        seats: string;
        preview_seed: number;
        wins: string;
      }[];

      return rows.map((row) => {
        const actions = (
          selectActions.all(row.code) as { player_id: string; action: string }[]
        ).map((entry) => ({
          playerId: entry.player_id,
          action: JSON.parse(entry.action) as Action,
        }));

        const games = (
          selectArchived.all(row.code) as {
            seed: number;
            actions: string;
            winner: string | null;
            ended_at: number;
          }[]
        ).map((game) => ({
          seed: game.seed,
          actions: JSON.parse(game.actions) as { playerId: PlayerId; action: Action }[],
          ...(game.winner === null ? {} : { winner: game.winner }),
          endedAt: game.ended_at,
        }));

        return {
          code: row.code,
          seed: row.seed ?? undefined,
          hostId: row.host_id,
          started: row.started === 1,
          createdAt: row.created_at,
          lastActivity: row.last_activity,
          seats: JSON.parse(row.seats) as StoredSeat[],
          actions,
          previewSeed: row.preview_seed,
          games,
          wins: JSON.parse(row.wins) as Record<PlayerId, number>,
        };
      });
    },

    clearActions(code) {
      removeActions.run(code);
    },

    deleteRoom(code) {
      removeActions.run(code);
      removeArchived.run(code);
      removeRoom.run(code);
    },

    deleteIdleRooms(before) {
      const codes = (selectIdle.all(before) as { code: string }[]).map((row) => row.code);
      for (const code of codes) {
        removeActions.run(code);
        removeArchived.run(code);
        removeRoom.run(code);
      }
      return codes;
    },

    close() {
      db.close();
    },
  };
};

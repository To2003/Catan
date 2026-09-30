import { createRequire } from 'node:module';
import type { Action, BoardMode, PlayerColor, PlayerId } from '@tierra-austral/engine';
import type { ChatMessage } from './protocol.js';

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

interface Database {
  exec(sql: string): void;
  prepare(sql: string): {
    run(...params: (string | number | null)[]): unknown;
    all(...params: (string | number | null)[]): unknown[];
  };
  close(): void;
}

interface SqliteModule {
  new (path: string): Database;
}

const DatabaseSync = (require('node:sqlite') as { DatabaseSync: SqliteModule }).DatabaseSync;

export interface StoredSeat {
  readonly playerId: PlayerId;
  readonly name: string;
  readonly color?: PlayerColor;
  readonly ready: boolean;
  readonly token: string;
  /**
   * Arrival order, from 1. Absent in rows written before it existed, where
   * the stored order of the seats is the best evidence of it.
   */
  readonly joined?: number;
  /** Final states only; absent means the seat is still somebody's. */
  readonly gone?: 'left' | 'kicked';
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
  /**
   * How this room lays its boards out. Rows written before modes existed have
   * no value here and come back as `'random'`, which is what they were played
   * on.
   */
  readonly boardMode: BoardMode;
  /** Games already finished in this room, oldest first. */
  readonly games: StoredGame[];
  readonly wins: Readonly<Record<PlayerId, number>>;
  /** The room's conversation, oldest first. */
  readonly chat: ChatMessage[];
  /** Tokens that may not reconnect: thrown out, or walked out for good. */
  readonly blockedTokens: string[];
}

export interface Store {
  saveRoom(room: Omit<StoredRoom, 'actions' | 'games' | 'chat'>): void;
  archiveGame(code: string, index: number, game: StoredGame): void;
  appendAction(code: string, index: number, playerId: PlayerId, action: Action): void;
  /**
   * Stores one chat line and forgets everything before `keepFrom`.
   *
   * The chat lives next to the room and goes away with it, so a server that
   * sleeps — which the free tier does, nightly — wakes up with the
   * conversation intact rather than with an empty panel.
   */
  appendChat(code: string, message: ChatMessage, keepFrom: number): void;
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
  appendChat: () => undefined,
  loadRooms: () => [],
  clearActions: () => undefined,
  deleteRoom: () => undefined,
  deleteIdleRooms: () => [],
  close: () => undefined,
});

/**
 * Adds a column to a table that already exists, if it is not there yet.
 *
 * `CREATE TABLE IF NOT EXISTS` does nothing to a table that is already
 * present, so a database written by an older build keeps its old columns and
 * the first prepared statement mentioning a new one fails at boot — which is
 * exactly how this was found. Every column added after the first release has
 * to come through here.
 */
const addColumn = (db: Database, table: string, column: string, definition: string): void => {
  const existing = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (existing.some((row) => row.name === column)) return;
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
};

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
      wins TEXT NOT NULL DEFAULT '{}',
      board_mode TEXT NOT NULL DEFAULT 'random',
      blocked_tokens TEXT NOT NULL DEFAULT '[]'
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
    CREATE TABLE IF NOT EXISTS chat (
      code TEXT NOT NULL,
      id INTEGER NOT NULL,
      at INTEGER NOT NULL,
      kind TEXT NOT NULL,
      author TEXT,
      text TEXT NOT NULL,
      PRIMARY KEY (code, id)
    );
    CREATE TABLE IF NOT EXISTS actions (
      code TEXT NOT NULL,
      idx INTEGER NOT NULL,
      player_id TEXT NOT NULL,
      action TEXT NOT NULL,
      PRIMARY KEY (code, idx)
    );
  `);

  // Columns that arrived after the first release, for databases that predate
  // them. Each is idempotent, so this runs on every boot.
  addColumn(db, 'rooms', 'preview_seed', 'INTEGER NOT NULL DEFAULT 0');
  addColumn(db, 'rooms', 'wins', "TEXT NOT NULL DEFAULT '{}'");
  addColumn(db, 'rooms', 'board_mode', "TEXT NOT NULL DEFAULT 'random'");
  addColumn(db, 'rooms', 'blocked_tokens', "TEXT NOT NULL DEFAULT '[]'");

  const upsertRoom = db.prepare(`
    INSERT INTO rooms (code, seed, host_id, started, created_at, last_activity, seats, preview_seed, wins, board_mode, blocked_tokens)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(code) DO UPDATE SET
      seed = excluded.seed,
      host_id = excluded.host_id,
      started = excluded.started,
      last_activity = excluded.last_activity,
      seats = excluded.seats,
      preview_seed = excluded.preview_seed,
      wins = excluded.wins,
      board_mode = excluded.board_mode,
      blocked_tokens = excluded.blocked_tokens
  `);
  const insertArchived = db.prepare(
    'INSERT OR REPLACE INTO archived_games (code, idx, seed, actions, winner, ended_at) VALUES (?, ?, ?, ?, ?, ?)',
  );
  const selectArchived = db.prepare('SELECT * FROM archived_games WHERE code = ? ORDER BY idx');
  const removeArchived = db.prepare('DELETE FROM archived_games WHERE code = ?');
  const insertAction = db.prepare(
    'INSERT OR REPLACE INTO actions (code, idx, player_id, action) VALUES (?, ?, ?, ?)',
  );
  const insertChat = db.prepare(
    'INSERT OR REPLACE INTO chat (code, id, at, kind, author, text) VALUES (?, ?, ?, ?, ?, ?)',
  );
  const trimChat = db.prepare('DELETE FROM chat WHERE code = ? AND id < ?');
  const selectChat = db.prepare('SELECT * FROM chat WHERE code = ? ORDER BY id');
  const removeChat = db.prepare('DELETE FROM chat WHERE code = ?');
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
        room.boardMode,
        JSON.stringify(room.blockedTokens),
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

    appendChat(code, message, keepFrom) {
      insertChat.run(
        code,
        message.id,
        message.at,
        message.kind,
        message.from ?? null,
        message.text,
      );
      trimChat.run(code, keepFrom);
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
        board_mode: string | null;
        blocked_tokens: string | null;
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

        const chat = (
          selectChat.all(row.code) as {
            id: number;
            at: number;
            kind: string;
            author: string | null;
            text: string;
          }[]
        ).map((line) => ({
          id: line.id,
          at: line.at,
          kind: line.kind === 'system' ? ('system' as const) : ('player' as const),
          ...(line.author === null ? {} : { from: line.author }),
          text: line.text,
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
          // A room saved before modes existed was played on the random one.
          boardMode: (row.board_mode ?? 'random') as BoardMode,
          blockedTokens: JSON.parse(row.blocked_tokens ?? '[]') as string[],
          games,
          wins: JSON.parse(row.wins) as Record<PlayerId, number>,
          chat,
        };
      });
    },

    clearActions(code) {
      removeActions.run(code);
    },

    deleteRoom(code) {
      removeActions.run(code);
      removeArchived.run(code);
      removeChat.run(code);
      removeRoom.run(code);
    },

    deleteIdleRooms(before) {
      const codes = (selectIdle.all(before) as { code: string }[]).map((row) => row.code);
      for (const code of codes) {
        removeActions.run(code);
        removeArchived.run(code);
        removeChat.run(code);
        removeRoom.run(code);
      }
      return codes;
    },

    close() {
      db.close();
    },
  };
};

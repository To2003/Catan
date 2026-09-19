import { io, type Socket } from 'socket.io-client';

const SERVER_URL = import.meta.env.VITE_SERVER_URL ?? 'http://localhost:3001';

/**
 * The single shared connection to the authoritative server (SPEC.md §7.2).
 *
 * The client holds no game state of its own: it sends actions and renders the
 * view the server sends back.
 */
export const socket: Socket = io(SERVER_URL, { autoConnect: true });

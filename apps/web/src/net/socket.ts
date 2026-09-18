import { io, type Socket } from 'socket.io-client';

const SERVER_URL = import.meta.env.VITE_SERVER_URL ?? 'http://localhost:3001';

/**
 * Single shared connection. The room and game protocol (SPEC.md §7.2) is wired
 * up in M6; for now this only proves the client can reach the server.
 */
export const socket: Socket = io(SERVER_URL, { autoConnect: true });

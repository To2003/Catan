/**
 * How long the room waits on a disconnected player before the host may force
 * their turn (SPEC.md §7.1). The server enforces it; this is only for enabling
 * the button at roughly the right moment.
 */
export const FORCE_TURN_HINT_MS = 2 * 60 * 1000;

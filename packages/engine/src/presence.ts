import type { GameState, PlayerId, ReadonlyGameState } from './types.js';

/**
 * Whether a player is currently connected.
 *
 * **This is not an action.** Presence is not part of the game's history: it
 * never enters the action list and a replay must not reproduce it, which is
 * exactly why it cannot go through `applyAction`. It is a pure state update,
 * here rather than in the server so nobody is tempted to mutate a state the
 * engine handed out.
 */
export const setConnected = (
  state: ReadonlyGameState,
  playerId: PlayerId,
  connected: boolean,
): ReadonlyGameState => {
  const { board, ...rest } = state;
  const draft = { ...(structuredClone(rest) as Omit<GameState, 'board'>), board };
  const player = draft.players.find((candidate) => candidate.id === playerId);
  if (player) player.connected = connected;
  return draft;
};

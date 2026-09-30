/**
 * The player token, kept per room code.
 *
 * Per code, not one global key: playing a second room must not overwrite the
 * seat you still hold in the first one.
 */
const keyFor = (code: string): string => `tierra-austral:token:${code.toUpperCase()}`;

export const readToken = (code: string): string | undefined => {
  try {
    return window.localStorage.getItem(keyFor(code)) ?? undefined;
  } catch {
    return undefined;
  }
};

export const writeToken = (code: string, token: string): void => {
  try {
    window.localStorage.setItem(keyFor(code), token);
  } catch {
    // A browser with storage blocked can still play; it just cannot come back.
  }
};

export const forgetToken = (code: string): void => {
  try {
    window.localStorage.removeItem(keyFor(code));
  } catch {
    // Nothing to do.
  }
};

/** The last room this browser was in, and under what name, so a reload can walk back in. */
const LAST_ROOM = 'tierra-austral:last-room';
const LAST_NAME = 'tierra-austral:last-name';

export const readLastRoom = (): string | undefined => {
  try {
    return window.localStorage.getItem(LAST_ROOM) ?? undefined;
  } catch {
    return undefined;
  }
};

export const writeLastRoom = (code: string): void => {
  try {
    window.localStorage.setItem(LAST_ROOM, code.toUpperCase());
  } catch {
    // Nothing to do.
  }
};

export const readName = (): string | undefined => {
  try {
    return window.localStorage.getItem(LAST_NAME) ?? undefined;
  } catch {
    return undefined;
  }
};

export const writeName = (name: string): void => {
  try {
    window.localStorage.setItem(LAST_NAME, name);
  } catch {
    // Nothing to do.
  }
};

/**
 * A room handed over in the URL: `?room=CODE&token=UUID&name=Ana`.
 *
 * It is how the dev fixture seats three windows at a finished game, and it is
 * also a perfectly good reconnect link: the token is required either way, so
 * this grants nothing that holding the token did not already grant.
 */
/**
 * A room code handed over in the address bar, from a shared link.
 *
 * Separate from `readRoomFromUrl`, which needs a token and a name as well and
 * sits you straight down in your own seat. This one only pre-fills the code
 * box: the link somebody pastes into a chat should open the door, not hand
 * over a seat.
 */
export const readInviteCodeFromUrl = (): string | undefined => {
  const code = new URLSearchParams(window.location.search).get('room');
  return code === null || code.trim() === '' ? undefined : code.toUpperCase().slice(0, 5);
};

/** The link to share so somebody lands on the join box with the code filled in. */
export const inviteLink = (code: string): string =>
  `${window.location.origin}${window.location.pathname}?room=${code}`;

export const readRoomFromUrl = (): { code: string; token: string; name: string } | undefined => {
  const params = new URLSearchParams(window.location.search);
  const code = params.get('room');
  const token = params.get('token');
  const name = params.get('name');
  if (!code || !token || !name) return undefined;
  return { code: code.toUpperCase(), token, name };
};

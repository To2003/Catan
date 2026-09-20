/**
 * Which origins the browser is allowed to connect from.
 *
 * `WEB_ORIGIN` takes a comma-separated list, so a deploy can serve a preview
 * domain and the real one at once.
 *
 * Outside production **any localhost origin is allowed, whatever the port**.
 * The alternative cost an afternoon: a server left running with one port in
 * `WEB_ORIGIN` answers on 3001, the browser is on another port, and every
 * socket attempt fails with a CORS message that says nothing about the actual
 * problem — a stale process. In development the origin check protects nothing
 * anyway.
 */
const LOCALHOST = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;

export const parseOrigins = (raw: string | undefined): string[] =>
  (raw ?? '')
    .split(',')
    .map((origin) => origin.trim().replace(/\/$/, ''))
    .filter((origin) => origin.length > 0);

export interface OriginPolicy {
  /** Whether this origin may connect. */
  allows(origin: string | undefined): boolean;
  /** For the log line at boot, so the answer is visible without reading code. */
  describe(): string;
}

export const originPolicy = (raw: string | undefined, production: boolean): OriginPolicy => {
  const allowed = parseOrigins(raw);

  return {
    allows(origin) {
      // Requests without an Origin header (curl, health checks) are not
      // browsers and are not what this protects against.
      if (origin === undefined || origin === '') return true;
      const normalised = origin.replace(/\/$/, '');
      if (allowed.includes(normalised)) return true;
      return !production && LOCALHOST.test(normalised);
    },
    describe() {
      if (allowed.length === 0) {
        return production
          ? 'nothing (WEB_ORIGIN is empty: set it, or no browser will connect)'
          : 'any localhost port';
      }
      return production ? allowed.join(', ') : `${allowed.join(', ')} plus any localhost port`;
    },
  };
};

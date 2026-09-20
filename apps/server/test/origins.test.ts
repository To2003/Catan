import { describe, expect, it } from 'vitest';
import { originPolicy, parseOrigins } from '../src/origins.js';

describe('which origins may connect', () => {
  it('reads a comma-separated list, trimming slashes and spaces', () => {
    expect(parseOrigins('https://a.com/, https://b.com')).toEqual([
      'https://a.com',
      'https://b.com',
    ]);
    expect(parseOrigins(undefined)).toEqual([]);
    expect(parseOrigins('')).toEqual([]);
  });

  it('allows any localhost port in development', () => {
    // The case that bit: a server started with one port in WEB_ORIGIN, a
    // browser on another, and a CORS error that blamed the wrong thing.
    const policy = originPolicy('http://localhost:5199', false);
    expect(policy.allows('http://localhost:5199')).toBe(true);
    expect(policy.allows('http://localhost:5173')).toBe(true);
    expect(policy.allows('http://127.0.0.1:4000')).toBe(true);
    expect(policy.allows('https://tierra-austral.vercel.app')).toBe(false);
  });

  it('allows only what it was told in production', () => {
    const policy = originPolicy('https://tierra-austral.vercel.app', true);
    expect(policy.allows('https://tierra-austral.vercel.app')).toBe(true);
    expect(policy.allows('https://tierra-austral.vercel.app/')).toBe(true);
    expect(policy.allows('http://localhost:5173')).toBe(false);
    expect(policy.allows('https://impostor.example')).toBe(false);
  });

  it('lets through requests that carry no origin at all', () => {
    // curl and the platform health check are not browsers.
    const policy = originPolicy('https://tierra-austral.vercel.app', true);
    expect(policy.allows(undefined)).toBe(true);
  });

  it('says what it is doing, for the log at boot', () => {
    expect(originPolicy('https://a.com', true).describe()).toBe('https://a.com');
    expect(originPolicy(undefined, false).describe()).toBe('any localhost port');
    expect(originPolicy(undefined, true).describe()).toContain('WEB_ORIGIN is empty');
  });
});

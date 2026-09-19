import { describe, expect, it } from 'vitest';
import {
  BANK_RESOURCE_COUNT,
  RESOURCES,
  TERRAIN_RESOURCE,
  applyAction,
  rollDie,
  type HexId,
  type ReadonlyGameState,
  type Resource,
} from '../src/index.js';
import { ANA, BRUNO, applyOrThrow, draft, runSetup, totalOf } from './helpers.js';

/** The roll the engine is about to make: two draws, d1 then d2 (SPEC §12.11). */
const peekRoll = (state: ReadonlyGameState): { dice: [number, number]; total: number } => {
  const first = rollDie(state.rngState);
  const second = rollDie(first.state);
  return { dice: [first.value, second.value], total: first.value + second.value };
};

const afterSetup = runSetup();

/** A fresh game in preRoll with an empty board, empty hands and a full bank. */
const barePreRoll = (mutate: Parameters<typeof draft>[1] = () => {}): ReadonlyGameState =>
  draft(afterSetup, (s) => {
    s.buildings = {};
    s.roads = {};
    s.phase = { kind: 'preRoll' };
    s.currentPlayer = ANA.id;
    for (const player of s.players) {
      for (const resource of RESOURCES) player.resources[resource] = 0;
    }
    for (const resource of RESOURCES) s.bank[resource] = BANK_RESOURCE_COUNT;
    mutate(s);
  });

/** The hexes carrying a given number, robber aside. */
const hexesWith = (state: ReadonlyGameState, total: number): HexId[] =>
  state.board.hexIds.filter(
    (hex) => state.board.hexes[hex]?.number === total && hex !== state.robberHex,
  );

const resourceOf = (state: ReadonlyGameState, hex: HexId): Resource | null => {
  const terrain = state.board.hexes[hex]?.terrain;
  return terrain ? TERRAIN_RESOURCE[terrain] : null;
};

/** A state whose next roll is `total`, found by walking PRNG states. */
const stateRollingTotal = (
  base: (mutate: Parameters<typeof draft>[1]) => ReadonlyGameState,
  total: number,
  mutate: Parameters<typeof draft>[1] = () => {},
): ReadonlyGameState => {
  for (let seed = 0; seed < 5000; seed += 1) {
    const candidate = base((s) => {
      s.rngState = seed;
      mutate(s);
    });
    if (peekRoll(candidate).total === total) return candidate;
  }
  throw new Error(`no rng state rolling ${total} was found`);
};

describe('rolling the dice', () => {
  it('draws d1 then d2 from the seeded PRNG and records the roll', () => {
    const before = stateRollingTotal(barePreRoll, 6);
    const expected = peekRoll(before);
    const { state, events } = applyOrThrow(before, ANA.id, { type: 'rollDice' });

    expect(state.lastRoll).toEqual(expected.dice);
    expect(events[0]).toEqual({
      type: 'DiceRolled',
      player: ANA.id,
      dice: expected.dice,
      total: expected.total,
    });
    expect(state.phase).toEqual({ kind: 'main' });
  });

  it('is deterministic: the same state rolls the same numbers', () => {
    const before = stateRollingTotal(barePreRoll, 6);
    const once = applyOrThrow(before, ANA.id, { type: 'rollDice' }).state;
    const twice = applyOrThrow(before, ANA.id, { type: 'rollDice' }).state;
    expect(once.lastRoll).toEqual(twice.lastRoll);
    expect(once.rngState).toBe(twice.rngState);
  });

  it('cannot be rolled twice in a turn', () => {
    const { state } = applyOrThrow(stateRollingTotal(barePreRoll, 6), ANA.id, { type: 'rollDice' });
    expect(applyAction(state, ANA.id, { type: 'rollDice' })).toEqual({
      ok: false,
      error: 'WRONG_PHASE',
    });
  });
});

describe('production', () => {
  const stateRolling = (
    total: number,
    mutate: Parameters<typeof draft>[1] = () => {},
  ): ReadonlyGameState => stateRollingTotal(barePreRoll, total, mutate);

  it('pays 1 to a settlement and 2 to a city on each producing hex', () => {
    const total = 5;
    const base = stateRolling(total);
    const hex = hexesWith(base, total).find((candidate) => resourceOf(base, candidate) !== null);
    if (!hex) throw new Error(`no producing hex with a ${total}`);
    const resource = resourceOf(base, hex);
    if (!resource) throw new Error('hex produces nothing');

    const corners = base.board.hexes[hex]?.corners ?? [];
    const before = stateRolling(total, (s) => {
      const [settlement, , city] = corners;
      if (settlement) s.buildings[settlement] = { owner: ANA.id, type: 'settlement' };
      if (city) s.buildings[city] = { owner: BRUNO.id, type: 'city' };
    });

    const { state, events } = applyOrThrow(before, ANA.id, { type: 'rollDice' });
    const ana = state.players.find((player) => player.id === ANA.id);
    const bruno = state.players.find((player) => player.id === BRUNO.id);

    expect(ana?.resources[resource]).toBe(1);
    expect(bruno?.resources[resource]).toBe(2);
    expect(events.some((event) => event.type === 'ResourcesProduced')).toBe(true);
    for (const each of RESOURCES) expect(totalOf(state, each)).toBe(BANK_RESOURCE_COUNT);
  });

  it('pays nothing for a hex under the robber, and says so', () => {
    const total = 5;
    const probe = stateRolling(total);
    const hex = probe.board.hexIds.find(
      (candidate) =>
        probe.board.hexes[candidate]?.number === total && resourceOf(probe, candidate) !== null,
    );
    if (!hex) throw new Error(`no producing hex with a ${total}`);
    const corner = (probe.board.hexes[hex]?.corners ?? [])[0];
    if (!corner) throw new Error('hex has no corners');

    const before = stateRolling(total, (s) => {
      s.robberHex = hex;
      s.buildings[corner] = { owner: ANA.id, type: 'settlement' };
    });

    const { state, events } = applyOrThrow(before, ANA.id, { type: 'rollDice' });
    expect(events).toContainEqual({ type: 'ProductionSkipped', reason: 'robber', hex });

    const ana = state.players.find((player) => player.id === ANA.id);
    const resource = resourceOf(state, hex);
    if (resource) expect(ana?.resources[resource]).toBe(0);
  });

  it('produces nothing on a 7 and starts the robber chain instead', () => {
    // A handful of settlements spread over the board, so there is plenty that
    // could have produced — but not enough points to end the game.
    const before = stateRolling(7, (s) => {
      for (const hex of s.board.hexIds.slice(0, 3)) {
        const corner = s.board.hexes[hex]?.corners[0];
        if (corner) s.buildings[corner] = { owner: ANA.id, type: 'settlement' };
      }
    });

    const { state, events } = applyOrThrow(before, ANA.id, { type: 'rollDice' });
    // Nobody holds a card here, so there is nothing to discard: straight to the
    // robber.
    expect(events.map((event) => event.type)).toEqual(['DiceRolled', 'PhaseChanged']);
    expect(state.phase).toEqual({ kind: 'moveRobber', source: 'seven', returnTo: 'main' });
    for (const player of state.players) {
      for (const resource of RESOURCES) expect(player.resources[resource]).toBe(0);
    }
  });
});

describe('bank scarcity (SPEC §12.1)', () => {
  const total = 5;

  /** Puts `owners` on the corners of a hex producing `total`, with a thin bank. */
  const scarce = (
    owners: readonly { player: string; type: 'settlement' | 'city' }[],
    bankLeft: number,
  ): { state: ReadonlyGameState; resource: Resource } => {
    for (let seed = 0; seed < 5000; seed += 1) {
      const probe = barePreRoll((s) => {
        s.rngState = seed;
      });
      if (peekRoll(probe).total !== total) continue;

      const hex = hexesWith(probe, total).find((candidate) => {
        const corners = probe.board.hexes[candidate]?.corners ?? [];
        return resourceOf(probe, candidate) !== null && corners.length >= owners.length * 2;
      });
      if (!hex) continue;
      const resource = resourceOf(probe, hex);
      if (!resource) continue;
      const corners = probe.board.hexes[hex]?.corners ?? [];

      const state = draft(probe, (s) => {
        owners.forEach((owner, index) => {
          // Every other corner, so the buildings never sit next to each other.
          const vertex = corners[index * 2];
          if (vertex) s.buildings[vertex] = { owner: owner.player, type: owner.type };
        });
        for (const each of RESOURCES) {
          const held = s.players.reduce((sum, player) => sum + player.resources[each], 0);
          s.bank[each] = each === resource ? bankLeft : BANK_RESOURCE_COUNT - held;
        }
        // Whatever the bank is short of has to sit in somebody's hand.
        const missing = BANK_RESOURCE_COUNT - bankLeft;
        const dump = s.players.find((player) => player.id !== ANA.id && player.id !== BRUNO.id);
        if (dump) dump.resources[resource] += missing;
      });
      return { state, resource };
    }
    throw new Error('no suitable position was found');
  };

  it('pays the leftovers when a single player is claiming', () => {
    const { state: before, resource } = scarce([{ player: ANA.id, type: 'city' }], 1);
    const { state, events } = applyOrThrow(before, ANA.id, { type: 'rollDice' });

    const ana = state.players.find((player) => player.id === ANA.id);
    expect(ana?.resources[resource]).toBe(1);
    expect(state.bank[resource]).toBe(0);
    expect(events.some((event) => event.type === 'ResourcesProduced')).toBe(true);
    expect(totalOf(state, resource)).toBe(BANK_RESOURCE_COUNT);
  });

  it('pays nobody when two or more are claiming', () => {
    const { state: before, resource } = scarce(
      [
        { player: ANA.id, type: 'city' },
        { player: BRUNO.id, type: 'city' },
      ],
      3,
    );
    const { state, events } = applyOrThrow(before, ANA.id, { type: 'rollDice' });

    const ana = state.players.find((player) => player.id === ANA.id);
    const bruno = state.players.find((player) => player.id === BRUNO.id);
    expect(ana?.resources[resource]).toBe(0);
    expect(bruno?.resources[resource]).toBe(0);
    expect(state.bank[resource]).toBe(3);
    expect(events).toContainEqual({ type: 'ProductionSkipped', reason: 'scarcity', resource });
  });

  it('pays everyone when the bank just covers it', () => {
    const { state: before, resource } = scarce(
      [
        { player: ANA.id, type: 'city' },
        { player: BRUNO.id, type: 'city' },
      ],
      4,
    );
    const { state } = applyOrThrow(before, ANA.id, { type: 'rollDice' });

    const ana = state.players.find((player) => player.id === ANA.id);
    const bruno = state.players.find((player) => player.id === BRUNO.id);
    expect(ana?.resources[resource]).toBe(2);
    expect(bruno?.resources[resource]).toBe(2);
    expect(state.bank[resource]).toBe(0);
  });
});

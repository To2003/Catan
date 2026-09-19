import { describe, expect, it } from 'vitest';
import {
  BANK_RESOURCE_COUNT,
  BANK_TRADE_RATE,
  GENERIC_PORT_RATE,
  RESOURCES,
  SPECIFIC_PORT_RATE,
  applyAction,
  availableMaritimeRates,
  legalMaritimeTrades,
  maritimeRate,
  type PortType,
  type ReadonlyGameState,
  type Resource,
  type VertexId,
} from '../src/index.js';
import { ANA, BRUNO, applyOrThrow, draft, give, newGame, runSetup, totalOf } from './helpers.js';

const afterSetup = runSetup();

/** A vertex carrying the given harbour type. */
const portVertex = (state: ReadonlyGameState, type: PortType): VertexId => {
  const vertex = state.board.vertexIds.find((candidate) => {
    const port = state.board.vertices[candidate]?.port;
    return port === type && state.buildings[candidate] === undefined;
  });
  if (!vertex) throw new Error(`no free vertex on a ${type} harbour`);
  return vertex;
};

/** Main phase, Ana on turn, board wiped so only what a test places is there. */
const trading = (mutate: Parameters<typeof draft>[1] = () => {}): ReadonlyGameState =>
  draft(afterSetup, (s) => {
    s.currentPlayer = ANA.id;
    s.phase = { kind: 'main' };
    s.buildings = {};
    s.roads = {};
    for (const player of s.players) {
      for (const resource of RESOURCES) {
        s.bank[resource] += player.resources[resource];
        player.resources[resource] = 0;
      }
    }
    mutate(s);
  });

const anaIn = (state: ReadonlyGameState) => {
  const player = state.players.find((candidate) => candidate.id === ANA.id);
  if (!player) throw new Error('no Ana');
  return player;
};

describe('the rate the engine works out', () => {
  it('is 4:1 with no harbour at all', () => {
    const state = trading();
    expect(maritimeRate(state, ANA.id, 'wood')).toBe(BANK_TRADE_RATE);
    expect(availableMaritimeRates(state, ANA.id)).toEqual({
      wood: 4,
      brick: 4,
      sheep: 4,
      wheat: 4,
      ore: 4,
    });
  });

  it('is 3:1 on a generic harbour, for every resource', () => {
    const state = trading((s) => {
      s.buildings[portVertex(afterSetup, '3:1')] = { owner: ANA.id, type: 'settlement' };
    });
    for (const resource of RESOURCES) {
      expect(maritimeRate(state, ANA.id, resource)).toBe(GENERIC_PORT_RATE);
    }
  });

  it('is 2:1 on that harbour resource, and the best rate wins', () => {
    const state = trading((s) => {
      s.buildings[portVertex(afterSetup, 'ore')] = { owner: ANA.id, type: 'settlement' };
      s.buildings[portVertex(afterSetup, '3:1')] = { owner: ANA.id, type: 'settlement' };
    });

    expect(maritimeRate(state, ANA.id, 'ore')).toBe(SPECIFIC_PORT_RATE);
    // The generic harbour still covers everything else.
    expect(maritimeRate(state, ANA.id, 'wood')).toBe(GENERIC_PORT_RATE);
  });

  it('belongs to the owner of the building, not to whoever is on turn', () => {
    const state = trading((s) => {
      s.buildings[portVertex(afterSetup, '3:1')] = { owner: BRUNO.id, type: 'settlement' };
    });
    expect(maritimeRate(state, ANA.id, 'wood')).toBe(BANK_TRADE_RATE);
    expect(maritimeRate(state, BRUNO.id, 'wood')).toBe(GENERIC_PORT_RATE);
  });

  it('survives the upgrade: a city keeps the settlement’s harbour', () => {
    const vertex = portVertex(afterSetup, 'wheat');
    const withSettlement = trading((s) => {
      s.buildings[vertex] = { owner: ANA.id, type: 'settlement' };
      give(s, ANA.id, { wheat: 2, ore: 3 });
    });
    expect(maritimeRate(withSettlement, ANA.id, 'wheat')).toBe(SPECIFIC_PORT_RATE);

    const { state } = applyOrThrow(withSettlement, ANA.id, { type: 'upgradeCity', vertex });
    expect(state.buildings[vertex]?.type).toBe('city');
    expect(maritimeRate(state, ANA.id, 'wheat')).toBe(SPECIFIC_PORT_RATE);
  });

  it('counts a settlement placed during setup', () => {
    // Nothing special about setup placements: the harbour is a property of the
    // vertex, so the first settlement on one already grants the rate.
    const game = newGame();
    const vertex = portVertex(game, 'sheep');
    const { state } = applyOrThrow(game, game.currentPlayer, {
      type: 'placeSettlement',
      vertex,
    });
    expect(maritimeRate(state, game.currentPlayer, 'sheep')).toBe(SPECIFIC_PORT_RATE);
  });
});

describe('trading with the bank', () => {
  it('gives the rate to the bank and takes one card back', () => {
    const before = trading((s) => {
      give(s, ANA.id, { wood: 4 });
    });
    const { state, events } = applyOrThrow(before, ANA.id, {
      type: 'maritimeTrade',
      give: 'wood',
      want: 'ore',
    });

    expect(anaIn(state).resources.wood).toBe(0);
    expect(anaIn(state).resources.ore).toBe(1);
    expect(state.bank.wood).toBe(before.bank.wood + BANK_TRADE_RATE);
    expect(state.bank.ore).toBe(before.bank.ore - 1);
    expect(events).toContainEqual({
      type: 'MaritimeTraded',
      player: ANA.id,
      give: 'wood',
      gave: BANK_TRADE_RATE,
      want: 'ore',
      rate: BANK_TRADE_RATE,
    });

    for (const resource of RESOURCES) expect(totalOf(state, resource)).toBe(BANK_RESOURCE_COUNT);
  });

  it('charges only 2 through the right harbour', () => {
    const before = trading((s) => {
      s.buildings[portVertex(afterSetup, 'brick')] = { owner: ANA.id, type: 'settlement' };
      give(s, ANA.id, { brick: 2 });
    });
    const { state } = applyOrThrow(before, ANA.id, {
      type: 'maritimeTrade',
      give: 'brick',
      want: 'wheat',
    });

    expect(anaIn(state).resources.brick).toBe(0);
    expect(anaIn(state).resources.wheat).toBe(1);
  });

  it('rejects giving and wanting the same resource', () => {
    const state = trading((s) => {
      give(s, ANA.id, { wood: 8 });
    });
    expect(
      applyAction(state, ANA.id, { type: 'maritimeTrade', give: 'wood', want: 'wood' }),
    ).toEqual({ ok: false, error: 'INVALID_TARGET' });
  });

  it('rejects a hand one card short of the rate', () => {
    const state = trading((s) => {
      give(s, ANA.id, { wood: BANK_TRADE_RATE - 1 });
    });
    expect(
      applyAction(state, ANA.id, { type: 'maritimeTrade', give: 'wood', want: 'ore' }),
    ).toEqual({ ok: false, error: 'INSUFFICIENT_RESOURCES' });
  });

  it('rejects asking for a resource the bank has run out of', () => {
    const state = trading((s) => {
      give(s, ANA.id, { wood: 4 });
      // Everything else is in Bruno's hand, so the totals still add up.
      give(s, BRUNO.id, { ore: s.bank.ore });
    });
    expect(state.bank.ore).toBe(0);
    expect(
      applyAction(state, ANA.id, { type: 'maritimeTrade', give: 'wood', want: 'ore' }),
    ).toEqual({ ok: false, error: 'INSUFFICIENT_RESOURCES' });
  });

  it('is only for the active player, and only in the main phase', () => {
    const state = trading((s) => {
      give(s, ANA.id, { wood: 4 });
    });
    expect(
      applyAction(state, BRUNO.id, { type: 'maritimeTrade', give: 'wood', want: 'ore' }),
    ).toEqual({ ok: false, error: 'NOT_YOUR_TURN' });

    const preRoll = draft(state, (s) => {
      s.phase = { kind: 'preRoll' };
    });
    expect(
      applyAction(preRoll, ANA.id, { type: 'maritimeTrade', give: 'wood', want: 'ore' }),
    ).toEqual({ ok: false, error: 'WRONG_PHASE' });
  });
});

describe('the legal trades offered to the UI', () => {
  it('lists the four other resources once the player can pay', () => {
    const state = trading((s) => {
      give(s, ANA.id, { wood: 4 });
    });
    const trades = legalMaritimeTrades(state, ANA.id);
    expect(trades).toHaveLength(4);
    expect(trades.every((trade) => trade.give === 'wood')).toBe(true);
    expect(trades.map((trade) => trade.want).sort()).toEqual(
      RESOURCES.filter((resource: Resource) => resource !== 'wood').sort(),
    );
  });

  it('is empty with an empty hand, and never lists give === want', () => {
    expect(legalMaritimeTrades(trading(), ANA.id)).toEqual([]);

    const rich = trading((s) => {
      give(s, ANA.id, { wood: 4, brick: 4, sheep: 4, wheat: 4, ore: 3 });
    });
    const trades = legalMaritimeTrades(rich, ANA.id);
    expect(trades.some((trade) => trade.give === trade.want)).toBe(false);
    // Four resources fully paid for, each tradeable for the other four.
    expect(trades).toHaveLength(16);
  });
});

import { describe, expect, it } from 'vitest';
import {
  BANK_RESOURCE_COUNT,
  COSTS,
  PIECE_STOCK,
  RESOURCES,
  applyAction,
  legalRoadSpots,
  legalSettlementSpots,
  type EdgeId,
  type ReadonlyGameState,
  type VertexId,
} from '../src/index.js';
import {
  ANA,
  BRUNO,
  at,
  applyOrThrow,
  draft,
  everyRoadTouchesOwnNetwork,
  extendUntilSettlementSpot,
  findFreePath,
  type FreePath,
  give,
  runSetup,
  totalOf,
} from './helpers.js';

/** A post-setup position with Ana on turn in the main phase and a full hand. */
const mainPhase = (hand = { wood: 5, brick: 5, sheep: 5, wheat: 5, ore: 5 }): ReadonlyGameState => {
  const afterSetup = runSetup();
  const ana = afterSetup.players.find((player) => player.id === ANA.id);
  expect(ana).toBeDefined();
  return draft(afterSetup, (s) => {
    s.currentPlayer = ANA.id;
    s.phase = { kind: 'main' };
    give(s, ANA.id, hand);
  });
};

const anaIn = (state: ReadonlyGameState) => {
  const player = state.players.find((candidate) => candidate.id === ANA.id);
  if (!player) throw new Error('no Ana');
  return player;
};

describe('building a road', () => {
  it('places it, pays the bank and spends a piece', () => {
    const before = mainPhase();
    const edge = at(legalRoadSpots(before, ANA.id), 0);
    const { state, events } = applyOrThrow(before, ANA.id, { type: 'placeRoad', edge });

    expect(state.roads[edge]).toBe(ANA.id);
    expect(anaIn(state).stock.roads).toBe(anaIn(before).stock.roads - 1);
    expect(anaIn(state).resources.wood).toBe(anaIn(before).resources.wood - COSTS.road.wood);
    expect(state.bank.wood).toBe(before.bank.wood + COSTS.road.wood);
    expect(events.map((event) => event.type)).toEqual(['ResourcesPaid', 'RoadPlaced']);
  });

  it('keeps every resource conserved', () => {
    const before = mainPhase();
    const edge = at(legalRoadSpots(before, ANA.id), 0);
    const { state } = applyOrThrow(before, ANA.id, { type: 'placeRoad', edge });
    for (const resource of RESOURCES) expect(totalOf(state, resource)).toBe(BANK_RESOURCE_COUNT);
  });
});

describe('building a settlement', () => {
  it('places it, pays the bank and spends a piece', () => {
    // Straight out of setup every free vertex next to Ana's roads is blocked by
    // the distance rule, so she has to extend first.
    const before = extendUntilSettlementSpot(mainPhase(), ANA.id);
    const vertex = at(legalSettlementSpots(before, ANA.id), 0);
    const { state, events } = applyOrThrow(before, ANA.id, { type: 'placeSettlement', vertex });

    expect(state.buildings[vertex]).toEqual({ owner: ANA.id, type: 'settlement' });
    expect(anaIn(state).stock.settlements).toBe(anaIn(before).stock.settlements - 1);
    expect(events.map((event) => event.type)).toEqual(['ResourcesPaid', 'BuildingPlaced']);

    for (const resource of RESOURCES) {
      expect(anaIn(state).resources[resource]).toBe(
        anaIn(before).resources[resource] - COSTS.settlement[resource],
      );
      expect(totalOf(state, resource)).toBe(BANK_RESOURCE_COUNT);
    }
  });

  it('is rejected on a vertex with no road of its own, however rich the player', () => {
    const before = mainPhase();
    const unconnected = before.board.vertexIds.find(
      (vertex) =>
        before.buildings[vertex] === undefined &&
        (before.board.vertices[vertex]?.neighbors ?? []).every(
          (neighbor) => before.buildings[neighbor] === undefined,
        ) &&
        (before.board.vertices[vertex]?.edges ?? []).every(
          (edge) => before.roads[edge] === undefined,
        ),
    );
    if (!unconnected) throw new Error('every free vertex is connected');
    expect(applyAction(before, ANA.id, { type: 'placeSettlement', vertex: unconnected })).toEqual({
      ok: false,
      error: 'NOT_CONNECTED',
    });
  });
});

describe('upgrading to a city', () => {
  const ownSettlement = (state: ReadonlyGameState): VertexId => {
    const vertex = state.board.vertexIds.find(
      (candidate) =>
        state.buildings[candidate]?.owner === ANA.id &&
        state.buildings[candidate].type === 'settlement',
    );
    if (!vertex) throw new Error('Ana has no settlement');
    return vertex;
  };

  it('replaces the settlement and returns the piece to stock', () => {
    const before = mainPhase();
    const vertex = ownSettlement(before);
    const { state, events } = applyOrThrow(before, ANA.id, { type: 'upgradeCity', vertex });

    expect(state.buildings[vertex]).toEqual({ owner: ANA.id, type: 'city' });
    expect(anaIn(state).stock.cities).toBe(PIECE_STOCK.cities - 1);
    expect(anaIn(state).stock.settlements).toBe(anaIn(before).stock.settlements + 1);
    expect(events.map((event) => event.type)).toEqual(['ResourcesPaid', 'CityUpgraded']);

    expect(anaIn(state).resources.ore).toBe(anaIn(before).resources.ore - COSTS.city.ore);
    expect(anaIn(state).resources.wheat).toBe(anaIn(before).resources.wheat - COSTS.city.wheat);
    for (const resource of RESOURCES) expect(totalOf(state, resource)).toBe(BANK_RESOURCE_COUNT);
  });

  it('is rejected on a rival settlement', () => {
    const before = mainPhase();
    const rival = before.board.vertexIds.find(
      (vertex) => before.buildings[vertex]?.owner === BRUNO.id,
    );
    if (!rival) throw new Error('Bruno has no settlement');
    expect(applyAction(before, ANA.id, { type: 'upgradeCity', vertex: rival })).toEqual({
      ok: false,
      error: 'NOT_OWNER',
    });
  });
});

describe('a rival settlement may split a road network', () => {
  /**
   * Bruno settles in the middle of Ana's road, at a vertex far from her
   * buildings that he reaches with a road of his own. It is a legal placement,
   * and it leaves the far end of Ana's chain reachable only through a vertex
   * she may not pass. Hence the board invariant is local — every road touches
   * another own road or an own building — while "no crossing a rival building"
   * stays a rule about *building* a road (SPEC.md §4.4).
   */
  it('is legal, and the roads stay on the board', () => {
    let state = mainPhase();

    // A three-road chain out of one of Ana's settlements whose middle junction
    // is free, has a spare edge for Bruno and no building next to it.
    const junctionIsUsable = (vertex: VertexId): boolean => {
      const node = state.board.vertices[vertex];
      if (!node || node.edges.length < 3) return false;
      if (state.buildings[vertex] !== undefined) return false;
      if (node.neighbors.some((neighbor) => state.buildings[neighbor] !== undefined)) return false;
      return true;
    };

    let path: FreePath | undefined;
    for (const vertex of state.board.vertexIds) {
      if (state.buildings[vertex]?.owner !== ANA.id) continue;
      path = findFreePath(state, vertex, 3, (candidate) =>
        junctionIsUsable(at(candidate.vertices, 2)),
      );
      if (path) break;
    }
    if (!path) throw new Error('no three-road chain with a usable middle junction');

    const chain: EdgeId[] = [];
    for (const edge of path.edges) {
      state = applyOrThrow(state, ANA.id, { type: 'placeRoad', edge }).state;
      chain.push(edge);
    }

    const middle = at(path.vertices, 2);

    // Bruno arrives with a road of his own and settles there.
    const brunoRoad = (state.board.vertices[middle]?.edges ?? []).find(
      (edge) => state.roads[edge] === undefined,
    );
    if (!brunoRoad) throw new Error('no edge left for Bruno');

    const withBruno = draft(state, (s) => {
      s.roads[brunoRoad] = BRUNO.id;
      s.currentPlayer = BRUNO.id;
      give(s, BRUNO.id, COSTS.settlement);
    });

    const result = applyAction(withBruno, BRUNO.id, { type: 'placeSettlement', vertex: middle });
    expect(result).toMatchObject({ ok: true });
    if (!result.ok) return;

    // Ana keeps every road, split network and all, and the local invariant holds.
    for (const edge of chain) expect(result.state.roads[edge]).toBe(ANA.id);
    expect(everyRoadTouchesOwnNetwork(result.state)).toBe(true);

    // The far end of the chain now hangs off the blocked vertex: Ana cannot
    // build past it, which is the rule the invariant must not be confused with.
    const beyond = (result.state.board.vertices[middle]?.edges ?? []).filter(
      (edge) => result.state.roads[edge] === undefined,
    );
    const asAna = draft(result.state, (s) => {
      s.currentPlayer = ANA.id;
      give(s, ANA.id, COSTS.road);
    });
    for (const edge of beyond) {
      expect(applyAction(asAna, ANA.id, { type: 'placeRoad', edge })).toEqual({
        ok: false,
        error: 'NOT_CONNECTED',
      });
    }
  });
});

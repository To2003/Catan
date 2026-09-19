import { describe, expect, it } from 'vitest';
import {
  PIECE_STOCK,
  applyAction,
  legalRoadSpots,
  type GameState,
  type ReadonlyGameState,
} from '../src/index.js';
import { ANA, BRUNO, at, applyOrThrow, draft, runSetup } from './helpers.js';

const afterSetup = runSetup();

const withCard = (mutate: (draft: GameState) => void = () => {}): ReadonlyGameState =>
  draft(afterSetup, (s) => {
    s.currentPlayer = ANA.id;
    s.phase = { kind: 'main' };
    const ana = s.players.find((player) => player.id === ANA.id);
    if (ana) ana.devCards = ['roadBuilding'];
    mutate(s);
  });

const anaIn = (state: ReadonlyGameState) => {
  const player = state.players.find((candidate) => candidate.id === ANA.id);
  if (!player) throw new Error('no Ana');
  return player;
};

describe('the road building card', () => {
  it('opens a phase for two free roads', () => {
    const { state, events } = applyOrThrow(withCard(), ANA.id, { type: 'playRoadBuilding' });

    expect(state.phase).toEqual({ kind: 'roadBuilding', remaining: 2 });
    expect(events).toContainEqual({ type: 'RoadBuildingStarted', player: ANA.id, remaining: 2 });
    expect(anaIn(state).devCards).toEqual([]);
  });

  it('places both roads without charging for them', () => {
    const before = withCard();
    let state = applyOrThrow(before, ANA.id, { type: 'playRoadBuilding' }).state;

    for (let i = 0; i < 2; i += 1) {
      const edge = at(legalRoadSpots(state, ANA.id), 0);
      state = applyOrThrow(state, ANA.id, { type: 'placeRoad', edge }).state;
    }

    expect(state.phase).toEqual({ kind: 'main' });
    expect(anaIn(state).resources).toEqual(anaIn(before).resources);
    expect(anaIn(state).stock.roads).toBe(anaIn(before).stock.roads - 2);
  });

  it('accepts nothing but a road while the phase is open', () => {
    const state = applyOrThrow(withCard(), ANA.id, { type: 'playRoadBuilding' }).state;
    expect(applyAction(state, ANA.id, { type: 'endTurn' })).toEqual({
      ok: false,
      error: 'WRONG_PHASE',
    });
    expect(applyAction(state, ANA.id, { type: 'buyDevCard' })).toEqual({
      ok: false,
      error: 'WRONG_PHASE',
    });
  });

  it('ends on its own when the last piece is spent, and keeps the card spent', () => {
    const before = withCard((s) => {
      const ana = s.players.find((player) => player.id === ANA.id);
      if (ana) ana.stock.roads = 1;
    });

    let state = applyOrThrow(before, ANA.id, { type: 'playRoadBuilding' }).state;
    const edge = at(legalRoadSpots(state, ANA.id), 0);
    const { state: after, events } = applyOrThrow(state, ANA.id, { type: 'placeRoad', edge });
    state = after;

    // One road placed, no pieces left: the phase closes rather than waiting.
    expect(state.phase).toEqual({ kind: 'main' });
    expect(events).toContainEqual({ type: 'RoadBuildingEnded', player: ANA.id, placed: 1 });
    expect(anaIn(state).devCards).toEqual([]);
  });

  it('ends on its own when there is nowhere left to build', () => {
    // Ana's whole network walled in by Bruno's buildings, save one edge.
    const before = withCard((s) => {
      s.roads = {};
      const start = at(s.board.vertexIds, 0);
      const [first, second] = s.board.vertices[start]?.edges ?? [];
      if (!first || !second) throw new Error('vertex without two edges');

      s.buildings = { [start]: { owner: ANA.id, type: 'settlement' } };
      // Every neighbour of the far ends carries a rival building, so once the
      // first edge is taken there is nothing legal left.
      for (const edge of [first, second]) {
        const link = s.board.edges[edge];
        if (!link) continue;
        for (const vertex of link.vertices) {
          if (vertex === start) continue;
          if (edge === second) s.buildings[vertex] = { owner: BRUNO.id, type: 'settlement' };
        }
      }
    });

    let state = applyOrThrow(before, ANA.id, { type: 'playRoadBuilding' }).state;
    const spots = legalRoadSpots(state, ANA.id);
    expect(spots.length).toBeGreaterThan(0);

    // Take every legal spot until the phase closes; it must not outlive them.
    for (let guard = 0; state.phase.kind === 'roadBuilding'; guard += 1) {
      if (guard > 3) throw new Error('the phase outlived its legal placements');
      const available = legalRoadSpots(state, ANA.id);
      expect(available.length).toBeGreaterThan(0);
      state = applyOrThrow(state, ANA.id, { type: 'placeRoad', edge: at(available, 0) }).state;
    }
    expect(state.phase).toEqual({ kind: 'main' });
  });

  it('is refused outright when there is nowhere legal at all', () => {
    const noRoom = withCard((s) => {
      s.roads = {};
      s.buildings = {};
    });
    expect(applyAction(noRoom, ANA.id, { type: 'playRoadBuilding' })).toEqual({
      ok: false,
      error: 'NO_LEGAL_PLACEMENT',
    });
    // And the card is still in hand.
    expect(anaIn(noRoom).devCards).toEqual(['roadBuilding']);
  });

  it('is refused with no road pieces left', () => {
    const noPieces = withCard((s) => {
      const ana = s.players.find((player) => player.id === ANA.id);
      if (ana) ana.stock.roads = 0;
    });
    expect(applyAction(noPieces, ANA.id, { type: 'playRoadBuilding' })).toEqual({
      ok: false,
      error: 'NO_LEGAL_PLACEMENT',
    });
  });

  it('leaves the piece stock consistent', () => {
    let state = applyOrThrow(withCard(), ANA.id, { type: 'playRoadBuilding' }).state;
    while (state.phase.kind === 'roadBuilding') {
      state = applyOrThrow(state, ANA.id, {
        type: 'placeRoad',
        edge: at(legalRoadSpots(state, ANA.id), 0),
      }).state;
    }
    const onBoard = Object.values(state.roads).filter((owner) => owner === ANA.id).length;
    expect(anaIn(state).stock.roads + onBoard).toBe(PIECE_STOCK.roads);
  });
});

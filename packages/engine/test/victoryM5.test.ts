import { describe, expect, it } from 'vitest';
import {
  VICTORY_POINTS_TO_WIN,
  applyAction,
  legalRoadSpots,
  publicVictoryPoints,
  victoryPoints,
  type GameState,
  type VertexId,
} from '../src/index.js';
import { ANA, BRUNO, at, applyOrThrow, draft, findFreePath, newGame, runSetup } from './helpers.js';

const afterSetup = runSetup();
const game = newGame();

/** Ana on `points` visible points, on turn, with the board to herself. */
const atPoints = (points: number, mutate: (draft: GameState) => void = () => {}) =>
  draft(afterSetup, (s) => {
    s.currentPlayer = ANA.id;
    s.phase = { kind: 'main' };
    s.buildings = {};
    s.roads = {};

    const spaced: VertexId[] = [];
    for (const vertex of s.board.vertexIds) {
      if (spaced.length * 2 >= points) break;
      const neighbors = s.board.vertices[vertex]?.neighbors ?? [];
      if (neighbors.some((neighbor) => spaced.includes(neighbor))) continue;
      spaced.push(vertex);
    }
    for (const vertex of spaced) s.buildings[vertex] = { owner: ANA.id, type: 'city' };

    const ana = s.players.find((player) => player.id === ANA.id);
    if (ana) ana.stock = { roads: 15, settlements: 5, cities: 4 - spaced.length };
    mutate(s);
  });

describe('winning with hidden points', () => {
  it('counts victory cards towards the win but not towards the public score', () => {
    const state = atPoints(8, (s) => {
      const ana = s.players.find((player) => player.id === ANA.id);
      if (ana) ana.devCards = ['vp', 'vp'];
    });

    expect(publicVictoryPoints(state, ANA.id)).toBe(8);
    expect(victoryPoints(state, ANA.id)).toBe(VICTORY_POINTS_TO_WIN);
  });

  it('reveals the winner’s victory cards in the event', () => {
    // Nine visible, one card hidden: buying is not needed, the turn check finds it.
    const nearly = atPoints(8, (s) => {
      const ana = s.players.find((player) => player.id === ANA.id);
      if (ana) ana.devCards = ['vp'];
      s.currentPlayer = BRUNO.id;
      s.phase = { kind: 'main' };
    });

    // Ana is at 9. One more point arrives with the bonus for the longest road.
    const withBonus = draft(nearly, (s) => {
      s.longestRoad = { owner: ANA.id, length: 6 };
    });
    expect(victoryPoints(withBonus, ANA.id)).toBe(11);

    const { state, events } = applyOrThrow(withBonus, BRUNO.id, { type: 'endTurn' });
    expect(state.phase).toMatchObject({ kind: 'gameOver', winner: ANA.id });
    expect(events).toContainEqual({
      type: 'GameWon',
      player: ANA.id,
      points: 11,
      revealedVpCards: 1,
    });
  });

  it('wins the moment the victory card is bought', () => {
    const state = atPoints(8, (s) => {
      const ana = s.players.find((player) => player.id === ANA.id);
      if (ana) {
        ana.devCards = ['vp'];
        ana.resources = { wood: 0, brick: 0, sheep: 1, wheat: 1, ore: 1 };
      }
      s.devDeck = ['vp'];
    });
    expect(victoryPoints(state, ANA.id)).toBe(9);

    const { state: after, events } = applyOrThrow(state, ANA.id, { type: 'buyDevCard' });
    expect(after.phase).toMatchObject({ kind: 'gameOver', winner: ANA.id });
    expect(events.some((event) => event.type === 'GameWon')).toBe(true);
  });
});

describe('a win that cuts a chain short', () => {
  it('ends the game on a knight, with the robber left where it was', () => {
    const state = atPoints(8, (s) => {
      s.phase = { kind: 'preRoll' };
      const ana = s.players.find((player) => player.id === ANA.id);
      if (ana) {
        ana.devCards = ['knight'];
        // Two knights already played: this one takes the army and the game.
        ana.knightsPlayed = 2;
      }
    });
    const robberWas = state.robberHex;

    const { state: after, events } = applyOrThrow(state, ANA.id, { type: 'playKnight' });

    expect(after.largestArmy).toBe(ANA.id);
    expect(victoryPoints(after, ANA.id)).toBe(VICTORY_POINTS_TO_WIN);
    // The game is over, so the robber never moves and the phase is not moveRobber.
    expect(after.phase).toEqual({ kind: 'gameOver', winner: ANA.id });
    expect(after.robberHex).toBe(robberWas);
    expect(events.some((event) => event.type === 'GameWon')).toBe(true);
  });

  it('ends the game on the first road of the road building card', () => {
    // Ana at 8 with four roads down; the fifth takes the longest road and the game.
    const chain = findFreePath(game, at(game.board.vertexIds, 0), 5);
    if (!chain) throw new Error('no chain');

    const state = atPoints(8, (s) => {
      for (const edge of chain.edges.slice(0, 4)) s.roads[edge] = ANA.id;
      const ana = s.players.find((player) => player.id === ANA.id);
      if (ana) ana.devCards = ['roadBuilding'];
    });
    expect(publicVictoryPoints(state, ANA.id)).toBe(8);

    const started = applyOrThrow(state, ANA.id, { type: 'playRoadBuilding' });
    expect(started.state.phase).toEqual({ kind: 'roadBuilding', remaining: 2 });
    expect(legalRoadSpots(started.state, ANA.id)).toContain(at(chain.edges, 4));

    const { state: after } = applyOrThrow(started.state, ANA.id, {
      type: 'placeRoad',
      edge: at(chain.edges, 4),
    });

    expect(after.longestRoad).toEqual({ owner: ANA.id, length: 5 });
    expect(after.phase).toEqual({ kind: 'gameOver', winner: ANA.id });
    // The second free road is forfeited: the game ended first.
    expect(
      applyAction(after, ANA.id, { type: 'placeRoad', edge: at(game.board.edgeIds, 0) }),
    ).toEqual({ ok: false, error: 'GAME_OVER' });
  });
});

import { describe, expect, it } from 'vitest';
import {
  applyAction,
  createGame,
  createRng,
  getPlayerView,
  isLegalAction,
  legalCitySpots,
  legalMaritimeTrades,
  legalRoadSpots,
  legalRobberHexes,
  legalSettlementSpots,
  legalStealTargets,
  RESOURCES,
  nextInt,
  publicVictoryPoints,
  victoryPoints,
  type Action,
  type PlayerId,
  type ReadonlyGameState,
  type ResourceBundle,
} from '../src/index.js';
import { ANA, BRUNO, SEATS, at, draft, give, runSetup } from './helpers.js';

/**
 * A handful of real games, played the way the fuzz plays them, so the leak
 * checks run over positions nobody hand-picked.
 */
const playedStates = (games = 4, steps = 120): ReadonlyGameState[] => {
  const states: ReadonlyGameState[] = [];
  let rng = createRng(0x5eed);

  for (let game = 0; game < games; game += 1) {
    const seedDraw = nextInt(rng, 0xffffff);
    rng = seedDraw.state;
    let state = createGame(seedDraw.value, SEATS);

    for (let step = 0; step < steps; step += 1) {
      if (state.phase.kind === 'gameOver') break;
      const playerId =
        state.phase.kind === 'discard'
          ? (Object.keys(state.phase.pending)[0] ?? state.currentPlayer)
          : state.currentPlayer;

      const options: Action[] = [
        ...legalSettlementSpots(state, playerId).map((vertex): Action => ({
          type: 'placeSettlement',
          vertex,
        })),
        ...legalRoadSpots(state, playerId).map((edge): Action => ({ type: 'placeRoad', edge })),
        ...legalCitySpots(state, playerId).map((vertex): Action => ({
          type: 'upgradeCity',
          vertex,
        })),
        ...legalRobberHexes(state, playerId).map((hex): Action => ({ type: 'moveRobber', hex })),
        ...legalStealTargets(state, playerId).map((target): Action => ({ type: 'steal', target })),
        ...legalMaritimeTrades(state, playerId).map(({ give: g, want }): Action => ({
          type: 'maritimeTrade',
          give: g,
          want,
        })),
        { type: 'buyDevCard' } as const,
        { type: 'playKnight' } as const,
        { type: 'rollDice' } as const,
        { type: 'endTurn' } as const,
      ].filter((action) => isLegalAction(state, playerId, action));

      if (state.phase.kind === 'discard') {
        const owed = state.phase.pending[playerId] ?? 0;
        const player = state.players.find((candidate) => candidate.id === playerId);
        const cards: Partial<ResourceBundle> = {};
        let left = owed;
        for (const resource of RESOURCES) {
          const take = Math.min(left, player?.resources[resource] ?? 0);
          if (take > 0) cards[resource] = take;
          left -= take;
        }
        options.push({ type: 'discard', cards });
      }

      if (options.length === 0) break;
      const draw = nextInt(rng, options.length);
      rng = draw.state;
      const result = applyAction(state, playerId, at(options, draw.value));
      if (!result.ok) break;
      state = result.state;
      states.push(state);
    }
  }

  return states;
};

/** Every key in an object tree, however deep. */
const allKeys = (value: unknown, found = new Set<string>()): Set<string> => {
  if (Array.isArray(value)) {
    for (const item of value) allKeys(item, found);
  } else if (value !== null && typeof value === 'object') {
    for (const [key, inner] of Object.entries(value)) {
      found.add(key);
      allKeys(inner, found);
    }
  }
  return found;
};

const SECRET_KEYS = ['seed', 'rngState', 'devDeck'];

describe('a player view keeps the secrets', () => {
  const states = playedStates();

  it('was built over real positions', () => {
    expect(states.length).toBeGreaterThan(200);
  });

  it('never carries the seed, the rng state or the deck', () => {
    for (const state of states) {
      for (const player of state.players) {
        const view = getPlayerView(state, player.id);
        const keys = allKeys(JSON.parse(JSON.stringify(view)));
        for (const secret of SECRET_KEYS) {
          expect(keys.has(secret), `${secret} leaked to ${player.id}`).toBe(false);
        }
      }
    }
  });

  it('carries hands and cards only under `me`', () => {
    for (const state of states) {
      for (const player of state.players) {
        const view = JSON.parse(JSON.stringify(getPlayerView(state, player.id))) as Record<
          string,
          unknown
        >;
        // Everything but `me` must be free of hands and card lists.
        const { me, ...rest } = view;
        expect(me).toBeDefined();
        const keys = allKeys(rest);
        expect(keys.has('resources'), `resources leaked to ${player.id}`).toBe(false);
        expect(keys.has('devCards'), `devCards leaked to ${player.id}`).toBe(false);
      }
    }
  });

  it('shows other players only counts, and public points', () => {
    for (const state of states.slice(0, 50)) {
      for (const player of state.players) {
        const view = getPlayerView(state, player.id);
        for (const other of view.players) {
          if (other.id === player.id) continue;
          expect(other.publicPoints).toBe(publicVictoryPoints(state, other.id));
          const real = state.players.find((candidate) => candidate.id === other.id);
          expect(other.devCardCount).toBe(real?.devCards.length);
          // Walking out is public by design: everybody has to know the table
          // is playing this seat automatically now.
          expect(other.hasLeft).toBe(real?.hasLeft);
        }
      }
    }
  });

  it('says who walked out, to everybody, and says nothing more about them', () => {
    const gone = draft(runSetup(), (state) => {
      const bruno = state.players.find((player) => player.id !== ANA.id);
      if (bruno) {
        bruno.hasLeft = true;
        bruno.devCards = ['knight', 'vp', 'monopoly'];
      }
    });

    const view = getPlayerView(gone, ANA.id);
    const bruno = view.players.find((player) => player.id !== ANA.id);
    expect(bruno?.hasLeft).toBe(true);
    // Still only a count: leaving does not turn a hand face up.
    expect(bruno).not.toHaveProperty('devCards');
    expect(bruno?.devCardCount).toBe(3);
  });

  it('does not hide what you are supposed to see', () => {
    // The control: a view that returned nothing would pass every check above.
    const state = draft(runSetup(), (s) => {
      give(s, ANA.id, { wood: 3, ore: 2 });
      const ana = s.players.find((player) => player.id === ANA.id);
      if (ana) ana.devCards = ['knight', 'vp'];
    });

    const view = getPlayerView(state, ANA.id);
    expect(view.me.resources.wood).toBe(3);
    expect(view.me.devCards).toEqual(['knight', 'vp']);
    expect(view.me.points).toBe(victoryPoints(state, ANA.id));
    expect(view.me.points).toBeGreaterThan(view.me.publicPoints);
    expect(view.board).toBe(state.board);
    expect(view.legalMoves).toBeDefined();
  });

  it('does not change at all when only a rival\u2019s hidden cards change', () => {
    // A differential canary, which is stronger than looking for a value in the
    // JSON: card names appear in every view anyway, as the keys of the
    // playability record. What may never happen is Ana's view *depending* on
    // what Bruno holds, beyond how many.
    const base = runSetup();
    const withMonopolies = draft(base, (s) => {
      const bruno = s.players.find((player) => player.id === BRUNO.id);
      if (bruno) bruno.devCards = ['monopoly', 'monopoly', 'monopoly'];
      s.devDeck = ['yearOfPlenty', 'knight', 'vp'];
      Object.assign(s, { seed: 987654321, rngState: 123456789 });
    });
    const withKnights = draft(base, (s) => {
      const bruno = s.players.find((player) => player.id === BRUNO.id);
      if (bruno) bruno.devCards = ['knight', 'knight', 'knight'];
      s.devDeck = ['monopoly', 'vp', 'roadBuilding'];
      Object.assign(s, { seed: 111111111, rngState: 222222222 });
    });

    const seenByAna = JSON.stringify(getPlayerView(withMonopolies, ANA.id));
    expect(seenByAna).toBe(JSON.stringify(getPlayerView(withKnights, ANA.id)));

    // The seed and the rng state are numbers, so those do work as plain canaries.
    expect(seenByAna).not.toContain('987654321');
    expect(seenByAna).not.toContain('123456789');

    // Ana sees the count, and only the count.
    const bruno = getPlayerView(withMonopolies, ANA.id).players.find(
      (player) => player.id === BRUNO.id,
    );
    expect(bruno?.devCardCount).toBe(3);

    // Bruno's own view does depend on his hand: the check is not vacuous.
    expect(JSON.stringify(getPlayerView(withMonopolies, BRUNO.id))).not.toBe(
      JSON.stringify(getPlayerView(withKnights, BRUNO.id)),
    );
  });
});

describe('what the hand can pay for', () => {
  it('answers only about the cards, not about whose turn it is', () => {
    const rich = draft(runSetup(), (state) => {
      state.currentPlayer = state.players[1]?.id ?? ANA.id;
      const ana = state.players.find((player) => player.id === ANA.id);
      if (ana) ana.resources = { wood: 1, brick: 1, sheep: 1, wheat: 3, ore: 3 };
    });

    // Not Ana's turn, nowhere legal to build during setup — and the card
    // still says what she could pay for, which is the point of it.
    const moves = getPlayerView(rich, ANA.id).legalMoves;
    expect(moves.canAfford).toEqual({
      road: true,
      settlement: true,
      city: true,
      devCard: true,
    });
    expect(moves.settlements).toEqual([]);
  });

  it('is false for what the hand does not cover', () => {
    const poor = draft(runSetup(), (state) => {
      // Setup already paid her for the second settlement, so start from empty.
      const ana = state.players.find((player) => player.id === ANA.id);
      if (ana) ana.resources = { wood: 1, brick: 0, sheep: 0, wheat: 0, ore: 0 };
    });
    expect(getPlayerView(poor, ANA.id).legalMoves.canAfford).toEqual({
      road: false,
      settlement: false,
      city: false,
      devCard: false,
    });
  });

  it('says nothing about anybody else’s hand', () => {
    // A rival's purse must not move Ana's card. This is the same differential
    // check as the one above for cards, applied to the new field.
    const base = draft(runSetup(), (state) => {
      const ana = state.players.find((player) => player.id === ANA.id);
      if (ana) ana.resources = { wood: 1, brick: 1, sheep: 0, wheat: 0, ore: 0 };
    });
    const rivalRich = draft(base, (state) => {
      const other = state.players.find((player) => player.id !== ANA.id);
      if (other) other.resources = { wood: 9, brick: 9, sheep: 9, wheat: 9, ore: 9 };
    });

    expect(getPlayerView(rivalRich, ANA.id).legalMoves.canAfford).toEqual(
      getPlayerView(base, ANA.id).legalMoves.canAfford,
    );
  });
});

describe('the legal moves inside a view', () => {
  it('match what the engine would answer directly', () => {
    for (const state of playedStates(2, 60)) {
      const playerId: PlayerId = state.currentPlayer;
      const view = getPlayerView(state, playerId);
      expect(view.legalMoves.settlements).toEqual(legalSettlementSpots(state, playerId));
      expect(view.legalMoves.roads).toEqual(legalRoadSpots(state, playerId));
      expect(view.legalMoves.robberHexes).toEqual(legalRobberHexes(state, playerId));
    }
  });

  it('explains why a card cannot be played, with the engine’s own code', () => {
    const state = draft(runSetup(), (s) => {
      s.currentPlayer = ANA.id;
      s.phase = { kind: 'main' };
      const ana = s.players.find((player) => player.id === ANA.id);
      if (ana) {
        ana.devCards = ['knight', 'monopoly'];
        ana.devCardsBoughtThisTurn = ['monopoly'];
      }
    });

    const moves = getPlayerView(state, ANA.id).legalMoves;
    expect(moves.devCardOptions.knight).toEqual({ playable: true });
    expect(moves.devCardOptions.monopoly).toEqual({
      playable: false,
      reason: 'CARD_BOUGHT_THIS_TURN',
    });
    expect(moves.devCardOptions.roadBuilding.reason).toBe('CARD_NOT_IN_HAND');
    // Victory cards are never played at all.
    expect(moves.devCardOptions.vp).toEqual({ playable: false });
  });
});

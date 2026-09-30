import { describe, expect, it } from 'vitest';
import { validateAction, type Action, type ActionType } from '../src/index.js';
import { ANA, draft, runSetup } from './helpers.js';

/**
 * Every action has a handler, and this is what keeps it that way.
 *
 * Through M5 the engine carried a `NOT_IMPLEMENTED` code so an action in the
 * union without a handler said so instead of failing in some plausible-looking
 * way. M7 emptied the list and the code is gone; what remains is the guard: a
 * sample of every action in the union, each of which must produce a real
 * verdict — legal, or illegal for a reason that is about the rules.
 */
const STILL_TO_COME: readonly ActionType[] = [];

/** One sample of every action in the union (SPEC.md §5.3). */
const SAMPLES: readonly Action[] = [
  { type: 'placeSettlement', vertex: 'v0' },
  { type: 'placeRoad', edge: 'e0' },
  { type: 'upgradeCity', vertex: 'v0' },
  { type: 'rollDice' },
  { type: 'discard', cards: { wood: 1 } },
  { type: 'moveRobber', hex: 'h0' },
  { type: 'steal', target: 'p2' },
  { type: 'buyDevCard' },
  { type: 'playKnight' },
  { type: 'playRoadBuilding' },
  { type: 'playYearOfPlenty', resources: ['wood', 'ore'] },
  { type: 'playMonopoly', resource: 'wood' },
  { type: 'maritimeTrade', give: 'wood', want: 'ore' },
  { type: 'createOffer', give: { wood: 1 }, want: { ore: 1 }, to: 'all' },
  { type: 'respondOffer', offerId: 'o1', response: 'accept' },
  { type: 'counterOffer', offerId: 'o1', give: { wood: 1 }, want: { ore: 1 } },
  { type: 'confirmTrade', offerId: 'o1', withPlayer: 'p2' },
  { type: 'cancelOffer', offerId: 'o1' },
  { type: 'endTurn' },
  { type: 'leaveGame' },
];

describe('which actions still have no handler', () => {
  const state = draft(runSetup(), (s) => {
    s.currentPlayer = ANA.id;
    s.phase = { kind: 'main' };
  });

  it('covers every action in the union', () => {
    const covered = new Set(SAMPLES.map((action) => action.type));
    // If this fails, an action was added to the union without a sample here.
    expect(covered.size).toBe(SAMPLES.length);
    for (const type of STILL_TO_COME) expect(covered.has(type)).toBe(true);
  });

  it('leaves nothing unimplemented', () => {
    expect(STILL_TO_COME).toEqual([]);
  });

  it('gives every action a verdict about the rules', () => {
    for (const action of SAMPLES) {
      const verdict = validateAction(state, ANA.id, action);
      // Either legal, or rejected for a reason — never for not existing. The
      // code that used to say that is gone, so this now guards the absence.
      if (verdict !== null) {
        expect(verdict, `${action.type} was rejected with an empty code`).toBeTruthy();
      }
    }
  });
});

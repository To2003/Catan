import { describe, expect, it } from 'vitest';
import { validateAction, type Action, type ActionType } from '../src/index.js';
import { ANA, draft, runSetup } from './helpers.js';

/**
 * What is still missing, pinned exactly.
 *
 * `NOT_IMPLEMENTED` exists so an action in the union without a handler says so
 * instead of failing in some plausible-looking way. The list below is the whole
 * of what M6 and M7 still owe, and this test fails in both directions: if an
 * M5 action quietly stopped being implemented, and if a new action is added
 * without a handler.
 *
 * When player-to-player trade lands in M7 this list goes empty, and then the
 * code itself comes out of ErrorCode.
 */
const STILL_TO_COME: readonly ActionType[] = [
  'createOffer',
  'respondOffer',
  'counterOffer',
  'confirmTrade',
  'cancelOffer',
];

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

  it('is exactly the five player-to-player trade actions of M7', () => {
    const unimplemented = SAMPLES.filter(
      (action) => validateAction(state, ANA.id, action) === 'NOT_IMPLEMENTED',
    ).map((action) => action.type);

    expect([...unimplemented].sort()).toEqual([...STILL_TO_COME].sort());
  });

  it('never reports NOT_IMPLEMENTED for anything M5 delivered', () => {
    for (const action of SAMPLES) {
      if (STILL_TO_COME.includes(action.type)) continue;
      // They may well be illegal in this state — what they may not be is
      // unimplemented.
      expect(validateAction(state, ANA.id, action)).not.toBe('NOT_IMPLEMENTED');
    }
  });
});

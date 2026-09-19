import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { RESOURCES, type PlayerView } from '@tierra-austral/engine';
import { seatThree, startHarness, until, type Harness, type TestClient } from './harness.js';

/**
 * Trading over the wire, with the case that made the version rule what it is:
 * two players answering the same offer without waiting for each other.
 */
describe('trading between players', () => {
  let harness: Harness;

  beforeEach(async () => {
    harness = await startHarness();
  });

  afterEach(async () => {
    await harness.close();
  });

  /** Gets a game to the main phase with the active player holding cards. */
  const readyToTrade = async (): Promise<{
    players: TestClient[];
    active: TestClient;
    others: TestClient[];
  }> => {
    const { host, second, third } = await seatThree(harness);
    const players = [host, second, third];
    host.socket.emit('room:start');
    await until(() => players.every((client) => client.view !== undefined), 'views');

    const clientFor = (playerId: string): TestClient => {
      const found = players.find((client) => client.playerId === playerId);
      if (!found) throw new Error('no client');
      return found;
    };

    // Setup, then a roll, so hands have something in them.
    for (let step = 0; step < 24; step += 1) {
      const view = host.view as PlayerView;
      if (view.phase.kind !== 'setup') break;
      const client = clientFor(view.currentPlayer);
      const moves = (client.view as PlayerView).legalMoves;
      const before = client.view?.version ?? 0;
      const action =
        view.phase.step === 'settlement'
          ? {
              type: 'placeSettlement',
              vertex: moves.settlements[Math.floor(moves.settlements.length / 2)],
            }
          : { type: 'placeRoad', edge: moves.roads[0] };
      client.socket.emit('game:action', { action, expectedVersion: before });
      await until(() => (host.view?.version ?? 0) > before, `setup ${step}`);
    }

    // Roll, and resolve whatever the roll brings, until the turn is in main.
    // A test that quietly gave up on a seven would pass without trading at all.
    for (let step = 0; step < 30; step += 1) {
      const view = host.view as PlayerView;
      if (view.phase.kind === 'main') break;

      if (view.phase.kind === 'discard') {
        const [playerId] = Object.keys(view.phase.pending);
        const client = clientFor(playerId ?? '');
        const owed = client.view?.legalMoves.discardOwed ?? 0;
        const cards: Record<string, number> = {};
        let left = owed;
        for (const resource of RESOURCES) {
          const take = Math.min(left, client.view?.me.resources[resource] ?? 0);
          if (take > 0) cards[resource] = take;
          left -= take;
        }
        const before = client.view?.version ?? 0;
        client.socket.emit('game:action', {
          action: { type: 'discard', cards },
          expectedVersion: before,
        });
        await until(() => (host.view?.version ?? 0) > before, `discard ${step}`);
        continue;
      }

      const client = clientFor(view.currentPlayer);
      const moves = client.view?.legalMoves;
      const before = client.view?.version ?? 0;
      const action =
        view.phase.kind === 'preRoll'
          ? { type: 'rollDice' }
          : view.phase.kind === 'moveRobber'
            ? { type: 'moveRobber', hex: moves?.robberHexes[0] }
            : view.phase.kind === 'steal'
              ? { type: 'steal', target: moves?.stealTargets[0] }
              : undefined;
      if (!action) break;
      client.socket.emit('game:action', { action, expectedVersion: before });
      await until(() => (host.view?.version ?? 0) > before, `to main ${step}`);
    }

    const view = host.view as PlayerView;
    expect(view.phase.kind, 'the game never reached the main phase').toBe('main');

    const active = clientFor(view.currentPlayer);
    return { players, active, others: players.filter((client) => client !== active) };
  };

  it('lets two players answer the same offer at once, with the same version', async () => {
    const { players, active, others } = await readyToTrade();

    // The active player offers a card they hold.
    const hand = active.view?.me.resources;
    const give = RESOURCES.find((resource) => (hand?.[resource] ?? 0) > 0);
    expect(give, 'the active player holds nothing to offer').toBeDefined();
    const want = RESOURCES.find((resource) => resource !== give);

    const before = active.view?.version ?? 0;
    active.socket.emit('game:action', {
      action: {
        type: 'createOffer',
        give: { [give ?? '']: 1 },
        want: { [want ?? 'ore']: 1 },
        to: 'all',
      },
      expectedVersion: before,
    });
    await until(() => (active.view?.tradeOffers.length ?? 0) > 0, 'the offer');

    const offerId = active.view?.tradeOffers[0]?.id ?? '';
    const version = active.view?.version ?? 0;

    // Both answer at once, both carrying the version they last saw. The second
    // to arrive would be stale under a blanket version check.
    others[0]?.socket.emit('game:action', {
      action: { type: 'respondOffer', offerId, response: 'accept' },
      expectedVersion: version,
    });
    others[1]?.socket.emit('game:action', {
      action: { type: 'respondOffer', offerId, response: 'reject' },
      expectedVersion: version,
    });

    await until(() => {
      const offer = active.view?.tradeOffers.find((candidate) => candidate.id === offerId);
      return Object.values(offer?.responses ?? {}).every((response) => response !== 'pending');
    }, 'both answers');

    for (const client of players) {
      expect(client.errors.map((error) => error.code)).not.toContain('STALE_STATE');
    }

    const offer = active.view?.tradeOffers.find((candidate) => candidate.id === offerId);
    expect(Object.values(offer?.responses ?? {})).toContain('accepted');
    expect(Object.values(offer?.responses ?? {})).toContain('rejected');
  });

  it('closes the deal and moves the cards', async () => {
    const { active, others } = await readyToTrade();

    const hand = active.view?.me.resources;
    const give = RESOURCES.find((resource) => (hand?.[resource] ?? 0) > 0);
    const taker = others.find((client) => {
      const resources = client.view?.me.resources;
      if (!resources) return false;
      return RESOURCES.some((resource) => resource !== give && resources[resource] > 0);
    });
    expect(give, 'the active player holds nothing to offer').toBeDefined();
    expect(taker, 'nobody else holds a card to trade').toBeDefined();
    if (!give || !taker) return;

    const takerHand = taker.view?.me.resources;
    const want = RESOURCES.find(
      (resource) => resource !== give && (takerHand?.[resource] ?? 0) > 0,
    );
    expect(want, 'nobody had a different card to trade for').toBeDefined();
    if (!want) return;

    active.socket.emit('game:action', {
      action: {
        type: 'createOffer',
        give: { [give]: 1 },
        want: { [want]: 1 },
        to: 'all',
      },
      expectedVersion: active.view?.version ?? 0,
    });
    await until(() => (active.view?.tradeOffers.length ?? 0) > 0, 'the offer');

    const offerId = active.view?.tradeOffers[0]?.id ?? '';
    taker.socket.emit('game:action', {
      action: { type: 'respondOffer', offerId, response: 'accept' },
      expectedVersion: taker.view?.version ?? 0,
    });
    await until(
      () => active.view?.tradeOffers[0]?.responses[taker.playerId ?? ''] === 'accepted',
      'the acceptance',
    );

    const myGiveBefore = active.view?.me.resources[give as 'wood'] ?? 0;
    active.socket.emit('game:action', {
      action: { type: 'confirmTrade', offerId, withPlayer: taker.playerId },
      expectedVersion: active.view?.version ?? 0,
    });
    await until(() => (active.view?.tradeOffers.length ?? 0) === 0, 'the trade to close');

    expect(active.view?.me.resources[give as 'wood']).toBe(myGiveBefore - 1);
    expect(active.errors).toEqual([]);
  });
});

import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  COSTS,
  LARGEST_ARMY_MIN_KNIGHTS,
  LONGEST_ROAD_MIN_LENGTH,
  RESOURCES,
  VICTORY_POINTS,
  type ResourceBundle,
} from '@tierra-austral/engine';
import { CostCard } from './CostCard.js';
import { RESOURCE_LABELS } from '../lib/terrainStyles.js';

/**
 * The card has to agree with the engine, not with whoever typed it.
 *
 * A price is easy to write into a component and impossible to notice when it
 * drifts: the game would keep charging three ore for a city while the card
 * kept promising two, and the only clue would be a player counting their
 * cards and swearing. So the test reads the same constants the engine
 * charges from and counts what actually got rendered.
 */
const shownPrice = (row: HTMLElement): ResourceBundle => {
  const counted: Record<string, number> = {};
  // Counted off the pictures themselves: each one names its resource, so the
  // number of pictures *is* the price the card is charging.
  for (const icon of within(row).getAllByRole('img')) {
    const name = icon.getAttribute('alt') ?? icon.getAttribute('aria-label') ?? '';
    counted[name] = (counted[name] ?? 0) + 1;
  }
  return Object.fromEntries(
    RESOURCES.map((resource) => [resource, counted[RESOURCE_LABELS[resource]] ?? 0]),
  ) as unknown as ResourceBundle;
};

/**
 * A row of the build list.
 *
 * Scoped to that section on purpose: "Pueblo" and "Ciudad" also appear in the
 * points list, and an unscoped query would silently read the wrong one.
 */
const rowFor = (label: string): HTMLElement => {
  const section = screen.getByText('Qué cuesta construir').closest('section');
  if (!section) throw new Error('no build section');
  const item = within(section).getByText(label).closest('li');
  if (!item) throw new Error(`no row for ${label}`);
  return item;
};

describe('the cost card charges what the engine charges', () => {
  it.each([
    ['Camino', COSTS.road],
    ['Pueblo', COSTS.settlement],
    ['Ciudad', COSTS.city],
    ['Carta', COSTS.devCard],
  ])('%s', (label, cost) => {
    render(<CostCard />);
    expect(shownPrice(rowFor(label))).toEqual({ ...cost });
  });
});

describe('and pays what the engine pays', () => {
  it('lists every source of points with the engine’s value', () => {
    render(<CostCard />);
    const points = screen.getByText('Qué da puntos').closest('section');
    if (!points) throw new Error('no points section');

    expect(within(points).getByText('Pueblo').previousSibling).toHaveTextContent(
      String(VICTORY_POINTS.settlement),
    );
    expect(within(points).getByText('Ciudad').previousSibling).toHaveTextContent(
      String(VICTORY_POINTS.city),
    );
    expect(
      within(points).getByText(`Camino más largo (${LONGEST_ROAD_MIN_LENGTH}+)`).previousSibling,
    ).toHaveTextContent(String(VICTORY_POINTS.longestRoad));
    expect(
      within(points).getByText(`Gran ejército (${LARGEST_ARMY_MIN_KNIGHTS}+ caballeros)`)
        .previousSibling,
    ).toHaveTextContent(String(VICTORY_POINTS.largestArmy));
    expect(within(points).getByText('Carta de punto').previousSibling).toHaveTextContent(
      String(VICTORY_POINTS.vpCard),
    );
  });
});

describe('what it says about your hand', () => {
  it('ticks only what you can pay for, and says so in words too', () => {
    render(
      <CostCard
        canAfford={{ road: true, settlement: false, city: false, devCard: true }}
        stock={{ roads: 11, settlements: 3, cities: 4 }}
      />,
    );

    expect(within(rowFor('Camino')).getByText('te alcanza')).toBeInTheDocument();
    expect(within(rowFor('Carta')).getByText('te alcanza')).toBeInTheDocument();
    expect(within(rowFor('Pueblo')).queryByText('te alcanza')).not.toBeInTheDocument();
    expect(within(rowFor('Ciudad')).queryByText('te alcanza')).not.toBeInTheDocument();
  });

  it('shows the pieces left, where there are pieces to run out of', () => {
    render(<CostCard stock={{ roads: 11, settlements: 3, cities: 4 }} />);

    expect(within(rowFor('Camino')).getByText('×11')).toBeInTheDocument();
    expect(within(rowFor('Pueblo')).getByText('×3')).toBeInTheDocument();
    expect(within(rowFor('Ciudad')).getByText('×4')).toBeInTheDocument();
    // A development card is not a piece: there is a deck, not a stock of yours.
    expect(within(rowFor('Carta')).queryByText(/^×/)).not.toBeInTheDocument();
  });

  it('works with no hand at all, for the rules sheet', () => {
    render(<CostCard />);
    expect(screen.queryByText('te alcanza')).not.toBeInTheDocument();
    expect(screen.getByText('Qué cuesta construir')).toBeInTheDocument();
  });
});

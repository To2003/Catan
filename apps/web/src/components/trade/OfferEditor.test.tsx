import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { COSTS, createGame, getPlayerView, type PlayerView } from '@tierra-austral/engine';
import { OfferEditor } from './OfferEditor.js';

/**
 * Building an offer.
 *
 * The old editor told you to go and select cards in your hand, which is why
 * it used to say "Doy nada todavía — elegí cartas de tu mano". These pin the
 * thing that replaced it: both sides are asked for here, the counters stop
 * where your hand does, and the button says why it is off instead of just
 * being off.
 */
const viewWith = (overrides: Partial<PlayerView> = {}): PlayerView => {
  const base = getPlayerView(
    createGame(1234, [
      { id: 'p1', name: 'Ana', color: 'celeste' },
      { id: 'p2', name: 'Bruno', color: 'bordo' },
      { id: 'p3', name: 'Cata', color: 'verde' },
    ]),
    'p1',
  );
  return {
    ...base,
    me: { ...base.me, resources: { wood: 2, brick: 0, sheep: 1, wheat: 0, ore: 0 } },
    legalMoves: { ...base.legalMoves, canCreateOffer: true, canEndTurn: true },
    ...overrides,
  };
};

const row = (label: string): HTMLElement => {
  const box = screen.getByText(label).closest('div');
  if (!box) throw new Error(`no row ${label}`);
  return box;
};

const plus = (side: string, resource: string): HTMLElement =>
  within(row(side)).getByRole('button', { name: `Agregar ${resource}` });

describe('the offer editor asks for the whole offer', () => {
  it('sends what you built, to everybody by default', async () => {
    const onSend = vi.fn();
    const user = userEvent.setup();
    render(<OfferEditor view={viewWith()} onSend={onSend} onClose={vi.fn()} />);

    await user.click(plus('Vos das', 'Madera'));
    await user.click(plus('Vos pedís', 'Trigo'));
    await user.click(screen.getByRole('button', { name: 'Ofertar' }));

    expect(onSend).toHaveBeenCalledWith({ wood: 1 }, { wheat: 1 }, 'all');
  });

  it('says in words what you are proposing', async () => {
    const user = userEvent.setup();
    render(<OfferEditor view={viewWith()} onSend={vi.fn()} onClose={vi.fn()} />);

    await user.click(plus('Vos das', 'Madera'));
    await user.click(plus('Vos pedís', 'Trigo'));
    expect(screen.getByText(/Das/)).toHaveTextContent('Das 1 Madera y pedís 1 Trigo');
  });

  it('stops the + where your hand does', async () => {
    const user = userEvent.setup();
    render(<OfferEditor view={viewWith()} onSend={vi.fn()} onClose={vi.fn()} />);

    const add = plus('Vos das', 'Madera');
    // Two wood in hand: a third press changes nothing.
    await user.click(add);
    await user.click(add);
    await user.click(add);
    expect(within(row('Vos das')).getByText('Das', { exact: false })).toBeDefined();
    expect(screen.getByText(/Das/)).toHaveTextContent('Das 2 Madera');
  });

  it('will not let you ask for what you are already giving', async () => {
    const user = userEvent.setup();
    render(<OfferEditor view={viewWith()} onSend={vi.fn()} onClose={vi.fn()} />);

    await user.click(plus('Vos das', 'Madera'));
    expect(plus('Vos pedís', 'Madera')).toBeDisabled();
    // Still only a convenience: the engine refuses it anyway, which its own
    // suite pins. This is about not letting somebody build it by accident.
    expect(plus('Vos pedís', 'Trigo')).toBeEnabled();
  });
});

describe('who the offer goes to', () => {
  it('offers everybody plus one chip per player', () => {
    render(<OfferEditor view={viewWith()} onSend={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Todos' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Bruno' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cata' })).toBeInTheDocument();
  });

  it('greys out somebody who walked out, and says why', () => {
    const view = viewWith();
    const left = {
      ...view,
      players: view.players.map((player) =>
        player.id === 'p3' ? { ...player, hasLeft: true } : player,
      ),
    } as PlayerView;

    render(<OfferEditor view={left} onSend={vi.fn()} onClose={vi.fn()} />);
    const chip = screen.getByRole('button', { name: /Cata/ });
    expect(chip).toBeDisabled();
    expect(chip).toHaveAttribute('title', 'Cata abandonó la partida');
  });

  it('sends to just the one you picked', async () => {
    const onSend = vi.fn();
    const user = userEvent.setup();
    render(<OfferEditor view={viewWith()} onSend={onSend} onClose={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'Bruno' }));
    await user.click(plus('Vos das', 'Madera'));
    await user.click(plus('Vos pedís', 'Trigo'));
    await user.click(screen.getByRole('button', { name: 'Ofertar' }));

    expect(onSend).toHaveBeenCalledWith({ wood: 1 }, { wheat: 1 }, ['p2']);
  });
});

describe('why the button is off', () => {
  it('asks for the side that is missing', async () => {
    const user = userEvent.setup();
    render(<OfferEditor view={viewWith()} onSend={vi.fn()} onClose={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Ofertar' })).toBeDisabled();
    expect(screen.getByText('Elegí qué das')).toBeInTheDocument();

    await user.click(plus('Vos das', 'Madera'));
    expect(screen.getByText('Elegí qué pedís')).toBeInTheDocument();
  });

  it('says when you are already at three', () => {
    const view = viewWith();
    const full = {
      ...view,
      legalMoves: {
        ...view.legalMoves,
        canCreateOffer: false,
        offers: {
          o1: {
            canAccept: false,
            canReject: false,
            canCounter: false,
            canCancel: true,
            confirmWith: [],
          },
          o2: {
            canAccept: false,
            canReject: false,
            canCounter: false,
            canCancel: true,
            confirmWith: [],
          },
          o3: {
            canAccept: false,
            canReject: false,
            canCounter: false,
            canCancel: true,
            confirmWith: [],
          },
        },
      },
    } as PlayerView;

    render(<OfferEditor view={full} onSend={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByText('Ya tenés 3 ofertas abiertas')).toBeInTheDocument();
  });
});

describe('the shortcut for what you are missing', () => {
  it('fills "pedís" with the gap between your hand and the price', async () => {
    const user = userEvent.setup();
    render(<OfferEditor view={viewWith()} onSend={vi.fn()} onClose={vi.fn()} />);

    // A settlement costs one of each of four; Ana holds 2 wood and 1 sheep.
    await user.click(screen.getByRole('button', { name: 'un pueblo' }));
    expect(screen.getByText(/Das/)).toHaveTextContent(
      `pedís ${COSTS.settlement.brick} Ladrillo y ${COSTS.settlement.wheat} Trigo`,
    );
  });
});

describe('a counteroffer', () => {
  /** A view where it is somebody else's turn and you may counter `o1`. */
  const offTurn = () => {
    const view = viewWith();
    return {
      ...view,
      currentPlayer: 'p2',
      legalMoves: {
        ...view.legalMoves,
        // Off-turn, so you cannot *open* an offer…
        canCreateOffer: false,
        canEndTurn: false,
        // …but you may answer the one aimed at you with a counter.
        offers: {
          o1: {
            canAccept: true,
            canReject: true,
            canCounter: true,
            canCancel: false,
            confirmWith: [],
          },
        },
      },
    };
  };

  it('can be sent on somebody else’s turn, which is the whole point of it', async () => {
    const onSend = vi.fn();
    const user = userEvent.setup();
    render(
      <OfferEditor
        view={offTurn()}
        onSend={onSend}
        onClose={vi.fn()}
        preset={{
          give: { wood: 0, brick: 0, sheep: 1, wheat: 0, ore: 0 },
          want: { wood: 1, brick: 0, sheep: 0, wheat: 0, ore: 0 },
          to: 'p2',
          offerId: 'o1',
        }}
      />,
    );

    // The bug: this asked `canCreateOffer`, which is false off-turn, so the
    // button sat there dead saying "podés ofertar en tu turno".
    const send = screen.getByRole('button', { name: 'Ofertar' });
    expect(send).toBeEnabled();
    expect(screen.queryByText(/en tu turno/)).not.toBeInTheDocument();

    await user.click(send);
    expect(onSend).toHaveBeenCalled();
  });

  it('says so when the offer it answers is gone', () => {
    const view = offTurn();
    render(
      <OfferEditor
        view={{ ...view, legalMoves: { ...view.legalMoves, offers: {} } }}
        onSend={vi.fn()}
        onClose={vi.fn()}
        preset={{
          give: { wood: 0, brick: 0, sheep: 1, wheat: 0, ore: 0 },
          want: { wood: 1, brick: 0, sheep: 0, wheat: 0, ore: 0 },
          to: 'p2',
          offerId: 'o1',
        }}
      />,
    );
    expect(screen.getByRole('button', { name: 'Ofertar' })).toBeDisabled();
    expect(screen.getByText('Esa oferta ya no está abierta')).toBeInTheDocument();
  });

  it('opens with the sides already swapped', () => {
    render(
      <OfferEditor
        view={viewWith()}
        onSend={vi.fn()}
        onClose={vi.fn()}
        title="Tu contraoferta"
        preset={{
          give: { wood: 0, brick: 0, sheep: 1, wheat: 0, ore: 0 },
          want: { wood: 1, brick: 0, sheep: 0, wheat: 0, ore: 0 },
          to: 'p2',
          offerId: 'o1',
        }}
      />,
    );

    expect(screen.getByText('Tu contraoferta')).toBeInTheDocument();
    expect(screen.getByText(/Das/)).toHaveTextContent('Das 1 Lana y pedís 1 Madera');
    expect(screen.getByRole('button', { name: 'Bruno' })).toHaveAttribute('aria-pressed', 'true');
  });
});

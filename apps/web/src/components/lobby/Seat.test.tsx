import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Seat } from './Seat.js';

/**
 * A chair at the table.
 *
 * What is worth pinning here is what the seat says without being clicked: an
 * empty chair has to look empty, and a state has to be readable without
 * telling colours apart.
 */
describe('an empty seat', () => {
  it('says the chair is free, and offers nothing to press', () => {
    render(
      <ul>
        <Seat index={3} isHost={false} isYou={false} takenBy={{}} onPickColor={vi.fn()} />
      </ul>,
    );

    expect(screen.getByText('Esperando jugador…')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});

describe('a taken seat', () => {
  const ana = {
    playerId: 'p1',
    name: 'Ana',
    color: 'celeste' as const,
    ready: true,
    connected: true,
  };

  it('spells out every state, not just paints it', () => {
    render(
      <ul>
        <Seat index={1} person={ana} isHost isYou={false} takenBy={{}} onPickColor={vi.fn()} />
      </ul>,
    );

    expect(screen.getByText('Ana')).toBeInTheDocument();
    expect(screen.getByText('host')).toBeInTheDocument();
    expect(screen.getByText('✓ listo')).toBeInTheDocument();
  });

  it('shows somebody who left as gone rather than as not ready', () => {
    render(
      <ul>
        <Seat
          index={2}
          person={{ ...ana, connected: false }}
          isHost={false}
          isYou={false}
          takenBy={{}}
          onPickColor={vi.fn()}
        />
      </ul>,
    );

    expect(screen.getByText('— desconectado')).toBeInTheDocument();
    expect(screen.queryByText('✓ listo')).not.toBeInTheDocument();
  });

  it('lets nobody but you touch your colour', () => {
    render(
      <ul>
        <Seat
          index={1}
          person={ana}
          isHost={false}
          isYou={false}
          takenBy={{}}
          onPickColor={vi.fn()}
        />
      </ul>,
    );
    expect(screen.queryByRole('button', { name: /color/i })).not.toBeInTheDocument();
  });
});

describe('picking your colour from your own row', () => {
  const you = {
    playerId: 'p1',
    name: 'Ana',
    ready: false,
    connected: true,
  };

  it('opens the four colours and reports the one you press', async () => {
    const onPickColor = vi.fn();
    const user = userEvent.setup();
    render(
      <ul>
        <Seat index={1} person={you} isHost={false} isYou takenBy={{}} onPickColor={onPickColor} />
      </ul>,
    );

    await user.click(screen.getByRole('button', { name: /elegí tu color/i }));
    const options = screen.getAllByRole('option');
    expect(options).toHaveLength(4);

    await user.click(screen.getByRole('option', { name: /verde/i }));
    expect(onPickColor).toHaveBeenCalledWith('verde');
    // And it closes behind you.
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('refuses a colour somebody else already has, and says who', async () => {
    const onPickColor = vi.fn();
    const user = userEvent.setup();
    render(
      <ul>
        <Seat
          index={1}
          person={you}
          isHost={false}
          isYou
          takenBy={{ bordo: 'Bruno' }}
          onPickColor={onPickColor}
        />
      </ul>,
    );

    await user.click(screen.getByRole('button', { name: /elegí tu color/i }));
    const bordo = screen.getByRole('option', { name: /bordó/i });
    expect(bordo).toBeDisabled();
    expect(bordo).toHaveAttribute('title', 'Lo tiene Bruno');

    await user.click(bordo);
    expect(onPickColor).not.toHaveBeenCalled();
  });

  it('closes on Escape, so the keyboard is never trapped in it', async () => {
    const user = userEvent.setup();
    render(
      <ul>
        <Seat index={1} person={you} isHost={false} isYou takenBy={{}} onPickColor={vi.fn()} />
      </ul>,
    );

    await user.click(screen.getByRole('button', { name: /elegí tu color/i }));
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });
});

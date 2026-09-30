import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PlayerColor } from '@tierra-austral/engine';
import { LobbyScreen } from './LobbyScreen.js';
import { useGame } from '../store/gameStore.js';

/**
 * The lobby, from the two seats it can be looked at from.
 *
 * The host decides the board and everybody else watches; getting that wrong
 * in either direction is either a dead control or a control that should not
 * be there, and neither shows up in a typecheck.
 *
 * The store is driven directly rather than through a socket: what is under
 * test is the screen, and the wire has its own tests on the server.
 */
const seat = (
  playerId: string,
  name: string,
  extra: { color?: PlayerColor; ready?: boolean; connected?: boolean } = {},
) => ({
  playerId,
  name,
  ...(extra.color === undefined ? {} : { color: extra.color }),
  ready: extra.ready ?? false,
  connected: extra.connected ?? true,
  state: (extra.connected ?? true) ? ('active' as const) : ('disconnected' as const),
});

const seatThree = () => [
  seat('p1', 'Ana', { color: 'celeste', ready: true }),
  seat('p2', 'Bruno', { color: 'bordo', ready: true }),
  seat('p3', 'Cata', { color: 'verde', ready: true }),
];

const asRoom = (seats: ReturnType<typeof seat>[]) => ({
  code: 'X7K2M',
  seats,
  hostId: 'p1',
  started: false,
  previewSeed: 12345,
  boardMode: 'random' as const,
  wins: {},
  gamesPlayed: 0,
  restartCooldown: {},
});

const sitAs = (playerId: string, seats = seatThree()): void => {
  useGame.setState({ room: asRoom(seats), playerId, chat: [], chatSeen: 0, error: undefined });
};

describe('the lobby as the host', () => {
  beforeEach(() => {
    sitAs('p1');
  });

  it('hands over the board controls', () => {
    render(<LobbyScreen />);

    for (const label of ['Aleatorio', 'Clásico', 'Balanceado']) {
      expect(screen.getByRole('radio', { name: label })).toBeEnabled();
    }
    expect(screen.getByRole('button', { name: /otro tablero/i })).toBeEnabled();
    expect(screen.queryByText(/lo elige/i)).not.toBeInTheDocument();
  });

  it('offers to start once everybody is ready', () => {
    render(<LobbyScreen />);
    expect(screen.getByRole('button', { name: 'Arrancar' })).toBeEnabled();
  });

  it('says on the button itself why it cannot start', () => {
    sitAs('p1', [seat('p1', 'Ana', { color: 'celeste', ready: true })]);
    render(<LobbyScreen />);

    const start = screen.getByRole('button', { name: /faltan 2 jugadores/i });
    expect(start).toBeDisabled();
  });

  it('counts a colour nobody picked as a reason, which the old line never did', () => {
    sitAs('p1', [
      seat('p1', 'Ana', { color: 'celeste', ready: true }),
      seat('p2', 'Bruno', { color: 'bordo', ready: true }),
      seat('p3', 'Cata', { ready: true }),
    ]);
    render(<LobbyScreen />);

    expect(screen.getByRole('button', { name: /falta el color de cata/i })).toBeDisabled();
  });

  it('will not reroll the classic board, which is always the same one', () => {
    useGame.setState({ room: { ...asRoom(seatThree()), boardMode: 'classic' } });
    render(<LobbyScreen />);
    expect(screen.getByRole('button', { name: /otro tablero/i })).toBeDisabled();
  });
});

describe('the lobby as everybody else', () => {
  beforeEach(() => {
    sitAs('p2');
  });

  it('shows the board controls, switched off, and says whose they are', () => {
    render(<LobbyScreen />);

    for (const label of ['Aleatorio', 'Clásico', 'Balanceado']) {
      expect(screen.getByRole('radio', { name: label })).toBeDisabled();
    }
    expect(screen.getByRole('button', { name: /otro tablero/i })).toBeDisabled();
    expect(screen.getByText('Lo elige Ana')).toBeInTheDocument();
  });

  it('waits for the host instead of showing a start button', () => {
    render(<LobbyScreen />);

    expect(screen.queryByRole('button', { name: 'Arrancar' })).not.toBeInTheDocument();
    expect(screen.getByText('Esperando que Ana arranque')).toBeInTheDocument();
  });
});

describe('the four chairs', () => {
  it('shows the empty ones, so it is obvious how many are missing', () => {
    sitAs('p1', [seat('p1', 'Ana', { color: 'celeste' }), seat('p2', 'Bruno', { color: 'bordo' })]);
    render(<LobbyScreen />);

    expect(screen.getAllByText('Esperando jugador…')).toHaveLength(2);
    expect(screen.getByText('2 de 4')).toBeInTheDocument();
  });

  it('offers the room code and the link to share', () => {
    sitAs('p1');
    render(<LobbyScreen />);

    expect(screen.getByText('X7K2M')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copiar código' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copiar link' })).toBeInTheDocument();
  });
});

describe('everybody sees the same board', () => {
  it('draws the seed and mode the server sent, without deciding either', () => {
    const mode = vi.fn();
    useGame.setState({ setBoardMode: mode });
    sitAs('p2');
    render(<LobbyScreen />);

    expect(screen.getByRole('radio', { name: 'Aleatorio' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(screen.getByRole('img', { name: 'Tablero' })).toBeInTheDocument();
    expect(mode).not.toHaveBeenCalled();
  });
});

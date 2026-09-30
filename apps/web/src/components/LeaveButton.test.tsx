import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LeaveButton } from './LeaveButton.js';
import { useGame } from '../store/gameStore.js';

const leaveRoom = vi.fn();

beforeEach(() => {
  leaveRoom.mockClear();
  useGame.setState({ leaveRoom });
});

describe('the way out', () => {
  it('asks before doing anything', async () => {
    const user = userEvent.setup();
    render(<LeaveButton from="lobby" />);

    await user.click(screen.getByRole('button', { name: 'Salir de la sala' }));
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    expect(leaveRoom).not.toHaveBeenCalled();
  });

  it('takes no for an answer', async () => {
    const user = userEvent.setup();
    render(<LeaveButton from="lobby" />);

    await user.click(screen.getByRole('button', { name: 'Salir de la sala' }));
    await user.click(screen.getByRole('button', { name: 'Me quedo' }));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(leaveRoom).not.toHaveBeenCalled();
  });

  it('backs out on Escape too', async () => {
    const user = userEvent.setup();
    render(<LeaveButton from="lobby" />);

    await user.click(screen.getByRole('button', { name: 'Salir de la sala' }));
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(leaveRoom).not.toHaveBeenCalled();
  });

  it('gives up the seat when you leave the lobby', async () => {
    const user = userEvent.setup();
    render(<LeaveButton from="lobby" />);

    await user.click(screen.getByRole('button', { name: 'Salir de la sala' }));
    await user.click(screen.getByRole('button', { name: 'Sí, salir' }));
    expect(leaveRoom).toHaveBeenCalledWith({ forget: true });
  });

  it('keeps the seat when you step away from a game', async () => {
    const user = userEvent.setup();
    render(<LeaveButton from="game" />);

    await user.click(screen.getByRole('button', { name: 'Salir' }));
    // And it says so, because the two are not the same thing.
    expect(screen.getByText(/tu lugar te queda guardado/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Sí, salir' }));
    expect(leaveRoom).toHaveBeenCalledWith({ forget: false });
  });
});

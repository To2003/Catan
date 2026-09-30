import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LeaveButton } from './LeaveButton.js';
import { useGame } from '../store/gameStore.js';

const leaveRoom = vi.fn();
const leaveForGood = vi.fn();

beforeEach(() => {
  leaveRoom.mockClear();
  leaveForGood.mockClear();
  useGame.setState({ leaveRoom, leaveForGood });
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

  it('offers the two different things leaving a game can mean', async () => {
    const user = userEvent.setup();
    render(<LeaveButton from="game" />);

    await user.click(screen.getByRole('button', { name: 'Salir' }));
    expect(screen.getByRole('button', { name: /me voy un rato/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /abandonar para siempre/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeInTheDocument();
  });

  it('keeps the seat when you are only stepping away', async () => {
    const user = userEvent.setup();
    render(<LeaveButton from="game" />);

    await user.click(screen.getByRole('button', { name: 'Salir' }));
    const away = screen.getByRole('button', { name: /me voy un rato/i });
    expect(away).toHaveTextContent(/te guardamos el lugar/i);

    await user.click(away);
    expect(leaveRoom).toHaveBeenCalledWith({ forget: false });
    expect(leaveForGood).not.toHaveBeenCalled();
  });

  it('says plainly that the other one cannot be undone', async () => {
    const user = userEvent.setup();
    render(<LeaveButton from="game" />);

    await user.click(screen.getByRole('button', { name: 'Salir' }));
    const forever = screen.getByRole('button', { name: /abandonar para siempre/i });
    expect(forever).toHaveTextContent(/no se puede deshacer/i);
    expect(forever).toHaveTextContent(/no podés volver a entrar/i);

    await user.click(forever);
    expect(leaveForGood).toHaveBeenCalled();
    expect(leaveRoom).not.toHaveBeenCalled();
  });
});

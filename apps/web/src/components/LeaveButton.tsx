import { useEffect, useState } from 'react';
import { useGame } from '../store/gameStore.js';

interface LeaveButtonProps {
  /**
   * Where you are leaving from, which is what changes.
   *
   * In the lobby the seat goes back on the table and the room stops waiting
   * for you. In a game it cannot: the players are fixed when the game is
   * created, so leaving is stepping away and the seat stays yours — and once
   * the game is over, the seat is what keeps you in the rematch.
   */
  readonly from: 'lobby' | 'game' | 'over';
  readonly className?: string;
}

const WORDING = {
  lobby: {
    button: 'Salir de la sala',
    title: '¿Salir de la sala?',
    body: 'Dejás tu lugar libre. Podés volver a entrar con el código mientras la sala siga abierta; si sos el último, la sala se cierra.',
    confirm: 'Sí, salir',
  },
  game: {
    button: 'Salir',
    title: '¿Salir de la partida?',
    body: 'La partida sigue sin vos y tu lugar te queda guardado: volvés entrando con el mismo código desde este navegador. Si tardás, el anfitrión puede forzarte el turno.',
    confirm: 'Sí, salir',
  },
  over: {
    button: 'Volver al inicio',
    title: '¿Volver al inicio?',
    body: 'La sala queda abierta y tu lugar guardado: si hacen revancha, volvés con el mismo código desde este navegador.',
    confirm: 'Sí, volver',
  },
} as const;

/**
 * The way out.
 *
 * It asks first, wherever it appears, because it is not undoable from the screen
 * you end up on: from the front door there is no button that puts you back,
 * only the code. One short line saying what actually happens, which is not
 * the same thing in the three places it appears.
 */
export function LeaveButton({ from, className = '' }: LeaveButtonProps) {
  const leaveRoom = useGame((state) => state.leaveRoom);
  const [asking, setAsking] = useState(false);
  const words = WORDING[from];

  useEffect(() => {
    if (!asking) return;
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setAsking(false);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, [asking]);

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setAsking(true);
        }}
        className={`rounded-panel bg-chapa px-3 py-1 text-[13px] font-semibold text-guanaco-apagado transition-colors hover:bg-lenga hover:text-guanaco ${className}`}
      >
        {words.button}
      </button>

      {asking ? (
        <div
          role="presentation"
          onClick={() => {
            setAsking(false);
          }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-noche/80 p-4"
        >
          <div
            role="alertdialog"
            aria-modal="true"
            aria-label={words.title}
            onClick={(event) => {
              event.stopPropagation();
            }}
            className="w-full max-w-sm rounded-panel bg-chapa p-4 ring-1 ring-chapa-alta"
          >
            <h2 className="font-display text-lg text-guanaco">{words.title}</h2>
            <p className="mt-1.5 text-[13px] leading-relaxed text-guanaco-apagado">{words.body}</p>

            <div className="mt-4 flex gap-2">
              <button
                type="button"
                autoFocus
                onClick={() => {
                  setAsking(false);
                }}
                className="flex-1 rounded-panel bg-chapa-alta px-3 py-2 text-[14px] font-semibold text-guanaco hover:bg-chapa"
              >
                Me quedo
              </button>
              <button
                type="button"
                onClick={() => {
                  // The seat only stops being yours where it actually went.
                  leaveRoom({ forget: from === 'lobby' });
                }}
                className="flex-1 rounded-panel bg-lenga px-3 py-2 text-[14px] font-semibold text-guanaco hover:bg-lenga/85"
              >
                {words.confirm}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

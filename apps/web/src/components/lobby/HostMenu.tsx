import { useEffect, useRef, useState } from 'react';
import { useGame } from '../../store/gameStore.js';

interface HostMenuProps {
  readonly target: string;
  readonly name: string;
  /** Where it is being opened from, which is what "expulsar" ends up meaning. */
  readonly inGame: boolean;
}

type Asking = 'kick' | 'host' | null;

/**
 * What the host can do about somebody else.
 *
 * Only rendered for the host, and never over their own row: the two things in
 * it are things you do to another person. Both ask first, because both are
 * the other person's problem — one of them cannot be undone at all, since a
 * thrown-out token is spent.
 *
 * The same menu serves the lobby and the game, which is the point: it is one
 * relationship, not two.
 */
export function HostMenu({ target, name, inGame }: HostMenuProps) {
  const kick = useGame((state) => state.kick);
  const transferHost = useGame((state) => state.transferHost);
  const [open, setOpen] = useState(false);
  const [asking, setAsking] = useState<Asking>(null);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setOpen(false);
    };
    const onOutside = (event: MouseEvent): void => {
      if (!box.current?.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onOutside);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onOutside);
    };
  }, [open]);

  const confirmation =
    asking === 'kick'
      ? {
          title: `¿Sacar a ${name}?`,
          body: inGame
            ? `${name} queda afuera para siempre: sus piezas y cartas se quedan en el tablero y la mesa juega sus turnos sola. No puede volver a entrar.`
            : `${name} pierde su lugar y su color queda libre. No puede volver a entrar con este link, aunque podría entrar de cero con el código.`,
          confirm: 'Sí, sacarlo',
          run: () => {
            kick(target);
          },
        }
      : asking === 'host'
        ? {
            title: `¿Darle la sala a ${name}?`,
            body: 'Pasa a decidir el tablero, arrancar la partida y manejar a los demás. Vos dejás de poder hacerlo.',
            confirm: 'Sí, dárselo',
            run: () => {
              transferHost(target);
            },
          }
        : null;

  return (
    <div ref={box} className="relative shrink-0">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Opciones de ${name}`}
        onClick={() => {
          setOpen((current) => !current);
        }}
        className="rounded-panel px-1.5 py-0.5 text-[15px] leading-none text-guanaco-apagado hover:bg-chapa-alta hover:text-guanaco"
      >
        ⋯
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute top-full right-0 z-30 mt-1 w-40 overflow-hidden rounded-panel bg-chapa-alta text-left shadow-lg ring-1 ring-noche"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              setAsking('host');
            }}
            className="block w-full px-3 py-2 text-left text-[13px] hover:bg-chapa"
          >
            Dar host
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              setAsking('kick');
            }}
            className="block w-full px-3 py-2 text-left text-[13px] text-lenga hover:bg-lenga hover:text-guanaco"
          >
            Expulsar
          </button>
        </div>
      ) : null}

      {confirmation ? (
        <div
          role="presentation"
          onClick={() => {
            setAsking(null);
          }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-noche/80 p-4"
        >
          <div
            role="alertdialog"
            aria-modal="true"
            aria-label={confirmation.title}
            onClick={(event) => {
              event.stopPropagation();
            }}
            className="w-full max-w-sm rounded-panel bg-chapa p-4 ring-1 ring-chapa-alta"
          >
            <h2 className="font-display text-lg text-guanaco">{confirmation.title}</h2>
            <p className="mt-1.5 text-[13px] leading-relaxed text-guanaco-apagado">
              {confirmation.body}
            </p>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                autoFocus
                onClick={() => {
                  setAsking(null);
                }}
                className="flex-1 rounded-panel bg-chapa-alta px-3 py-2 text-[14px] font-semibold text-guanaco hover:bg-chapa"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  confirmation.run();
                  setAsking(null);
                }}
                className={`flex-1 rounded-panel px-3 py-2 text-[14px] font-semibold ${
                  asking === 'kick'
                    ? 'bg-lenga text-guanaco hover:bg-lenga/85'
                    : 'bg-estepa text-noche hover:bg-estepa/85'
                }`}
              >
                {confirmation.confirm}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

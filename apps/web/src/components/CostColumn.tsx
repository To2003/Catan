import { useEffect, useState } from 'react';
import type { LegalMoves } from '@tierra-austral/engine';
import { CostCard } from './CostCard.js';
import { WIDE_ENOUGH } from '../lib/useMediaQuery.js';

const KEY = 'tierra-austral:costos-abiertos';

/** The three amounts of room the card can get. */
type Room = 'column' | 'tab' | 'drawer';

const WIDE = '(min-width: 1280px)';
const MEDIUM = WIDE_ENOUGH;

/**
 * Which of the three shapes fits, as a real media query rather than as CSS
 * classes on three copies.
 *
 * Classes would mean rendering the card three times and hiding two, which
 * puts three copies of every heading in the document. It also cannot express
 * the part that matters: the card starts open in its own column and closed
 * when it would cover the board, and that is a different default per size,
 * not a different style.
 */
const useRoom = (): Room => {
  const [room, setRoom] = useState<Room>(() => {
    if (window.matchMedia(WIDE).matches) return 'column';
    return window.matchMedia(MEDIUM).matches ? 'tab' : 'drawer';
  });

  useEffect(() => {
    const wide = window.matchMedia(WIDE);
    const medium = window.matchMedia(MEDIUM);
    const update = (): void => {
      setRoom(wide.matches ? 'column' : medium.matches ? 'tab' : 'drawer');
    };
    wide.addEventListener('change', update);
    medium.addEventListener('change', update);
    return () => {
      wide.removeEventListener('change', update);
      medium.removeEventListener('change', update);
    };
  }, []);

  return room;
};

const readOpen = (fallback: boolean): boolean => {
  try {
    const saved = window.localStorage.getItem(KEY);
    return saved === null ? fallback : saved === '1';
  } catch {
    return fallback;
  }
};

interface CostColumnProps {
  readonly canAfford: LegalMoves['canAfford'];
  readonly stock: { readonly roads: number; readonly settlements: number; readonly cities: number };
}

/**
 * The cost card, down the left edge of a game.
 *
 * The left edge was empty, and what belongs there is the one thing people
 * look up in the middle of a turn and cannot read off the board. It stays up
 * during the opening placement too: that is when somebody who has never
 * played needs it most.
 *
 * On a wide screen it has its own column and the board loses nothing for it —
 * the board is limited by height, not width, so the 220px comes out of empty
 * space. Below that it becomes a tab that slides over the board, and on a
 * phone a drawer at the foot.
 */
export function CostColumn({ canAfford, stock }: CostColumnProps) {
  const room = useRoom();
  // Its own column is free, so it starts open there; anywhere else it would
  // be sitting on top of the board, so it starts closed.
  const [open, setOpen] = useState(() => readOpen(room === 'column'));

  const toggle = (): void => {
    setOpen((current) => {
      try {
        window.localStorage.setItem(KEY, current ? '0' : '1');
      } catch {
        // A browser with storage blocked just forgets between games.
      }
      return !current;
    });
  };

  const card = <CostCard canAfford={canAfford} stock={stock} />;

  if (room === 'drawer') {
    return (
      // `order-last` because the component sits first in the row, which is
      // where a column belongs and where a drawer does not: on a phone the
      // row stacks, and the drawer goes at the foot.
      <div className="order-last shrink-0 border-t border-chapa px-3 py-2">
        <button
          type="button"
          aria-expanded={open}
          onClick={toggle}
          className="flex w-full items-center gap-2 text-[13px] font-semibold text-guanaco"
        >
          <span>Costos de construcción</span>
          <span aria-hidden className="ml-auto text-guanaco-apagado">
            {open ? '▾' : '▴'}
          </span>
        </button>
        {open ? <div className="mt-2 max-h-64 overflow-y-auto">{card}</div> : null}
      </div>
    );
  }

  const inColumn = room === 'column';

  return (
    <aside
      aria-label="Costos de construcción"
      className={`relative flex shrink-0 flex-col border-r border-chapa bg-noche ${
        inColumn && open ? 'w-[220px] overflow-y-auto p-3' : 'w-auto'
      }`}
    >
      <button
        type="button"
        aria-expanded={open}
        aria-label={open ? 'Ocultar los costos' : 'Ver los costos'}
        onClick={toggle}
        className={`flex items-center gap-2 text-[13px] font-semibold ${
          inColumn && open
            ? 'mb-2 text-guanaco'
            : 'h-full bg-chapa px-1.5 text-guanaco-apagado hover:text-guanaco'
        }`}
      >
        {inColumn && open ? (
          <>
            <span>Costos</span>
            <span aria-hidden className="ml-auto text-guanaco-apagado">
              ◂
            </span>
          </>
        ) : (
          // Sideways, so no arrow: a caret turned ninety degrees points
          // somewhere it does not mean.
          <span className="tracking-wide [writing-mode:vertical-rl]">Costos</span>
        )}
      </button>

      {open ? (
        inColumn ? (
          card
        ) : (
          // Over the board rather than beside it: at this width taking a
          // column would be taking it from the board.
          <div className="absolute top-0 left-full z-20 h-full w-[220px] overflow-y-auto border-r border-chapa bg-noche p-3 shadow-xl">
            {card}
          </div>
        )
      ) : null}
    </aside>
  );
}

import type { PlayerId } from '@tierra-austral/engine';

interface RollOverlayProps {
  readonly dice: readonly [number, number];
  readonly player: PlayerId;
  readonly nameOf: (playerId: PlayerId) => string;
  readonly seven: boolean;
}

const PIPS: Record<number, readonly [number, number][]> = {
  1: [[1, 1]],
  2: [
    [0, 0],
    [2, 2],
  ],
  3: [
    [0, 0],
    [1, 1],
    [2, 2],
  ],
  4: [
    [0, 0],
    [0, 2],
    [2, 0],
    [2, 2],
  ],
  5: [
    [0, 0],
    [0, 2],
    [1, 1],
    [2, 0],
    [2, 2],
  ],
  6: [
    [0, 0],
    [0, 1],
    [0, 2],
    [2, 0],
    [2, 1],
    [2, 2],
  ],
};

function BigDie({ value, delay }: { readonly value: number; readonly delay: number }) {
  return (
    <span
      className="die-drop inline-grid size-16 grid-cols-3 grid-rows-3 gap-1 rounded-xl bg-stone-100 p-2 shadow-2xl"
      style={{ animationDelay: `${delay}ms` }}
    >
      {Array.from({ length: 9 }, (_, index) => {
        const on = (PIPS[value] ?? []).some(
          ([row, column]) => row === Math.floor(index / 3) && column === index % 3,
        );
        return (
          <span key={index} className={`rounded-full ${on ? 'bg-stone-900' : ''}`} aria-hidden />
        );
      })}
    </span>
  );
}

/**
 * The roll, big and in the middle for a moment.
 *
 * It never takes the pointer: the result is already in the state by the time
 * this appears, so nobody should have to wait for it to finish.
 */
export function RollOverlay({ dice, player, nameOf, seven }: RollOverlayProps) {
  const [first, second] = dice;
  const total = first + second;

  return (
    <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
      <div className="roll-pop flex flex-col items-center gap-2">
        <div className="flex items-center gap-3">
          <BigDie value={first} delay={0} />
          <BigDie value={second} delay={120} />
        </div>
        <p
          className={`rounded-full px-4 py-1 text-2xl font-black tabular-nums shadow-xl ${
            seven ? 'bg-bordo text-stone-100' : 'bg-stone-100 text-stone-900'
          }`}
        >
          {seven ? `¡Salió ${total}!` : total}
        </p>
        <p className="rounded bg-stone-900/80 px-2 py-0.5 text-xs text-stone-300">
          tiró {nameOf(player)}
        </p>
      </div>
    </div>
  );
}

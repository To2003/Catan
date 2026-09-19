interface DiceRollProps {
  readonly dice: readonly [number, number] | undefined;
  /** Counts the rolls so far. A change replays the tumble, repeats included. */
  readonly roll: number;
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

function Die({ value }: { readonly value: number }) {
  return (
    <span className="inline-grid size-6 grid-cols-3 grid-rows-3 gap-px rounded bg-stone-100 p-0.5">
      {Array.from({ length: 9 }, (_, index) => {
        const row = Math.floor(index / 3);
        const column = index % 3;
        const on = (PIPS[value] ?? []).some(([r, c]) => r === row && c === column);
        return (
          <span
            key={index}
            className={`rounded-full ${on ? 'bg-stone-900' : ''}`}
            aria-hidden="true"
          />
        );
      })}
    </span>
  );
}

/**
 * The dice, with a short tumble when a new roll arrives.
 *
 * The animation is replayed by remounting on the roll counter rather than by
 * setting state in an effect: the same two numbers twice in a row still tumble.
 */
export function DiceRoll({ dice, roll }: DiceRollProps) {
  if (!dice) return null;
  const [first, second] = dice;

  return (
    <span
      key={roll}
      className="dice-tumble flex items-center gap-1 rounded bg-stone-800 px-2 py-1 text-xs"
      title={`Sacaste ${first + second}`}
    >
      <Die value={first} />
      <Die value={second} />
      <span className="font-mono">{first + second}</span>
    </span>
  );
}

import { useEffect, useRef, useState } from 'react';

interface CopyButtonProps {
  readonly text: string;
  readonly label: string;
  /** What to say once it worked. */
  readonly done?: string;
  readonly className?: string;
}

/** How long the confirmation stays up. Long enough to read, short enough to forget. */
const CONFIRM_MS = 1600;

/**
 * Copies something and says so.
 *
 * The confirmation replaces the label in place rather than raising a toast:
 * you are looking at the button you just pressed, and a message somewhere
 * else is a message you can miss. If the clipboard is refused — an insecure
 * origin, a browser that says no — the button says that too, because silence
 * would look like it worked.
 */
export function CopyButton({ text, label, done = '¡Copiado!', className = '' }: CopyButtonProps) {
  const [state, setState] = useState<'idle' | 'done' | 'failed'>('idle');
  const timer = useRef<number | undefined>(undefined);

  useEffect(
    () => () => {
      window.clearTimeout(timer.current);
    },
    [],
  );

  const flash = (next: 'done' | 'failed'): void => {
    setState(next);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      setState('idle');
    }, CONFIRM_MS);
  };

  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard.writeText(text).then(
          () => {
            flash('done');
          },
          () => {
            flash('failed');
          },
        );
      }}
      // Announced when it changes, so this works without looking at it.
      aria-live="polite"
      className={`rounded-panel px-2.5 py-1 text-[13px] font-semibold transition-colors ${
        state === 'done'
          ? 'bg-verde text-noche'
          : state === 'failed'
            ? 'bg-lenga text-guanaco'
            : 'bg-chapa-alta text-guanaco hover:bg-chapa'
      } ${className}`}
    >
      {state === 'done' ? done : state === 'failed' ? 'No se pudo' : label}
    </button>
  );
}

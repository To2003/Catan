import { useState } from 'react';

const KEY = 'tierra-austral:codigo-oculto';

const readHidden = (): boolean => {
  try {
    return window.localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
};

const writeHidden = (hidden: boolean): void => {
  try {
    window.localStorage.setItem(KEY, hidden ? '1' : '0');
  } catch {
    // A browser with storage blocked just shows the code every time.
  }
};

/**
 * Whether this browser is hiding the room code, and the switch for it.
 *
 * It is a preference of the person looking at the screen, not a property of
 * the room: somebody streaming hides it so the chat cannot walk in, and that
 * has nothing to do with anybody else in the room. So it lives in
 * localStorage and never reaches the server.
 *
 * Hiding it does not disable copying. The point is that the code is not
 * readable over somebody's shoulder, not that it stops working.
 */
export const useHiddenCode = (): { hidden: boolean; toggle: () => void } => {
  const [hidden, setHidden] = useState(readHidden);
  return {
    hidden,
    toggle: () => {
      setHidden((current) => {
        writeHidden(!current);
        return !current;
      });
    },
  };
};

export function EyeButton({
  hidden,
  onToggle,
  className = '',
}: {
  readonly hidden: boolean;
  readonly onToggle: () => void;
  readonly className?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={hidden}
      title={hidden ? 'Mostrar el código' : 'Ocultar el código'}
      aria-label={hidden ? 'Mostrar el código de la sala' : 'Ocultar el código de la sala'}
      onClick={onToggle}
      className={`rounded-panel p-1 text-guanaco-apagado hover:bg-chapa-alta hover:text-guanaco ${className}`}
    >
      <svg viewBox="0 0 20 20" aria-hidden className="size-4" fill="none" stroke="currentColor">
        <path
          d="M1.5 10S4.5 4.5 10 4.5 18.5 10 18.5 10 15.5 15.5 10 15.5 1.5 10 1.5 10Z"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
        <circle cx="10" cy="10" r="2.6" strokeWidth="1.5" />
        {hidden ? <path d="M3 17 L17 3" strokeWidth="1.8" strokeLinecap="round" /> : null}
      </svg>
    </button>
  );
}

/** The code itself, or the same number of dots. */
export function CodeText({ code, hidden }: { readonly code: string; readonly hidden: boolean }) {
  return (
    <span aria-label={hidden ? 'Código oculto' : `Código de la sala ${code}`}>
      {hidden ? '•'.repeat(code.length) : code}
    </span>
  );
}

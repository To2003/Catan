import { useCallback, useEffect, useMemo, useState } from 'react';
import { generateBoard } from '@tierra-austral/engine';
import { Board } from '../components/board/Board.js';
import { randomSeed, readDebugFromUrl, readSeedFromUrl, writeSeedToUrl } from '../lib/seed.js';

/**
 * M1 screen: generate a board and look at it. No game interaction yet.
 */
export function BoardScreen() {
  const [seed, setSeed] = useState(() => readSeedFromUrl() ?? randomSeed());
  const [debug, setDebug] = useState(readDebugFromUrl);

  useEffect(() => {
    writeSeedToUrl(seed);
  }, [seed]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'd' || event.key === 'D') setDebug((on) => !on);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  const { board, robberHex } = useMemo(() => generateBoard(seed), [seed]);

  const newBoard = useCallback(() => {
    setSeed(randomSeed());
  }, []);

  return (
    <main className="flex h-screen flex-col overflow-hidden bg-stone-900 text-stone-100">
      <header className="flex flex-wrap items-center gap-3 border-b border-stone-700 px-4 py-3">
        <h1 className="text-xl font-bold tracking-tight">Tierra Austral</h1>
        <span className="rounded bg-stone-800 px-2 py-1 font-mono text-xs text-stone-300">
          semilla {seed}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={newBoard}
            className="rounded bg-stone-100 px-3 py-1.5 text-sm font-semibold text-stone-900 hover:bg-white"
          >
            Tablero nuevo
          </button>
          <button
            type="button"
            onClick={() => {
              setDebug((on) => !on);
            }}
            aria-pressed={debug}
            className={`rounded px-3 py-1.5 text-sm font-semibold ${
              debug
                ? 'bg-amarillo text-stone-900'
                : 'bg-stone-700 text-stone-200 hover:bg-stone-600'
            }`}
          >
            Debug (D)
          </button>
        </div>
      </header>

      <div className="min-h-0 flex-1 p-2">
        <Board board={board} robberHex={robberHex} debug={debug} />
      </div>

      <footer className="border-t border-stone-700 px-4 py-2 text-xs text-stone-400">
        Copiá el link para volver a ver este mismo tablero. Apretá D para ver los IDs.
      </footer>
    </main>
  );
}

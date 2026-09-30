import { useCallback, useEffect, useMemo, useState } from 'react';
import { BOARD_MODES, generateBoard, type BoardMode } from '@tierra-austral/engine';
import { Board } from '../components/board/Board.js';
import { randomSeed, readDebugFromUrl, readSeedFromUrl, writeSeedToUrl } from '../lib/seed.js';

/**
 * M1 screen: generate a board and look at it. No game interaction yet.
 */
/** How many boards the gallery lays out at once. */
const GALLERY_SEEDS = 10;

/**
 * A wall of boards, for looking at the same detail across many of them.
 *
 * One board tells you nothing about a harbour that goes wrong on three of the
 * nine positions: the three that misbehave are the same three every time, and
 * you only notice they are always the same three by seeing ten at once.
 */
function Gallery({ from, mode }: { readonly from: number; readonly mode: BoardMode }) {
  const boards = useMemo(
    () =>
      Array.from({ length: GALLERY_SEEDS }, (_, index) => {
        const seed = from + index;
        return { seed, ...generateBoard(seed, mode) };
      }),
    [from, mode],
  );

  return (
    <div className="grid gap-3 p-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5">
      {boards.map((entry) => (
        <figure key={entry.seed} className="rounded-panel bg-chapa/40 p-2">
          <div className="aspect-square">
            <Board board={entry.board} robberHex={entry.robberHex} debug={false} />
          </div>
          <figcaption className="mt-1 text-center text-[13px] text-guanaco-apagado">
            semilla {entry.seed}
          </figcaption>
        </figure>
      ))}
    </div>
  );
}

export function BoardScreen() {
  const [seed, setSeed] = useState(() => readSeedFromUrl() ?? randomSeed());
  const [debug, setDebug] = useState(readDebugFromUrl);
  const [gallery, setGallery] = useState(false);
  const [mode, setMode] = useState<BoardMode>('random');

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

  const { board, robberHex } = useMemo(() => generateBoard(seed, mode), [seed, mode]);

  const newBoard = useCallback(() => {
    setSeed(randomSeed());
  }, []);

  return (
    <main className="flex h-dvh flex-col overflow-hidden bg-noche text-guanaco">
      <header className="flex flex-wrap items-center gap-3 border-b border-stone-700 px-4 py-3">
        <h1 className="text-xl font-bold tracking-tight">Tierra Austral</h1>
        <span className="rounded bg-stone-800 px-2 py-1 font-mono text-xs text-stone-300">
          semilla {seed}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <select
            value={mode}
            aria-label="Modo de tablero"
            onChange={(event) => {
              setMode(event.target.value as BoardMode);
            }}
            className="rounded-panel bg-chapa px-2 py-1.5 text-sm"
          >
            {BOARD_MODES.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
          <button
            type="button"
            aria-pressed={gallery}
            onClick={() => {
              setGallery((on) => !on);
            }}
            className={`rounded px-3 py-1.5 text-sm font-semibold ${
              gallery ? 'bg-estepa text-noche' : 'bg-stone-700 text-stone-200 hover:bg-stone-600'
            }`}
          >
            {GALLERY_SEEDS} semillas
          </button>
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

      {gallery ? (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <Gallery from={seed} mode={mode} />
        </div>
      ) : (
        <div className="min-h-0 flex-1 p-2">
          <Board board={board} robberHex={robberHex} debug={debug} />
        </div>
      )}

      <footer className="border-t border-stone-700 px-4 py-2 text-xs text-stone-400">
        Copiá el link para volver a ver este mismo tablero. Apretá D para ver los IDs. El botón de
        semillas muestra diez seguidas, para revisar los puertos de a muchas. Las piezas se miran en{' '}
        <code>?sprites=1</code>.
      </footer>
    </main>
  );
}

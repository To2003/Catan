import { useGame } from '../store/gameStore.js';
import { PLAYER_COLORS } from '../lib/playerColors.js';

/** Who won, and what everybody ended on. */
export function GameOverScreen() {
  const view = useGame((state) => state.view);
  if (!view || view.phase.kind !== 'gameOver') return null;

  const phase = view.phase;
  const winner = view.players.find((player) => player.id === phase.winner);

  return (
    <main className="flex h-screen flex-col items-center justify-center gap-6 bg-stone-900 text-stone-100">
      <h1 className="text-3xl font-bold">Ganó {winner?.name ?? '—'}</h1>

      <ul className="w-80 space-y-1">
        {view.players.map((player) => (
          <li
            key={player.id}
            className="flex items-center gap-2 rounded bg-stone-800 px-3 py-2 text-sm"
          >
            <span
              className="inline-block size-3 rounded-full"
              style={{ backgroundColor: PLAYER_COLORS[player.color] }}
            />
            <span>{player.name}</span>
            <span className="ml-auto font-mono">
              {player.id === view.you ? view.me.points : player.publicPoints} PV
            </span>
          </li>
        ))}
      </ul>

      <button
        type="button"
        onClick={() => {
          window.location.reload();
        }}
        className="rounded bg-stone-100 px-4 py-2 font-semibold text-stone-900"
      >
        Volver al inicio
      </button>
    </main>
  );
}

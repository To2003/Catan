import type { PlayerId } from '@tierra-austral/engine';
import { useGame } from '../store/gameStore.js';
import { PLAYER_COLORS } from '../lib/playerColors.js';

/**
 * How the game ended, broken down, and the chance to play another one in the
 * same room.
 *
 * Only your own victory cards are counted openly: the winner's are revealed in
 * the GameWon event, everybody else's stay theirs.
 */
export function GameOverScreen() {
  const view = useGame((state) => state.view);
  const room = useGame((state) => state.room);
  const events = useGame((state) => state.events);
  const rematch = useGame((state) => state.rematch);

  if (!view || view.phase.kind !== 'gameOver') return null;
  const phase = view.phase;

  const won = events.find((event) => event.type === 'GameWon');
  const winner = view.players.find((player) => player.id === phase.winner);
  const isHost = room?.hostId === view.you;
  const wins = room?.wins ?? {};
  const played = room?.gamesPlayed ?? 0;

  const buildingPoints = (playerId: PlayerId): { settlements: number; cities: number } => {
    let settlements = 0;
    let cities = 0;
    for (const vertex of view.board.vertexIds) {
      const building = view.buildings[vertex];
      if (building?.owner !== playerId) continue;
      if (building.type === 'city') cities += 1;
      else settlements += 1;
    }
    return { settlements, cities };
  };

  return (
    <main className="flex h-screen flex-col items-center justify-center gap-6 bg-stone-900 text-stone-100">
      <div className="text-center">
        <h1 className="text-3xl font-bold">Ganó {winner?.name ?? '—'}</h1>
        {won?.type === 'GameWon' ? (
          <p className="mt-1 text-sm text-stone-400">
            {won.points} puntos
            {won.revealedVpCards > 0
              ? `, con ${won.revealedVpCards} carta${won.revealedVpCards === 1 ? '' : 's'} de PV escondida${
                  won.revealedVpCards === 1 ? '' : 's'
                }`
              : ''}
          </p>
        ) : null}
        <p className="mt-1 text-[13px] text-guanaco-apagado">
          Duró {view.round} ronda{view.round === 1 ? '' : 's'} · {view.turn} turno
          {view.turn === 1 ? '' : 's'}
        </p>
      </div>

      <table className="w-[28rem] text-sm">
        <thead className="text-xs text-stone-400 uppercase">
          <tr>
            <th className="text-left font-normal">Jugador</th>
            <th className="font-normal">Asent.</th>
            <th className="font-normal">Ciudades</th>
            <th className="font-normal">Camino</th>
            <th className="font-normal">Ejército</th>
            <th className="font-normal">Cartas</th>
            <th className="font-normal">Total</th>
            <th className="font-normal">Ganadas</th>
          </tr>
        </thead>
        <tbody>
          {view.players.map((player) => {
            const { settlements, cities } = buildingPoints(player.id);
            const road = view.longestRoad?.owner === player.id;
            const army = view.largestArmy === player.id;
            const isWinner = player.id === phase.winner;
            const isMe = player.id === view.you;
            // Only the winner's hidden cards are public; yours are yours.
            const hidden = isWinner
              ? won?.type === 'GameWon'
                ? won.revealedVpCards
                : 0
              : isMe
                ? view.me.points - player.publicPoints
                : undefined;
            const total = isWinner
              ? won?.type === 'GameWon'
                ? won.points
                : player.publicPoints
              : isMe
                ? view.me.points
                : player.publicPoints;

            return (
              <tr key={player.id} className={isWinner ? 'font-semibold' : ''}>
                <td className="flex items-center gap-2 py-1">
                  <span
                    className="inline-block size-3 rounded-full"
                    style={{ backgroundColor: PLAYER_COLORS[player.color] }}
                  />
                  {player.name}
                </td>
                <td className="text-center">{settlements}</td>
                <td className="text-center">{cities * 2}</td>
                <td className="text-center">{road ? 2 : 0}</td>
                <td className="text-center">{army ? 2 : 0}</td>
                <td className="text-center">{hidden ?? '—'}</td>
                <td className="text-center font-mono">{total}</td>
                <td className="text-center font-mono text-estepa">{wins[player.id] ?? 0}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {played > 0 ? (
        <p className="-mt-3 text-xs text-guanaco-apagado">
          {played + 1} partida{played === 0 ? '' : 's'} jugadas en esta sala
        </p>
      ) : null}

      <div className="flex gap-2">
        {isHost ? (
          <button
            type="button"
            onClick={rematch}
            className="rounded bg-stone-100 px-4 py-2 font-semibold text-stone-900"
          >
            Revancha en esta sala
          </button>
        ) : (
          <p className="text-xs text-stone-500">Esperando la revancha del host…</p>
        )}
        <button
          type="button"
          onClick={() => {
            window.location.reload();
          }}
          className="rounded bg-stone-700 px-4 py-2 font-semibold hover:bg-stone-600"
        >
          Volver al inicio
        </button>
      </div>
    </main>
  );
}

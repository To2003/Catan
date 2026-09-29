import type { PlayerId, PlayerView } from '@tierra-austral/engine';
import { PLAYER_COLORS } from '../lib/playerColors.js';

interface PlayerListProps {
  readonly view: PlayerView;
  readonly connected: (playerId: PlayerId) => boolean;
  /** Draw this player's longest route on the board while the pointer is on it. */
  readonly onHoverRoute: (playerId: PlayerId | undefined) => void;
}

/**
 * Who is playing, and where everybody stands.
 *
 * The road number is the **longest continuous route**, not how many roads are
 * on the board, because that is what the bonus counts. The two differ often
 * enough to be confusing, so hovering draws the route on the board and, when
 * they differ, the tooltip says why.
 */
export function PlayerList({ view, connected, onHoverRoute }: PlayerListProps) {
  const roadTooltip = (playerId: PlayerId, roads: number, route: number): string => {
    const mine = playerId === view.you;
    if (roads === route) {
      return mine
        ? `Tu recorrido más largo es de ${route}`
        : `Su recorrido más largo es de ${route}`;
    }
    return mine
      ? `Tenés ${roads} caminos, pero el recorrido más largo es de ${route}. Las ramas no se suman.`
      : `Tiene ${roads} caminos, pero su recorrido más largo es de ${route}. Las ramas no se suman.`;
  };

  return (
    <ul className="space-y-1">
      {view.turnOrder.map((id) => {
        const player = view.players.find((candidate) => candidate.id === id);
        if (!player) return null;

        const isTurn = id === view.currentPlayer;
        const isMe = id === view.you;
        const hasRoad = view.longestRoad?.owner === id;
        const hasArmy = view.largestArmy === id;

        return (
          <li
            key={id}
            className={`flex items-center gap-2 rounded px-2 py-1 ${isTurn ? 'bg-stone-700' : ''}`}
          >
            <span
              className="inline-block size-3 shrink-0 rounded-full"
              style={{ backgroundColor: PLAYER_COLORS[player.color] }}
            />
            <span className={isTurn ? 'font-semibold' : ''}>{player.name}</span>
            {isMe ? <span className="text-[10px] text-stone-400">vos</span> : null}
            {!connected(id) ? <span className="text-[10px] text-stone-500">offline</span> : null}

            <span
              title={roadTooltip(id, player.roadCount, player.routeLength)}
              onMouseEnter={() => {
                onHoverRoute(id);
              }}
              onMouseLeave={() => {
                onHoverRoute(undefined);
              }}
              className={`ml-auto cursor-help rounded px-1 font-mono text-[11px] ${
                hasRoad ? 'bg-amarillo font-bold text-stone-900' : 'text-stone-400'
              }`}
            >
              🛣 {player.routeLength}
            </span>

            <span
              title={`${player.knightsPlayed} caballero${player.knightsPlayed === 1 ? '' : 's'} jugado${
                player.knightsPlayed === 1 ? '' : 's'
              }`}
              className={`rounded px-1 font-mono text-[11px] ${
                hasArmy ? 'bg-amarillo font-bold text-stone-900' : 'text-stone-400'
              }`}
            >
              ⚔ {player.knightsPlayed}
            </span>

            <span title="Cartas en mano" className="font-mono text-[11px] text-stone-400">
              🂠 {player.resourceCount}
            </span>

            <span
              title={isMe ? 'Incluye tus cartas de PV' : 'Puntos visibles'}
              className="w-10 text-right font-mono text-xs"
            >
              {isMe ? view.me.points : player.publicPoints} PV
            </span>
          </li>
        );
      })}
    </ul>
  );
}

import { useState } from 'react';
import type { PlayerId, PlayerView } from '@tierra-austral/engine';
import { PLAYER_COLORS } from '../lib/playerColors.js';
import { HostMenu } from './lobby/HostMenu.js';

interface PlayerListProps {
  readonly view: PlayerView;
  readonly connected: (playerId: PlayerId) => boolean;
  /** Whether you are the host, which is who gets the ⋯ over the others. */
  readonly youAreHost?: boolean;
  /** Draw this player's longest route on the board while the pointer is on it. */
  readonly onHoverRoute: (playerId: PlayerId | undefined) => void;
  /** What each player just gained, to float over their row for a moment. */
  readonly gains: ReadonlyMap<PlayerId, string>;
}

/** Set once the legend has been read, so it never comes back. */
const LEGEND_KEY = 'ta:leyenda-jugadores';

const legendWasRead = (): boolean => {
  try {
    return window.localStorage.getItem(LEGEND_KEY) === '1';
  } catch {
    return false;
  }
};

/**
 * The three marks on a player's row, drawn rather than typed.
 *
 * They were emoji — 🛣 ⚔ 🂠 — and on the machines people actually play on
 * those fall back to whatever glyph the system has, which turned the row into
 * three unreadable numbers. Four lines of SVG each look the same everywhere.
 */
const ICONS = {
  route: (
    <>
      <path d="M2 13 L7 3" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M14 13 L9 3" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M8 4 v2 M8 8.5 v2 M8 13 v0.5" strokeWidth="1.4" strokeLinecap="round" />
    </>
  ),
  knight: (
    <>
      <path d="M12.5 2.5 L6 9" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M10.5 2.5 h2.5 v2.5" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M3 13.5 L6.5 10" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M4.5 8.5 L7.5 11.5" strokeWidth="1.4" strokeLinecap="round" />
    </>
  ),
  cards: (
    <>
      <rect x="2" y="4" width="7" height="9.5" rx="1.2" strokeWidth="1.4" />
      <path d="M11 3.2 l2.6 0.9 -2.2 7.4" strokeWidth="1.4" strokeLinejoin="round" />
    </>
  ),
} as const;

function Icon({ name }: { readonly name: keyof typeof ICONS }) {
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden
      className="size-4 shrink-0"
      fill="none"
      stroke="currentColor"
    >
      {ICONS[name]}
    </svg>
  );
}

/** One statistic on a player's row: a mark, a number, and its name on hover. */
function Stat({
  icon,
  value,
  title,
  highlight = false,
  ...handlers
}: {
  readonly icon: keyof typeof ICONS;
  readonly value: number;
  readonly title: string;
  readonly highlight?: boolean;
  readonly onMouseEnter?: () => void;
  readonly onMouseLeave?: () => void;
}) {
  return (
    <span
      title={title}
      {...handlers}
      className={`flex cursor-help items-center gap-1 rounded px-1 py-0.5 text-[13px] ${
        highlight ? 'bg-amarillo font-bold text-stone-900' : 'text-guanaco-apagado'
      }`}
    >
      <Icon name={icon} />
      <span className="font-display font-semibold">{value}</span>
    </span>
  );
}

/**
 * Who is playing, and where everybody stands.
 *
 * Victory points are the one number that decides the game, so they are the one
 * number set large. The road figure is the **longest continuous route**, not
 * how many roads are on the board, because that is what the bonus counts. The
 * two differ often enough to be confusing, so hovering draws the route on the
 * board and, when they differ, the tooltip says why.
 */
export function PlayerList({
  view,
  connected,
  onHoverRoute,
  gains,
  youAreHost = false,
}: PlayerListProps) {
  const [legendRead, setLegendRead] = useState(legendWasRead);

  const roadTooltip = (playerId: PlayerId, roads: number, route: number): string => {
    const mine = playerId === view.you;
    if (roads === route) {
      return mine
        ? `Recorrido más largo: ${route} caminos seguidos`
        : `Su recorrido más largo: ${route} caminos seguidos`;
    }
    return mine
      ? `Tenés ${roads} caminos, pero el recorrido más largo es de ${route}. Las ramas no se suman.`
      : `Tiene ${roads} caminos, pero su recorrido más largo es de ${route}. Las ramas no se suman.`;
  };

  return (
    <>
      <ul className="space-y-1">
        {view.turnOrder.map((id) => {
          const player = view.players.find((candidate) => candidate.id === id);
          if (!player) return null;

          const isTurn = id === view.currentPlayer;
          const isMe = id === view.you;
          const hasRoad = view.longestRoad?.owner === id;
          const hasArmy = view.largestArmy === id;
          const points = isMe ? view.me.points : player.publicPoints;

          const gain = gains.get(id);

          return (
            <li
              key={id}
              // The animation finds the row by this attribute: cards fly here.
              data-player={id}
              className={`relative flex items-center gap-2 rounded-panel px-2 py-1.5 ${
                isTurn ? 'bg-chapa' : ''
              }`}
            >
              {gain === undefined ? null : (
                <span className="ticker-rise pointer-events-none absolute -top-1 right-2 z-10 rounded bg-noche/90 px-1.5 py-0.5 text-[13px] font-bold text-verde shadow">
                  {gain}
                </span>
              )}

              <span
                className="inline-block size-3 shrink-0 rounded-full"
                style={{ backgroundColor: PLAYER_COLORS[player.color] }}
              />

              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="flex items-baseline gap-1.5 truncate">
                  <span className={`text-[14px] ${isTurn ? 'font-semibold' : ''}`}>
                    {player.name}
                  </span>
                  {isMe ? <span className="text-[13px] text-guanaco-apagado">vos</span> : null}
                  {/* Walking out is final and being away is not; the row has
                      to tell them apart or the table waits for nothing. */}
                  {player.hasLeft ? (
                    <span className="text-[13px] text-guanaco-apagado line-through">abandonó</span>
                  ) : !connected(id) ? (
                    <span className="text-[13px] text-lenga">desconectado</span>
                  ) : null}
                </span>

                <span className="flex items-center gap-1">
                  <Stat
                    icon="route"
                    value={player.routeLength}
                    title={roadTooltip(id, player.roadCount, player.routeLength)}
                    highlight={hasRoad}
                    onMouseEnter={() => {
                      onHoverRoute(id);
                    }}
                    onMouseLeave={() => {
                      onHoverRoute(undefined);
                    }}
                  />
                  <Stat
                    icon="knight"
                    value={player.knightsPlayed}
                    title={`${player.knightsPlayed} caballero${
                      player.knightsPlayed === 1 ? '' : 's'
                    } jugado${player.knightsPlayed === 1 ? '' : 's'}`}
                    highlight={hasArmy}
                  />
                  <Stat
                    icon="cards"
                    value={player.resourceCount}
                    title={`${player.resourceCount} cartas de recurso en la mano`}
                  />
                </span>
              </div>

              <span
                title={isMe ? 'Tus puntos, incluidas las cartas de PV' : 'Puntos a la vista'}
                className="flex shrink-0 items-baseline gap-1"
              >
                <span className="font-display text-2xl leading-none font-bold text-guanaco">
                  {points}
                </span>
                <span className="text-[13px] text-guanaco-apagado">PV</span>
              </span>

              {youAreHost && !isMe && !player.hasLeft ? (
                <HostMenu target={id} name={player.name} inGame />
              ) : null}
            </li>
          );
        })}
      </ul>

      {legendRead ? null : (
        <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-panel bg-chapa px-2 py-1.5 text-[13px] text-guanaco-apagado">
          <span className="flex items-center gap-1">
            <Icon name="route" /> recorrido más largo
          </span>
          <span className="flex items-center gap-1">
            <Icon name="knight" /> caballeros
          </span>
          <span className="flex items-center gap-1">
            <Icon name="cards" /> cartas en mano
          </span>
          <button
            type="button"
            onClick={() => {
              setLegendRead(true);
              try {
                window.localStorage.setItem(LEGEND_KEY, '1');
              } catch {
                // A browser that refuses storage just sees the legend again.
              }
            }}
            className="ml-auto rounded-panel bg-chapa-alta px-2 py-0.5 font-semibold text-guanaco"
          >
            Entendido
          </button>
        </p>
      )}
    </>
  );
}

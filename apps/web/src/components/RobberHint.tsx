import type { HexId, PlayerId, PlayerView } from '@tierra-austral/engine';
import { PLAYER_COLORS } from '../lib/playerColors.js';
import { TERRAIN_STYLES } from '../lib/terrainStyles.js';

interface RobberHintProps {
  readonly view: PlayerView;
  readonly hex: HexId;
  /** Where the pointer is, in page coordinates. */
  readonly at: { readonly x: number; readonly y: number };
  readonly nameOf: (playerId: PlayerId) => string;
}

/**
 * Who a hex would hurt.
 *
 * Deciding where the robber goes means knowing who has a building on that hex
 * and how many cards they are holding — information that was on the screen but
 * had to be pieced together by eye.
 */
export function RobberHint({ view, hex, at, nameOf }: RobberHintProps) {
  const tile = view.board.hexes[hex];
  if (!tile) return null;

  const owners = new Set<PlayerId>();
  for (const corner of tile.corners) {
    const owner = view.buildings[corner]?.owner;
    if (owner !== undefined) owners.add(owner);
  }

  const victims = [...owners]
    .filter((owner) => owner !== view.you)
    .map((owner) => view.players.find((player) => player.id === owner))
    .filter((player) => player !== undefined);
  const mine = owners.has(view.you);

  const terrain = TERRAIN_STYLES[tile.terrain].label;
  const number = tile.number === undefined ? 'sin número' : `número ${tile.number}`;

  return (
    <div
      className="pointer-events-none fixed z-30 w-56 rounded-lg border border-stone-600 bg-stone-900/95 p-2 text-xs shadow-xl"
      style={{ left: Math.min(at.x + 16, window.innerWidth - 240), top: at.y + 16 }}
    >
      <p className="font-semibold">
        {terrain} · {number}
      </p>

      {victims.length === 0 ? (
        <p className="mt-1 text-stone-400">No le sacás una carta a nadie</p>
      ) : (
        <ul className="mt-1 space-y-0.5">
          {victims.map((player) => (
            <li key={player.id} className="flex items-center gap-2">
              <span
                className="inline-block size-2.5 rounded-full"
                style={{ backgroundColor: PLAYER_COLORS[player.color] }}
              />
              <span>{nameOf(player.id)}</span>
              <span className="ml-auto font-mono text-stone-400">{player.resourceCount} 🂠</span>
            </li>
          ))}
        </ul>
      )}

      {mine ? <p className="mt-1 text-stone-400">Ojo: también bloqueás un edificio tuyo</p> : null}
    </div>
  );
}

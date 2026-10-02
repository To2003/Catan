import { createPortal } from 'react-dom';
import type { HexId, PlayerId, PlayerView } from '@tierra-austral/engine';
import { PLAYER_COLORS } from '../lib/playerColors.js';
import { TERRAIN_STYLES } from '../lib/terrainStyles.js';

interface RobberHintProps {
  readonly view: PlayerView;
  readonly hex: HexId;
  /** Where the pointer is, in page coordinates. */
  readonly at: { readonly x: number; readonly y: number };
  readonly nameOf: (playerId: PlayerId) => string;
  /** Shown on a touch screen, where a second tap is what confirms. */
  readonly onConfirm?: () => void;
}

/**
 * Who a hex would hurt.
 *
 * Deciding where the robber goes means knowing who has a building on that hex
 * and how many cards they are holding — information that was on the screen but
 * had to be pieced together by eye.
 */
export function RobberHint({ view, hex, at, nameOf, onConfirm }: RobberHintProps) {
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

  // In a portal: the hint has to sit above the board whatever the board's own
  // stacking context is doing, and it is not part of the board's layout.
  return createPortal(
    <div
      data-testid="robber-hint"
      className={`fixed z-50 w-56 rounded-panel border border-chapa-alta bg-noche/95 p-2 text-[13px] shadow-xl ${
        onConfirm === undefined ? 'pointer-events-none' : ''
      }`}
      style={{
        left: Math.min(Math.max(at.x + 16, 8), window.innerWidth - 240),
        top: Math.min(at.y + 16, window.innerHeight - 160),
      }}
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

      {onConfirm === undefined ? null : (
        <button
          type="button"
          onClick={onConfirm}
          className="mt-2 w-full rounded-panel bg-estepa px-3 py-2 text-[14px] font-semibold text-noche"
        >
          Mover acá
        </button>
      )}
    </div>,
    document.body,
  );
}

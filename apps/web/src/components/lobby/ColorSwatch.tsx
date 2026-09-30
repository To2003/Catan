import { useEffect, useRef, useState } from 'react';
import type { PlayerColor } from '@tierra-austral/engine';
import { PLAYER_COLORS, PLAYER_COLOR_LABELS } from '../../lib/playerColors.js';

export const COLORS: readonly PlayerColor[] = ['celeste', 'bordo', 'verde', 'amarillo'];

interface ColorSwatchProps {
  readonly color: PlayerColor | undefined;
  /** Who holds each colour right now, so a taken one can say whose it is. */
  readonly takenBy: Readonly<Partial<Record<PlayerColor, string>>>;
  /** Off for everybody else's seat: you only pick your own colour. */
  readonly editable: boolean;
  readonly onPick: (color: PlayerColor) => void;
}

/**
 * The dot of colour on a seat, and — on your own seat — the way you change it.
 *
 * The picker hangs off the seat instead of living as a separate row of four
 * buttons below the list. A colour belongs to a person, so the place to
 * change it is on that person's line; the loose row never said whose colour
 * it was about.
 *
 * A seat with no colour yet shows a dashed outline rather than an empty
 * circle, so "hasn't chosen" reads as a state and not as a rendering bug.
 */
export function ColorSwatch({ color, takenBy, editable, onPick }: ColorSwatchProps) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setOpen(false);
    };
    const onOutside = (event: MouseEvent): void => {
      if (!box.current?.contains(event.target as Node)) setOpen(false);
    };

    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onOutside);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onOutside);
    };
  }, [open]);

  const dot = (
    <span
      aria-hidden
      className={`block size-5 rounded-full ${
        color === undefined ? 'border-2 border-dashed border-guanaco-apagado' : ''
      }`}
      style={color === undefined ? {} : { backgroundColor: PLAYER_COLORS[color] }}
    />
  );

  if (!editable) {
    return (
      <span
        title={color === undefined ? 'Todavía no eligió color' : PLAYER_COLOR_LABELS[color]}
        className="shrink-0"
      >
        {dot}
        <span className="sr-only">
          {color === undefined ? 'Sin color' : PLAYER_COLOR_LABELS[color]}
        </span>
      </span>
    );
  }

  return (
    <div ref={box} className="relative shrink-0">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={
          color === undefined ? 'Elegí tu color' : `Tu color: ${PLAYER_COLOR_LABELS[color]}`
        }
        onClick={() => {
          setOpen((current) => !current);
        }}
        className="block rounded-full p-0.5 ring-1 ring-guanaco-apagado/50 hover:ring-guanaco"
      >
        {dot}
      </button>

      {open ? (
        <div
          role="listbox"
          aria-label="Colores"
          className="absolute top-full left-0 z-30 mt-1.5 flex gap-1 rounded-panel bg-chapa-alta p-1.5 shadow-lg ring-1 ring-noche"
        >
          {COLORS.map((option) => {
            const owner = takenBy[option];
            const mine = option === color;
            const blocked = owner !== undefined && !mine;
            return (
              <button
                key={option}
                type="button"
                role="option"
                aria-selected={mine}
                disabled={blocked}
                title={blocked ? `Lo tiene ${owner}` : PLAYER_COLOR_LABELS[option]}
                onClick={() => {
                  onPick(option);
                  setOpen(false);
                }}
                className={`size-7 rounded-full ${
                  mine ? 'ring-2 ring-guanaco' : ''
                } ${blocked ? 'cursor-not-allowed opacity-25' : 'hover:ring-2 hover:ring-guanaco/60'}`}
                style={{ backgroundColor: PLAYER_COLORS[option] }}
              >
                <span className="sr-only">
                  {PLAYER_COLOR_LABELS[option]}
                  {blocked ? ` (lo tiene ${owner})` : ''}
                </span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

import type { PlayerColor } from '@tierra-austral/engine';
import { ColorSwatch } from './ColorSwatch.js';

export interface SeatPerson {
  readonly playerId: string;
  readonly name: string;
  readonly color?: PlayerColor;
  readonly ready: boolean;
  readonly connected: boolean;
  /** Games won in this room. Absent or zero means no trophy. */
  readonly wins?: number;
}

interface SeatProps {
  /** 1 to 4. The number is the point: it says how many chairs are still empty. */
  readonly index: number;
  /** Undefined for a chair nobody is sitting in. */
  readonly person?: SeatPerson;
  readonly isHost: boolean;
  readonly isYou: boolean;
  readonly takenBy: Readonly<Partial<Record<PlayerColor, string>>>;
  readonly onPickColor: (color: PlayerColor) => void;
}

/**
 * A chip that says one thing about a seat.
 *
 * Every state carries a mark as well as a colour — a tick, a dash, a word —
 * because "listo" and "no listo" cannot be two shades of the same grey to
 * somebody who does not separate them.
 */
function Tag({
  children,
  tone,
}: {
  readonly children: React.ReactNode;
  readonly tone: 'ready' | 'waiting' | 'gone' | 'host';
}) {
  const skin =
    tone === 'ready'
      ? 'bg-verde/25 text-verde ring-verde/40'
      : tone === 'gone'
        ? 'bg-lenga/25 text-lenga ring-lenga/40'
        : tone === 'host'
          ? 'bg-glaciar/20 text-glaciar ring-glaciar/40'
          : 'bg-chapa-alta text-guanaco-apagado ring-transparent';

  return (
    <span className={`rounded-panel px-1.5 py-0.5 text-[11px] font-semibold ring-1 ${skin}`}>
      {children}
    </span>
  );
}

/**
 * One chair at the table, taken or not.
 *
 * The room always shows four, because the question everybody asks in a lobby
 * is "how many are we missing" and a list that only shows who arrived cannot
 * answer it.
 *
 * Reusable on purpose: the restart vote and the end screen list the same
 * people with different chips.
 */
export function Seat({ index, person, isHost, isYou, takenBy, onPickColor }: SeatProps) {
  if (!person) {
    return (
      <li className="flex items-center gap-3 rounded-panel border border-dashed border-chapa-alta px-3 py-2.5">
        <span className="font-display w-4 shrink-0 text-center text-[13px] text-guanaco-apagado/60">
          {index}
        </span>
        <span
          aria-hidden
          className="size-5 shrink-0 rounded-full border-2 border-dotted border-chapa-alta"
        />
        <span className="text-[14px] text-guanaco-apagado/70 italic">Esperando jugador…</span>
      </li>
    );
  }

  return (
    <li
      className={`flex items-center gap-3 rounded-panel px-3 py-2.5 ${
        isYou ? 'bg-chapa ring-1 ring-estepa/50' : 'bg-chapa'
      }`}
    >
      <span className="font-display w-4 shrink-0 text-center text-[13px] text-guanaco-apagado">
        {index}
      </span>

      <ColorSwatch color={person.color} takenBy={takenBy} editable={isYou} onPick={onPickColor} />

      <span className="min-w-0 flex-1 truncate text-[14px]">
        <span className={isYou ? 'font-semibold text-guanaco' : ''}>{person.name}</span>
        {isYou ? <span className="ml-1.5 text-[13px] text-guanaco-apagado">vos</span> : null}
      </span>

      {(person.wins ?? 0) > 0 ? (
        <span
          title={`${person.wins ?? 0} ganada(s) en esta sala`}
          className="font-display shrink-0 text-[13px] text-estepa"
        >
          🏆 {person.wins}
        </span>
      ) : null}

      {isHost ? <Tag tone="host">host</Tag> : null}

      {!person.connected ? (
        <Tag tone="gone">— desconectado</Tag>
      ) : person.ready ? (
        <Tag tone="ready">✓ listo</Tag>
      ) : (
        <Tag tone="waiting">esperando</Tag>
      )}
    </li>
  );
}

import type { GameEvent, PlayerId } from '@tierra-austral/engine';
import { isVisibleTo } from '@tierra-austral/engine';
import { eventLine, type LogContext } from '../lib/eventText.js';
import { ScrollPane } from './ScrollPane.js';

interface EventLogProps {
  readonly events: readonly GameEvent[];
  readonly you: PlayerId;
  readonly context: LogContext;
  /** With debug on, the engine's own bookkeeping shows up as well. */
  readonly debug: boolean;
}

interface Turn {
  readonly number: number;
  readonly player: PlayerId | undefined;
  readonly lines: { readonly key: string; readonly icon: string; readonly text: string }[];
}

/**
 * What has happened, grouped by turn.
 *
 * Turns are worked out from the events themselves — a TurnEnded closes one and
 * names who plays next — so the log needs nothing the server does not already
 * send.
 */
const groupByTurn = (
  events: readonly GameEvent[],
  you: PlayerId,
  context: LogContext,
  debug: boolean,
): Turn[] => {
  const turns: Turn[] = [{ number: 1, player: undefined, lines: [] }];

  events.forEach((event, index) => {
    if (!isVisibleTo(event, you)) return;

    const line = eventLine(event, context);
    if (line.internal === true && !debug) {
      // Still worth closing the turn on, even though the line itself is noise.
      if (event.type === 'TurnEnded') {
        turns.push({ number: turns.length + 1, player: event.next, lines: [] });
      }
      return;
    }

    const current = turns[turns.length - 1];
    current?.lines.push({ key: `${event.type}-${index}`, icon: line.icon, text: line.text });

    if (event.type === 'TurnEnded') {
      turns.push({ number: turns.length + 1, player: event.next, lines: [] });
    }
  });

  return turns.filter((turn) => turn.lines.length > 0);
};

export function EventLog({ events, you, context, debug }: EventLogProps) {
  const turns = groupByTurn(events, you, context, debug);
  const lineCount = turns.reduce((total, turn) => total + turn.lines.length, 0);

  return (
    <div className="flex min-h-0 flex-col">
      <h3 className="mb-1 text-[13px] font-semibold text-guanaco">Qué pasó</h3>

      <ScrollPane
        itemCount={lineCount}
        className="max-h-56 overflow-y-auto pr-1"
        label={(count) => `${count} novedad${count === 1 ? '' : 'es'}`}
      >
        {lineCount === 0 ? (
          <p className="text-[13px] text-stone-500">Todavía no pasó nada</p>
        ) : (
          <ol className="space-y-1.5 text-[13px] text-stone-300">
            {turns.map((turn) => (
              <li key={turn.number}>
                <p className="mb-0.5 border-b border-stone-700/70 pb-0.5 text-[13px] tracking-wider text-stone-500 uppercase">
                  Turno {turn.number}
                  {turn.player === undefined ? '' : ` · ${context.nameOf(turn.player)}`}
                </p>
                <ul className="space-y-0.5">
                  {turn.lines.map((line) => (
                    <li key={line.key} className="flex gap-1.5 leading-snug">
                      <span aria-hidden className="w-4 shrink-0 text-center">
                        {line.icon}
                      </span>
                      <span className="min-w-0">{line.text}</span>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
        )}
      </ScrollPane>
    </div>
  );
}

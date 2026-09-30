import type { GameEvent, PlayerId } from '@tierra-austral/engine';
import { isVisibleTo, roundOf } from '@tierra-austral/engine';
import { eventLine, type LogContext } from '../lib/eventText.js';
import { ScrollPane } from './ScrollPane.js';

interface EventLogProps {
  readonly events: readonly GameEvent[];
  readonly you: PlayerId;
  /** The engine's own turn counter, so the log and the top bar agree. */
  readonly turn: number;
  readonly players: number;
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
 * What has happened, split at each hand-over.
 *
 * The split comes from the events — a TurnEnded closes a block and names who
 * plays next — but the *numbers* come from the engine, counted backwards from
 * the turn being played now. The log used to number its blocks from one, which
 * is a different number from the engine's whenever the client is missing the
 * start of the game: after a reload it holds only the events since it
 * connected, and it would happily call turn 40 "Turno 3".
 */
const groupByTurn = (
  events: readonly GameEvent[],
  you: PlayerId,
  turn: number,
  context: LogContext,
  debug: boolean,
): Turn[] => {
  const turns: Turn[] = [{ number: 0, player: undefined, lines: [] }];
  let stillSetting = true;

  events.forEach((event, index) => {
    if (!isVisibleTo(event, you)) return;

    // The placement is one block of its own, closed by the phase change that
    // starts turn one. Nothing hands over during setup, so there is no
    // TurnEnded to close it.
    if (stillSetting && event.type === 'PhaseChanged' && event.phase.kind !== 'setup') {
      stillSetting = false;
      turns.push({ number: 0, player: undefined, lines: [] });
    }

    const line = eventLine(event, context);
    if (line.internal === true && !debug) {
      // Still worth closing the turn on, even though the line itself is noise.
      if (event.type === 'TurnEnded') {
        turns.push({ number: 0, player: event.next, lines: [] });
      }
      return;
    }

    const current = turns[turns.length - 1];
    current?.lines.push({ key: `${event.type}-${index}`, icon: line.icon, text: line.text });

    if (event.type === 'TurnEnded') {
      turns.push({ number: 0, player: event.next, lines: [] });
    }
  });

  // The last block is whatever turn is being played, so the rest count back
  // from it. A block at zero or below is the opening placement.
  const numbered = turns.map((block, index) => ({
    ...block,
    number: turn - (turns.length - 1 - index),
  }));
  return numbered.filter((block) => block.lines.length > 0);
};

export function EventLog({ events, you, turn, players, context, debug }: EventLogProps) {
  const turns = groupByTurn(events, you, turn, context, debug);
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
                <p className="mb-0.5 border-b border-stone-700/70 pb-0.5 text-[13px] text-stone-500">
                  {turn.number <= 0
                    ? 'Preparación'
                    : `Ronda ${roundOf(turn.number, players)} · turno ${turn.number}`}
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

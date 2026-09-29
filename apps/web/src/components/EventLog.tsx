import type { GameEvent, PlayerId } from '@tierra-austral/engine';
import { isVisibleTo } from '@tierra-austral/engine';
import { eventText } from '../lib/eventText.js';
import { ScrollPane } from './ScrollPane.js';

interface EventLogProps {
  readonly events: readonly GameEvent[];
  readonly you: PlayerId;
  readonly nameOf: (playerId: PlayerId) => string;
  /** With the debug flag on, the internal phase changes show up too. */
  readonly debug: boolean;
}

/** What has happened, oldest first, following along as it happens. */
export function EventLog({ events, you, nameOf, debug }: EventLogProps) {
  const visible = events.filter((event) => isVisibleTo(event, you));

  return (
    <div className="flex min-h-0 flex-col">
      <h2 className="mb-1 text-xs font-bold tracking-widest text-stone-400 uppercase">Qué pasó</h2>
      <ScrollPane
        itemCount={visible.length}
        className="max-h-56 overflow-y-auto pr-1"
        label={(count) => `${count} novedad${count === 1 ? '' : 'es'}`}
      >
        <ol className="space-y-0.5 text-[11px] text-stone-300">
          {visible.map((event, index) => (
            <li key={`${event.type}-${index}`} className="leading-snug">
              {eventText(event, nameOf)}
            </li>
          ))}
        </ol>
      </ScrollPane>
      {debug ? (
        <p className="mt-1 text-[10px] text-stone-500">Modo debug: se ven las fases internas</p>
      ) : null}
    </div>
  );
}

import type { Effect } from '../../lib/effects.js';
import { RESOURCE_LABELS } from '../../lib/terrainStyles.js';

interface ToastsProps {
  readonly effects: readonly Effect[];
  readonly hexLabel: (hex: string) => string;
}

/**
 * The short explanations that used to be invisible.
 *
 * Bank scarcity especially: "nobody gets wheat because the bank ran out" is a
 * rule people do not know, and until now the only sign of it was a number that
 * failed to change.
 */
export function Toasts({ effects, hexLabel }: ToastsProps) {
  const notices = effects.filter(
    (effect) => effect.kind === 'blocked' || effect.kind === 'scarcity' || effect.kind === 'bonus',
  );
  if (notices.length === 0) return null;

  return (
    <div className="pointer-events-none absolute top-2 left-1/2 z-20 flex -translate-x-1/2 flex-col items-center gap-1">
      {notices.map((effect) => (
        <p
          key={effect.id}
          className="toast-in rounded-full bg-stone-900/95 px-3 py-1 text-xs font-semibold shadow-lg ring-1 ring-stone-600"
        >
          {effect.kind === 'blocked' ? (
            <>🦹 El ladrón bloquea {hexLabel(effect.hex)}</>
          ) : effect.kind === 'scarcity' ? (
            <>🏦 El banco se quedó sin {RESOURCE_LABELS[effect.resource].toLowerCase()}</>
          ) : (
            <>🏅 {effect.text}</>
          )}
        </p>
      ))}
    </div>
  );
}

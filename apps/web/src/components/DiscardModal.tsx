import { useState } from 'react';
import { RESOURCES, type ResourceBundle } from '@tierra-austral/engine';
import { RESOURCE_LABELS } from '../lib/terrainStyles.js';

interface DiscardModalProps {
  /** Only what the modal needs, so a hot-seat Player and a view's `me` both fit. */
  readonly player: { readonly name: string; readonly resources: Readonly<ResourceBundle> };
  readonly owed: number;
  readonly onConfirm: (cards: Partial<ResourceBundle>) => void;
}

/**
 * Picking what to discard on a seven. In hot-seat the players take turns at
 * the same screen, so one modal at a time is enough; the real simultaneous
 * version arrives with the server in M6.
 */
export function DiscardModal({ player, owed, onConfirm }: DiscardModalProps) {
  const [picked, setPicked] = useState<Partial<ResourceBundle>>({});

  const total = RESOURCES.reduce((sum, resource) => sum + (picked[resource] ?? 0), 0);
  const change = (resource: (typeof RESOURCES)[number], delta: number): void => {
    setPicked((current) => {
      const next = (current[resource] ?? 0) + delta;
      if (next < 0 || next > player.resources[resource]) return current;
      return { ...current, [resource]: next };
    });
  };

  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/70">
      <div className="w-96 rounded-lg border border-stone-600 bg-stone-800 p-4">
        <h2 className="text-lg font-bold">Sale un 7: {player.name} descarta</h2>
        <p className="mt-1 text-sm text-stone-300">
          Elegidas {total} de {owed}
        </p>

        <ul className="mt-3 space-y-1">
          {RESOURCES.map((resource) => (
            <li key={resource} className="flex items-center gap-2 text-sm">
              <span className="w-20">{RESOURCE_LABELS[resource]}</span>
              <span className="w-10 text-right font-mono text-stone-400">
                {player.resources[resource]}
              </span>
              <button
                type="button"
                onClick={() => {
                  change(resource, -1);
                }}
                className="size-7 rounded bg-stone-700 font-bold hover:bg-stone-600"
              >
                −
              </button>
              <span className="w-6 text-center font-mono">{picked[resource] ?? 0}</span>
              <button
                type="button"
                onClick={() => {
                  change(resource, 1);
                }}
                className="size-7 rounded bg-stone-700 font-bold hover:bg-stone-600"
              >
                +
              </button>
            </li>
          ))}
        </ul>

        <button
          type="button"
          disabled={total !== owed}
          onClick={() => {
            onConfirm(picked);
            setPicked({});
          }}
          className="mt-4 w-full rounded bg-stone-100 px-3 py-2 text-sm font-semibold text-stone-900 disabled:opacity-30"
        >
          Descartar
        </button>
      </div>
    </div>
  );
}

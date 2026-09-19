import { useState } from 'react';
import { RESOURCES, type Resource } from '@tierra-austral/engine';
import { RESOURCE_LABELS } from '../lib/terrainStyles.js';

interface ResourceChoiceModalProps {
  readonly title: string;
  /** 1 for monopoly, 2 for year of plenty. */
  readonly count: 1 | 2;
  readonly onConfirm: (chosen: Resource[]) => void;
  readonly onCancel: () => void;
}

/** Picking resources for year of plenty and monopoly. */
export function ResourceChoiceModal({
  title,
  count,
  onConfirm,
  onCancel,
}: ResourceChoiceModalProps) {
  const [chosen, setChosen] = useState<Resource[]>([]);

  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/70">
      <div className="w-80 rounded-lg border border-stone-600 bg-stone-800 p-4">
        <h2 className="text-lg font-bold">{title}</h2>
        <p className="mt-1 text-sm text-stone-300">
          Elegidos {chosen.length} de {count}
        </p>

        <ul className="mt-3 space-y-1">
          {RESOURCES.map((resource) => (
            <li key={resource}>
              <button
                type="button"
                disabled={chosen.length >= count}
                onClick={() => {
                  setChosen((current) => [...current, resource]);
                }}
                className="w-full rounded bg-stone-700 px-2 py-1 text-left text-sm hover:bg-stone-600 disabled:opacity-30"
              >
                {RESOURCE_LABELS[resource]}
              </button>
            </li>
          ))}
        </ul>

        <p className="mt-2 text-xs text-stone-400">
          {chosen.map((resource) => RESOURCE_LABELS[resource]).join(', ') || '—'}
        </p>

        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={() => {
              setChosen([]);
              onCancel();
            }}
            className="flex-1 rounded bg-stone-700 px-3 py-2 text-sm font-semibold hover:bg-stone-600"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={chosen.length !== count}
            onClick={() => {
              onConfirm(chosen);
              setChosen([]);
            }}
            className="flex-1 rounded bg-stone-100 px-3 py-2 text-sm font-semibold text-stone-900 disabled:opacity-30"
          >
            Confirmar
          </button>
        </div>
      </div>
    </div>
  );
}

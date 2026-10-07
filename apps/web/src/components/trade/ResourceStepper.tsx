import { RESOURCES, type Resource, type ResourceBundle } from '@tierra-austral/engine';
import { RESOURCE_LABELS } from '../../lib/terrainStyles.js';
import { RESOURCE_TONE } from '../ResourceGlyph.js';
import { ResourceSprite } from '../ResourceSprite.js';

export type Pick = Record<Resource, number>;

export const emptyPick = (): Pick => ({ wood: 0, brick: 0, sheep: 0, wheat: 0, ore: 0 });

export const total = (pick: Pick): number =>
  RESOURCES.reduce((sum, resource) => sum + pick[resource], 0);

export const trim = (pick: Pick): Partial<ResourceBundle> =>
  Object.fromEntries(RESOURCES.filter((resource) => pick[resource] > 0).map((r) => [r, pick[r]]));

/** "1 Madera y 2 Trigo", or nothing at all. */
export const describe = (pick: Pick): string => {
  const parts = RESOURCES.filter((resource) => pick[resource] > 0).map(
    (resource) => `${pick[resource]} ${RESOURCE_LABELS[resource]}`,
  );
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0] ?? '';
  return `${parts.slice(0, -1).join(', ')} y ${parts[parts.length - 1] ?? ''}`;
};

interface ResourceStepperProps {
  readonly label: string;
  readonly value: Pick;
  readonly onChange: (next: Pick) => void;
  /** How many of each you hold. Shown, and used as the + ceiling. */
  readonly hand?: Readonly<ResourceBundle>;
  /** Resources the other side already uses: you cannot give and ask the same thing. */
  readonly blocked?: Partial<Record<Resource, boolean>>;
  /** Per-resource note, like the bank's rate. */
  readonly note?: (resource: Resource) => string | undefined;
  readonly disabled?: (resource: Resource) => boolean;
}

/**
 * One row of counters, one per resource.
 *
 * The old editor made you select cards in your hand and then come to the
 * panel, which left it saying "Doy nada todavía — elegí cartas de tu mano":
 * an instruction about a different part of the screen. This asks for the
 * whole offer in one place, with the five resources always visible, so there
 * is nothing to discover.
 */
export function ResourceStepper({
  label,
  value,
  onChange,
  hand,
  blocked,
  note,
  disabled,
}: ResourceStepperProps) {
  const set = (resource: Resource, next: number): void => {
    const ceiling = hand === undefined ? 19 : hand[resource];
    onChange({ ...value, [resource]: Math.max(0, Math.min(next, ceiling)) });
  };

  return (
    <div>
      <p className="mb-1 text-[13px] font-semibold text-guanaco">{label}</p>
      <ul className="grid grid-cols-5 gap-1">
        {RESOURCES.map((resource) => {
          const count = value[resource];
          // A `+` that silently does nothing is worse than one that is off:
          // the ceiling has to be visible, not just enforced.
          const atCeiling = hand !== undefined && count >= hand[resource];
          const off = blocked?.[resource] === true || disabled?.(resource) === true;
          const extra = note?.(resource);
          return (
            <li
              key={resource}
              // Tinted with its own material, so a column of five reads as
              // five different things at a glance instead of five grey boxes.
              style={
                count > 0
                  ? {
                      backgroundColor: `${RESOURCE_TONE[resource]}2e`,
                      borderColor: RESOURCE_TONE[resource],
                    }
                  : { borderColor: `${RESOURCE_TONE[resource]}44` }
              }
              className={`rounded-panel border p-1 text-center ${
                count > 0 ? '' : 'bg-chapa'
              } ${off ? 'opacity-35' : ''}`}
            >
              <span className="flex justify-center">
                <ResourceSprite resource={resource} size={30} decorative />
              </span>
              <span
                className="mt-0.5 block truncate text-[11px] font-semibold"
                style={{ color: RESOURCE_TONE[resource] }}
              >
                {RESOURCE_LABELS[resource]}
              </span>
              {hand === undefined ? null : (
                <span className="block text-[11px] text-guanaco-apagado">
                  tenés {hand[resource]}
                </span>
              )}
              {extra === undefined ? null : (
                <span className="font-display block text-[11px] text-glaciar">{extra}</span>
              )}

              <span className="mt-1 flex items-center justify-center gap-1">
                <button
                  type="button"
                  disabled={off || count === 0}
                  aria-label={`Sacar ${RESOURCE_LABELS[resource]}`}
                  onClick={() => {
                    set(resource, count - 1);
                  }}
                  className="size-6 rounded-panel bg-chapa-alta font-bold disabled:opacity-30"
                >
                  −
                </button>
                <span className="font-display w-4 text-[15px] font-bold">{count}</span>
                <button
                  type="button"
                  disabled={off || atCeiling}
                  aria-label={`Agregar ${RESOURCE_LABELS[resource]}`}
                  onClick={() => {
                    set(resource, count + 1);
                  }}
                  className="size-6 rounded-panel bg-chapa-alta font-bold disabled:opacity-30"
                >
                  +
                </button>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

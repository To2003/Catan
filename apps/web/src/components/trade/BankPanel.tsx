import { useState } from 'react';
import { RESOURCES, type Resource, type ResourceBundle } from '@tierra-austral/engine';
import { RESOURCE_LABELS } from '../../lib/terrainStyles.js';
import { ResourceGlyph } from '../ResourceGlyph.js';

/** One row of five resources to pick from. */
function Row({
  label,
  chosen,
  onPick,
  mode,
  rates,
  hand,
  bank,
  give,
}: {
  readonly label: string;
  readonly chosen: Resource | undefined;
  readonly onPick: (resource: Resource) => void;
  readonly mode: 'give' | 'want';
  readonly rates: Readonly<Record<Resource, number>>;
  readonly hand: Readonly<ResourceBundle>;
  readonly bank: Readonly<ResourceBundle>;
  readonly give: Resource | undefined;
}) {
  return (
    <div>
      <p className="mb-1 text-[13px] font-semibold text-guanaco">{label}</p>
      <ul className="grid grid-cols-5 gap-1">
        {RESOURCES.map((resource) => {
          const cost = rates[resource];
          const off =
            mode === 'give' ? hand[resource] < cost : bank[resource] < 1 || resource === give;
          return (
            <li key={resource}>
              <button
                type="button"
                disabled={off}
                aria-pressed={chosen === resource}
                onClick={() => {
                  onPick(resource);
                }}
                className={`w-full rounded-panel p-1 text-center ${
                  chosen === resource ? 'bg-estepa/25 ring-1 ring-estepa' : 'bg-chapa'
                } ${off ? 'opacity-35' : 'hover:bg-chapa-alta'}`}
              >
                <span className="flex justify-center">
                  <ResourceGlyph resource={resource} size={20} title={RESOURCE_LABELS[resource]} />
                </span>
                <span className="mt-0.5 block truncate text-[11px] text-guanaco-apagado">
                  {RESOURCE_LABELS[resource]}
                </span>
                <span className="font-display block text-[12px] text-glaciar">
                  {mode === 'give' ? `${cost}:1` : `hay ${bank[resource]}`}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * Trading with the bank, in the same shape as trading with a person.
 *
 * Two rows of resources and a sentence, not two dropdowns: it is the same
 * question, so it is the same control. The rate on each one comes from the
 * engine's `maritimeRates`, which already knows about your harbours.
 */
export function BankPanel({
  rates,
  hand,
  bank,
  enabled,
  onTrade,
}: {
  /** From the engine's `maritimeRates`, which already knows your harbours. */
  readonly rates: Readonly<Record<Resource, number>>;
  readonly hand: Readonly<ResourceBundle>;
  readonly bank: Readonly<ResourceBundle>;
  readonly enabled: boolean;
  readonly onTrade: (give: Resource, want: Resource) => void;
}) {
  const [give, setGive] = useState<Resource | undefined>(undefined);
  const [want, setWant] = useState<Resource | undefined>(undefined);

  const rate = give === undefined ? undefined : rates[give];

  const why = !enabled
    ? 'Podés cambiar en tu turno, después de tirar'
    : give === undefined
      ? 'Elegí qué entregás'
      : want === undefined
        ? 'Elegí qué recibís'
        : bank[want] < 1
          ? `Al banco no le quedan ${RESOURCE_LABELS[want]}`
          : undefined;

  return (
    <div className="flex flex-col gap-3" data-tour="bank-panel">
      <Row
        label="Entregás"
        chosen={give}
        onPick={setGive}
        mode="give"
        rates={rates}
        hand={hand}
        bank={bank}
        give={give}
      />
      <Row
        label="Recibís"
        chosen={want}
        onPick={setWant}
        mode="want"
        rates={rates}
        hand={hand}
        bank={bank}
        give={give}
      />

      <p className="rounded-panel bg-chapa p-2 text-[15px]">
        {give === undefined || want === undefined ? (
          <span className="text-guanaco-apagado">Elegí los dos lados</span>
        ) : (
          <>
            <strong className="text-estepa">
              {rate} {RESOURCE_LABELS[give]}
            </strong>{' '}
            → <strong className="text-estepa">1 {RESOURCE_LABELS[want]}</strong>
          </>
        )}
      </p>

      <div>
        <button
          type="button"
          disabled={why !== undefined}
          onClick={() => {
            if (give !== undefined && want !== undefined) onTrade(give, want);
            setGive(undefined);
            setWant(undefined);
          }}
          className="min-h-[48px] w-full rounded-panel bg-estepa px-4 text-[17px] font-semibold text-noche disabled:bg-chapa-alta disabled:text-guanaco-apagado"
        >
          Cambiar
        </button>
        {why === undefined ? null : (
          <p className="mt-1 text-center text-[13px] text-guanaco-apagado">{why}</p>
        )}
      </div>
    </div>
  );
}

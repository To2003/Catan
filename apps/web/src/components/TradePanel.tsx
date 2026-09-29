import { useState } from 'react';
import { RESOURCES, type Resource } from '@tierra-austral/engine';
import { RESOURCE_LABELS } from '../lib/terrainStyles.js';

interface TradePanelProps {
  readonly rates: Record<Resource, number>;
  /** What the active player holds, to grey out what they cannot pay. */
  readonly hand: Readonly<Record<Resource, number>>;
  readonly bank: Readonly<Record<Resource, number>>;
  readonly enabled: boolean;
  readonly onTrade: (give: Resource, want: Resource) => void;
}

/**
 * Trading with the bank. The rates come from the engine
 * (`availableMaritimeRates`), so this panel only displays them — it never works
 * one out.
 */
export function TradePanel({ rates, hand, bank, enabled, onTrade }: TradePanelProps) {
  const [give, setGive] = useState<Resource>('wood');
  const [want, setWant] = useState<Resource>('ore');

  const rate = rates[give];
  const canPay = hand[give] >= rate;
  const bankHas = bank[want] >= 1;
  const valid = enabled && give !== want && canPay && bankHas;

  return (
    <div>
      <h3 className="mb-1 text-[13px] font-semibold text-guanaco">Comercio con el banco</h3>

      <ul className="mb-2 grid grid-cols-5 gap-1 text-center font-mono text-[11px]">
        {RESOURCES.map((resource) => (
          <li key={resource} className="rounded bg-stone-800 px-1 py-1">
            <div className="text-[10px] text-stone-400">{RESOURCE_LABELS[resource]}</div>
            <div>{rates[resource]}:1</div>
          </li>
        ))}
      </ul>

      <div className="flex items-center gap-2 text-xs">
        <label className="flex items-center gap-1">
          Doy
          <select
            value={give}
            onChange={(event) => {
              setGive(event.target.value as Resource);
            }}
            className="rounded bg-stone-700 px-1 py-0.5"
          >
            {RESOURCES.map((resource) => (
              <option key={resource} value={resource}>
                {rates[resource]}× {RESOURCE_LABELS[resource]}
              </option>
            ))}
          </select>
        </label>

        <label className="flex items-center gap-1">
          Pido
          <select
            value={want}
            onChange={(event) => {
              setWant(event.target.value as Resource);
            }}
            className="rounded bg-stone-700 px-1 py-0.5"
          >
            {RESOURCES.map((resource) => (
              <option key={resource} value={resource}>
                {RESOURCE_LABELS[resource]}
              </option>
            ))}
          </select>
        </label>

        <button
          type="button"
          disabled={!valid}
          onClick={() => {
            onTrade(give, want);
          }}
          className="ml-auto rounded bg-stone-100 px-2 py-1 font-semibold text-stone-900 disabled:opacity-30"
        >
          Cambiar
        </button>
      </div>

      {enabled && give !== want && !canPay ? (
        <p className="mt-1 text-[11px] text-stone-400">
          Te faltan {rate - hand[give]} {RESOURCE_LABELS[give]}
        </p>
      ) : null}
      {enabled && !bankHas ? (
        <p className="mt-1 text-[11px] text-stone-400">El banco no tiene {RESOURCE_LABELS[want]}</p>
      ) : null}
    </div>
  );
}

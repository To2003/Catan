import {
  COSTS,
  LARGEST_ARMY_MIN_KNIGHTS,
  LONGEST_ROAD_MIN_LENGTH,
  RESOURCES,
  VICTORY_POINTS,
  type LegalMoves,
  type Resource,
  type ResourceBundle,
} from '@tierra-austral/engine';
import { RESOURCE_ICONS, RESOURCE_LABELS } from '../lib/terrainStyles.js';

/**
 * What everything costs, and what everything is worth.
 *
 * Every number on it is imported from the engine's constants. Typing "2 trigo
 * + 3 mineral" into the web would work right up until somebody changed the
 * price, and then it would be a lie nobody notices — the kind of wrong that
 * only shows up when a player counts their cards and the game disagrees.
 */

/** The four things you can buy, in the order they come up in a game. */
export const BUYABLE = [
  { key: 'road', label: 'Camino', cost: COSTS.road, stock: 'roads' },
  { key: 'settlement', label: 'Pueblo', cost: COSTS.settlement, stock: 'settlements' },
  { key: 'city', label: 'Ciudad', cost: COSTS.city, stock: 'cities' },
  { key: 'devCard', label: 'Carta', cost: COSTS.devCard, stock: undefined },
] as const satisfies readonly {
  key: keyof LegalMoves['canAfford'];
  label: string;
  cost: ResourceBundle;
  stock: 'roads' | 'settlements' | 'cities' | undefined;
}[];

/** Where points come from, straight out of the engine's own table. */
export const POINT_SOURCES = [
  { label: 'Pueblo', points: VICTORY_POINTS.settlement },
  { label: 'Ciudad', points: VICTORY_POINTS.city },
  { label: `Camino más largo (${LONGEST_ROAD_MIN_LENGTH}+)`, points: VICTORY_POINTS.longestRoad },
  {
    label: `Gran ejército (${LARGEST_ARMY_MIN_KNIGHTS}+ caballeros)`,
    points: VICTORY_POINTS.largestArmy,
  },
  { label: 'Carta de punto', points: VICTORY_POINTS.vpCard },
] as const;

interface CostCardProps {
  /** Absent in the rules sheet, where there is no hand to compare against. */
  readonly canAfford?: LegalMoves['canAfford'];
  readonly stock?: {
    readonly roads: number;
    readonly settlements: number;
    readonly cities: number;
  };
}

/** A price as icons: two wheat reads faster than the word "2 trigo". */
function Price({ cost }: { readonly cost: ResourceBundle }) {
  return (
    <span className="flex flex-wrap items-center gap-0.5">
      {RESOURCES.flatMap((resource: Resource) =>
        Array.from({ length: cost[resource] }, (_, index) => (
          <span
            key={`${resource}-${index}`}
            title={RESOURCE_LABELS[resource]}
            aria-label={RESOURCE_LABELS[resource]}
            className="text-[15px] leading-none"
          >
            {RESOURCE_ICONS[resource]}
          </span>
        )),
      )}
    </span>
  );
}

export function CostCard({ canAfford, stock }: CostCardProps) {
  return (
    <div className="flex flex-col gap-4 text-[13px]">
      <section>
        <h3 className="mb-1.5 font-semibold text-guanaco">Qué cuesta construir</h3>
        <ul className="space-y-1">
          {BUYABLE.map((item) => {
            const affordable = canAfford?.[item.key];
            const left = item.stock === undefined ? undefined : stock?.[item.stock];
            return (
              <li
                key={item.key}
                className={`flex items-center gap-2 rounded-panel px-2 py-1.5 ${
                  affordable === true ? 'bg-verde/15 ring-1 ring-verde/30' : 'bg-chapa'
                } ${affordable === false ? 'opacity-45' : ''}`}
              >
                {/* A tick, not only a colour: "me alcanza" has to survive
                    somebody who does not separate green from grey. */}
                <span
                  aria-hidden
                  className={`w-3 shrink-0 text-center font-bold ${
                    affordable === true ? 'text-verde' : 'text-transparent'
                  }`}
                >
                  ✓
                </span>
                <span className="w-16 shrink-0">{item.label}</span>
                <Price cost={item.cost} />
                {left === undefined ? null : (
                  <span
                    title={`Te quedan ${left}`}
                    className="font-display ml-auto shrink-0 text-guanaco-apagado"
                  >
                    ×{left}
                  </span>
                )}
                {affordable === true ? <span className="sr-only">te alcanza</span> : null}
              </li>
            );
          })}
        </ul>
        {stock === undefined ? null : (
          // Without this, "×2" next to two resource icons reads as part of
          // the price.
          <p className="mt-1 text-[12px] text-guanaco-apagado">
            El ×N es cuántas piezas te quedan.
          </p>
        )}
      </section>

      <section>
        <h3 className="mb-1.5 font-semibold text-guanaco">Qué da puntos</h3>
        <ul className="space-y-0.5 text-guanaco-apagado">
          {POINT_SOURCES.map((source) => (
            <li key={source.label} className="flex items-baseline gap-2">
              <span className="font-display w-4 shrink-0 text-right font-bold text-estepa">
                {source.points}
              </span>
              <span>{source.label}</span>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h3 className="mb-1.5 font-semibold text-guanaco">Cambio con el banco</h3>
        <ul className="space-y-0.5 text-guanaco-apagado">
          <li>4:1 siempre</li>
          <li>3:1 con un puerto genérico</li>
          <li>2:1 en el puerto de ese recurso</li>
        </ul>
      </section>
    </div>
  );
}

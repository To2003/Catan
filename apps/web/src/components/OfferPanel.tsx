import { useState } from 'react';
import {
  RESOURCES,
  type LegalMoves,
  type PlayerId,
  type Resource,
  type ResourceBundle,
  type TradeOffer,
} from '@tierra-austral/engine';
import { RESOURCE_ICONS, RESOURCE_LABELS } from '../lib/terrainStyles.js';

interface OfferPanelProps {
  readonly you: PlayerId;
  readonly hand: Readonly<ResourceBundle>;
  /** What you picked from your hand: the cards you are putting on the table. */
  readonly give: Readonly<Partial<ResourceBundle>>;
  readonly onClearGive: () => void;
  readonly offers: readonly TradeOffer[];
  readonly moves: LegalMoves;
  readonly nameOf: (id: PlayerId) => string;
  readonly players: readonly { id: PlayerId; name: string }[];
  readonly onCreate: (
    give: Partial<ResourceBundle>,
    want: Partial<ResourceBundle>,
    to: PlayerId[] | 'all',
  ) => void;
  readonly onRespond: (offerId: string, response: 'accept' | 'reject') => void;
  readonly onCounter: (
    offerId: string,
    give: Partial<ResourceBundle>,
    want: Partial<ResourceBundle>,
  ) => void;
  readonly onConfirm: (offerId: string, withPlayer: PlayerId) => void;
  readonly onCancel: (offerId: string) => void;
}

const emptyPick = (): Record<Resource, number> => ({
  wood: 0,
  brick: 0,
  sheep: 0,
  wheat: 0,
  ore: 0,
});

const trim = (pick: Record<Resource, number>): Partial<ResourceBundle> =>
  Object.fromEntries(RESOURCES.filter((r) => pick[r] > 0).map((r) => [r, pick[r]]));

const describe = (bundle: Partial<ResourceBundle>): string => {
  const parts = RESOURCES.filter((resource) => (bundle[resource] ?? 0) > 0).map(
    (resource) => `${bundle[resource] ?? 0} ${RESOURCE_LABELS[resource]}`,
  );
  return parts.length > 0 ? parts.join(' + ') : '—';
};

/** The row of counters for what you are asking for in return. */
function WantPicker({
  want,
  setWant,
}: {
  readonly want: Record<Resource, number>;
  readonly setWant: (next: Record<Resource, number>) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1">
      {RESOURCES.map((resource) => (
        <button
          key={resource}
          type="button"
          onClick={() => {
            setWant({ ...want, [resource]: want[resource] + 1 });
          }}
          onContextMenu={(event) => {
            event.preventDefault();
            setWant({ ...want, [resource]: Math.max(0, want[resource] - 1) });
          }}
          title={`${RESOURCE_LABELS[resource]} — clic para sumar, clic derecho para restar`}
          className={`rounded-panel px-2 py-1 text-[13px] ${
            want[resource] > 0
              ? 'bg-guanaco text-noche font-semibold'
              : 'bg-chapa-alta text-guanaco'
          }`}
        >
          {RESOURCE_ICONS[resource]}
          {want[resource] > 0 ? ` ${want[resource]}` : ''}
        </button>
      ))}
    </div>
  );
}

/**
 * Offers on the table, and the form to make one.
 *
 * Who may do what with each offer comes from the view's legal moves: the panel
 * shows buttons the engine already said yes to.
 */
export function OfferPanel({
  you,
  hand,
  give,
  onClearGive,
  offers,
  moves,
  nameOf,
  players,
  onCreate,
  onRespond,
  onCounter,
  onConfirm,
  onCancel,
}: OfferPanelProps) {
  const [want, setWant] = useState(emptyPick);
  // PlayerId is a string, so 'all' needs to be its own flag rather than a
  // member of the same union.
  const [to, setTo] = useState<string>('all');
  const [counteringId, setCounteringId] = useState<string | null>(null);
  const [counterGive, setCounterGive] = useState(emptyPick);
  const [counterWant, setCounterWant] = useState(emptyPick);

  const giveTotal = RESOURCES.reduce((sum, resource) => sum + (give[resource] ?? 0), 0);
  const wantTotal = RESOURCES.reduce((sum, resource) => sum + want[resource], 0);
  const overHand = RESOURCES.some((resource) => (give[resource] ?? 0) > hand[resource]);
  const overlapping = RESOURCES.some((resource) => (give[resource] ?? 0) > 0 && want[resource] > 0);
  const canSend =
    moves.canCreateOffer && giveTotal > 0 && wantTotal > 0 && !overHand && !overlapping;

  return (
    <div>
      <h3 className="mb-1 text-[13px] font-semibold text-guanaco">Comercio con jugadores</h3>

      {moves.canCreateOffer ? (
        <div className="mb-2 rounded-panel bg-chapa p-2">
          <p className="text-[13px] text-guanaco-apagado">
            Doy{' '}
            <span className="font-semibold text-guanaco">
              {giveTotal === 0 ? 'nada todavía — elegí cartas de tu mano' : describe(give)}
            </span>
          </p>

          <p className="mt-1.5 mb-1 text-[13px] text-guanaco-apagado">Pido</p>
          <WantPicker want={want} setWant={setWant} />

          <div className="mt-2 flex items-center gap-2">
            <select
              value={to}
              onChange={(event) => {
                setTo(event.target.value);
              }}
              className="rounded-panel bg-chapa-alta px-1 py-0.5 text-[13px]"
            >
              <option value="all">A todos</option>
              {players
                .filter((player) => player.id !== you)
                .map((player) => (
                  <option key={player.id} value={player.id}>
                    A {player.name}
                  </option>
                ))}
            </select>
            <button
              type="button"
              disabled={!canSend}
              onClick={() => {
                onCreate(give, trim(want), to === 'all' ? 'all' : [to]);
                onClearGive();
                setWant(emptyPick());
              }}
              className="ml-auto rounded-panel bg-guanaco px-2 py-1 text-[13px] font-semibold text-noche disabled:opacity-30"
            >
              Ofertar
            </button>
          </div>

          {overlapping ? (
            <p className="mt-1 text-[13px] text-lenga">No podés dar y pedir el mismo recurso</p>
          ) : null}
        </div>
      ) : null}

      {offers.length === 0 ? (
        <p className="text-[13px] text-stone-500">No hay ofertas</p>
      ) : (
        <ul className="space-y-2">
          {offers.map((offer) => {
            const options = moves.offers[offer.id];
            const mine = offer.from === you;
            return (
              <li key={offer.id} className="rounded bg-stone-800 p-2 text-[13px]">
                <p>
                  <span className="font-semibold">{mine ? 'Vos' : nameOf(offer.from)}</span>
                  {offer.parentOfferId ? ' (contraoferta)' : ''}: da {describe(offer.give)} · pide{' '}
                  {describe(offer.want)}
                </p>

                <p className="mt-0.5 text-[13px] text-stone-400">
                  {Object.entries(offer.responses)
                    .map(
                      ([playerId, response]) =>
                        `${nameOf(playerId)}: ${
                          response === 'accepted'
                            ? 'aceptó'
                            : response === 'rejected'
                              ? 'rechazó'
                              : 'pensando'
                        }`,
                    )
                    .join(' · ')}
                </p>

                <div className="mt-1 flex flex-wrap gap-1">
                  {options?.canAccept ? (
                    <button
                      type="button"
                      onClick={() => {
                        onRespond(offer.id, 'accept');
                      }}
                      className="rounded bg-verde px-2 py-0.5 font-semibold text-stone-900"
                    >
                      Aceptar
                    </button>
                  ) : null}
                  {options?.canReject ? (
                    <button
                      type="button"
                      onClick={() => {
                        onRespond(offer.id, 'reject');
                      }}
                      className="rounded bg-stone-700 px-2 py-0.5 font-semibold"
                    >
                      Rechazar
                    </button>
                  ) : null}
                  {options?.canCounter ? (
                    <button
                      type="button"
                      onClick={() => {
                        setCounteringId(counteringId === offer.id ? null : offer.id);
                        setCounterGive(emptyPick());
                        setCounterWant(emptyPick());
                      }}
                      className="rounded bg-stone-700 px-2 py-0.5 font-semibold"
                    >
                      Contraofertar
                    </button>
                  ) : null}
                  {(options?.confirmWith ?? []).map((withPlayer) => (
                    <button
                      key={withPlayer}
                      type="button"
                      onClick={() => {
                        onConfirm(offer.id, withPlayer);
                      }}
                      className="rounded bg-stone-100 px-2 py-0.5 font-semibold text-stone-900"
                    >
                      Cerrar con {nameOf(withPlayer)}
                    </button>
                  ))}
                  {options?.canCancel ? (
                    <button
                      type="button"
                      onClick={() => {
                        onCancel(offer.id);
                      }}
                      className="rounded bg-stone-700 px-2 py-0.5"
                    >
                      Cancelar
                    </button>
                  ) : null}
                </div>

                {counteringId === offer.id ? (
                  <div className="mt-2 border-t border-stone-700 pt-2">
                    <p className="mb-1 text-[13px] text-guanaco-apagado">Ofrezco</p>
                    <WantPicker want={counterGive} setWant={setCounterGive} />
                    <p className="mt-1.5 mb-1 text-[13px] text-guanaco-apagado">Y pido</p>
                    <WantPicker want={counterWant} setWant={setCounterWant} />
                    <button
                      type="button"
                      onClick={() => {
                        onCounter(offer.id, trim(counterGive), trim(counterWant));
                        setCounteringId(null);
                      }}
                      className="mt-1 w-full rounded bg-stone-100 px-2 py-1 font-semibold text-stone-900"
                    >
                      Mandar contraoferta
                    </button>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

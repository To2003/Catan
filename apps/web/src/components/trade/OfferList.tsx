import type { LegalMoves, PlayerId, ResourceBundle, TradeOffer } from '@tierra-austral/engine';
import { RESOURCES } from '@tierra-austral/engine';
import { RESOURCE_LABELS } from '../../lib/terrainStyles.js';
import { PLAYER_COLORS } from '../../lib/playerColors.js';

/** A bundle in words: "1 Madera y 2 Trigo". */
export const say = (bundle: Partial<ResourceBundle>): string => {
  const parts = RESOURCES.filter((resource) => (bundle[resource] ?? 0) > 0).map(
    (resource) => `${bundle[resource] ?? 0} ${RESOURCE_LABELS[resource]}`,
  );
  if (parts.length === 0) return 'nada';
  if (parts.length === 1) return parts[0] ?? '';
  return `${parts.slice(0, -1).join(', ')} y ${parts[parts.length - 1] ?? ''}`;
};

/** Where each person stands on an offer, as a word and not only a colour. */
function Answer({
  name,
  color,
  response,
}: {
  readonly name: string;
  readonly color: string;
  readonly response: 'pending' | 'accepted' | 'rejected';
}) {
  const skin =
    response === 'accepted'
      ? 'bg-verde/25 text-verde ring-verde/40'
      : response === 'rejected'
        ? 'bg-lenga/25 text-lenga ring-lenga/40'
        : 'bg-chapa-alta text-guanaco-apagado ring-transparent';
  const word =
    response === 'accepted' ? '✓ aceptó' : response === 'rejected' ? '✗ rechazó' : 'pensando';

  return (
    <span
      className={`flex items-center gap-1 rounded-panel px-1.5 py-0.5 text-[12px] ring-1 ${skin}`}
    >
      <span
        aria-hidden
        className="inline-block size-2 rounded-full"
        style={{ backgroundColor: color }}
      />
      {name}: {word}
    </span>
  );
}

interface OfferListProps {
  readonly you: PlayerId;
  readonly offers: readonly TradeOffer[];
  readonly moves: LegalMoves;
  readonly nameOf: (id: PlayerId) => string;
  readonly colorOf: (id: PlayerId) => string;
  readonly onRespond: (offerId: string, response: 'accept' | 'reject') => void;
  readonly onConfirm: (offerId: string, withPlayer: PlayerId) => void;
  readonly onCancel: (offerId: string) => void;
  readonly onCounter: (offer: TradeOffer) => void;
  /** Only the ones aimed at you, or only your own. */
  readonly mine: boolean;
}

/**
 * Offers on the table.
 *
 * Split in two on purpose: what you proposed and what somebody is proposing
 * to you are different problems. Yours is a status board — who has answered
 * — and theirs is a decision, so theirs gets the big buttons and goes above
 * everything else instead of inside a tab.
 */
export function OfferList({
  you,
  offers,
  moves,
  nameOf,
  colorOf,
  onRespond,
  onConfirm,
  onCancel,
  onCounter,
  mine,
}: OfferListProps) {
  const shown = offers.filter((offer) => (offer.from === you) === mine);
  if (shown.length === 0) return null;

  return (
    <ul className="space-y-2">
      {shown.map((offer) => {
        const options = moves.offers[offer.id];
        return (
          <li
            key={offer.id}
            className={`rounded-panel p-2 ${
              mine ? 'bg-chapa' : 'bg-estepa/15 ring-1 ring-estepa/50'
            }`}
          >
            <p className="text-[14px] leading-snug">
              <strong style={{ color: colorOf(offer.from) }}>
                {mine ? 'Vos' : nameOf(offer.from)}
              </strong>
              {offer.parentOfferId === undefined ? '' : ' (contraoferta)'}: da{' '}
              <strong className="text-guanaco">{say(offer.give)}</strong> y pide{' '}
              <strong className="text-guanaco">{say(offer.want)}</strong>
            </p>

            <div className="mt-1.5 flex flex-wrap gap-1">
              {Object.entries(offer.responses).map(([playerId, response]) => (
                <Answer
                  key={playerId}
                  name={nameOf(playerId)}
                  color={colorOf(playerId)}
                  response={response}
                />
              ))}
            </div>

            <div className="mt-2 flex flex-wrap gap-1.5">
              {options?.canAccept === true ? (
                <button
                  type="button"
                  onClick={() => {
                    onRespond(offer.id, 'accept');
                  }}
                  className="min-h-[40px] flex-1 rounded-panel bg-verde px-3 text-[15px] font-semibold text-noche"
                >
                  Aceptar
                </button>
              ) : null}
              {options?.canReject === true ? (
                <button
                  type="button"
                  onClick={() => {
                    onRespond(offer.id, 'reject');
                  }}
                  className="min-h-[40px] flex-1 rounded-panel bg-chapa-alta px-3 text-[15px] font-semibold"
                >
                  Rechazar
                </button>
              ) : null}
              {options?.canCounter === true ? (
                <button
                  type="button"
                  onClick={() => {
                    onCounter(offer);
                  }}
                  className="min-h-[40px] flex-1 rounded-panel bg-chapa-alta px-3 text-[15px] font-semibold"
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
                  className="min-h-[40px] flex-1 rounded-panel bg-guanaco px-3 text-[15px] font-semibold text-noche"
                >
                  Cerrar con {nameOf(withPlayer)}
                </button>
              ))}
              {options?.canCancel === true ? (
                <button
                  type="button"
                  onClick={() => {
                    onCancel(offer.id);
                  }}
                  className="rounded-panel bg-chapa-alta px-3 py-2 text-[13px] font-semibold"
                >
                  Cancelar
                </button>
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export { PLAYER_COLORS };

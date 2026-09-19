import type { DevCard, LegalMoves } from '@tierra-austral/engine';
import { DEV_CARD_LABELS } from '../lib/eventText.js';
import { ERROR_TEXT } from '../lib/errorText.js';

interface DevCardPanelProps {
  /** The hand, from the view's own player. */
  readonly hand: readonly DevCard[];
  readonly deckLeft: number;
  /** Worked out by the engine, wherever it runs: the server, or the hot-seat. */
  readonly moves: LegalMoves;
  readonly onBuy: () => void;
  readonly onPlay: (card: DevCard) => void;
}

const ORDER: readonly DevCard[] = ['knight', 'roadBuilding', 'yearOfPlenty', 'monopoly', 'vp'];

export function DevCardPanel({ hand, deckLeft, moves, onBuy, onPlay }: DevCardPanelProps) {
  const reasonNotToPlay = (card: DevCard): string | undefined => {
    const option = moves.devCardOptions[card];
    if (option.playable) return undefined;
    if (card === 'vp') return 'Los PV no se juegan: cuentan solos';
    return option.reason === undefined ? 'No se puede ahora' : ERROR_TEXT[option.reason];
  };

  return (
    <div>
      <div className="mb-1 flex items-center gap-2">
        <h2 className="text-xs font-bold tracking-widest text-stone-400 uppercase">Cartas</h2>
        <button
          type="button"
          disabled={!moves.canBuyDevCard}
          onClick={onBuy}
          className="ml-auto rounded bg-stone-100 px-2 py-0.5 text-xs font-semibold text-stone-900 disabled:opacity-30"
        >
          Comprar ({deckLeft})
        </button>
      </div>

      {hand.length === 0 ? (
        <p className="text-xs text-stone-500">Sin cartas</p>
      ) : (
        <ul className="space-y-1">
          {ORDER.filter((card) => hand.includes(card)).map((card) => {
            const count = hand.filter((held) => held === card).length;
            const reason = reasonNotToPlay(card);
            return (
              <li key={card} className="flex items-center gap-2 text-xs">
                <span>
                  {DEV_CARD_LABELS[card]} ×{count}
                </span>
                <button
                  type="button"
                  disabled={reason !== undefined}
                  title={reason}
                  onClick={() => {
                    onPlay(card);
                  }}
                  className="ml-auto rounded bg-stone-700 px-2 py-0.5 font-semibold hover:bg-stone-600 disabled:opacity-30"
                >
                  Jugar
                </button>
                {reason ? <span className="w-28 text-[10px] text-stone-500">{reason}</span> : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

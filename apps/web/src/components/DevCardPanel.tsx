import type { DevCard, LegalMoves } from '@tierra-austral/engine';
import { ERROR_TEXT } from '../lib/errorText.js';
import { DevCardFace } from './cards/DevCardFace.js';

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
        <h3 className="text-[13px] font-semibold text-guanaco">Cartas de desarrollo</h3>
        <button
          type="button"
          disabled={!moves.canBuyDevCard}
          onClick={onBuy}
          className="ml-auto rounded-panel bg-guanaco px-2 py-0.5 text-[13px] font-semibold text-noche disabled:opacity-30"
        >
          Comprar ({deckLeft})
        </button>
      </div>

      {hand.length === 0 ? (
        <p className="text-[13px] text-guanaco-apagado">Todavía no compraste ninguna</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {ORDER.filter((card) => hand.includes(card)).map((card) => {
            const reason = reasonNotToPlay(card);
            return (
              <DevCardFace
                key={card}
                card={card}
                count={hand.filter((held) => held === card).length}
                disabled={reason !== undefined}
                reason={reason}
                onPlay={() => {
                  onPlay(card);
                }}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

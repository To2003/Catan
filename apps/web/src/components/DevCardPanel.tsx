import {
  validateAction,
  type Action,
  type DevCard,
  type PlayerId,
  type ReadonlyGameState,
} from '@tierra-austral/engine';
import { DEV_CARD_LABELS } from '../lib/eventText.js';
import { ERROR_TEXT } from '../lib/errorText.js';

interface DevCardPanelProps {
  readonly game: ReadonlyGameState;
  readonly playerId: PlayerId;
  readonly canBuy: boolean;
  readonly onBuy: () => void;
  readonly onPlay: (card: DevCard) => void;
}

const ORDER: readonly DevCard[] = ['knight', 'roadBuilding', 'yearOfPlenty', 'monopoly', 'vp'];

/** The action a card is played with. Victory cards have none: they are never played. */
const PLAY_ACTION: Record<DevCard, Action | undefined> = {
  knight: { type: 'playKnight' },
  roadBuilding: { type: 'playRoadBuilding' },
  // The resources are chosen in a modal; this is only for asking whether the
  // card could be played at all, so any valid pair does.
  yearOfPlenty: { type: 'playYearOfPlenty', resources: ['wood', 'wood'] },
  monopoly: { type: 'playMonopoly', resource: 'wood' },
  vp: undefined,
};

/**
 * The hand of development cards, with the reason a card cannot be played right
 * now. The reason is whatever the engine says: the panel asks validate rather
 * than restating any rule.
 */
export function DevCardPanel({ game, playerId, canBuy, onBuy, onPlay }: DevCardPanelProps) {
  const player = game.players.find((candidate) => candidate.id === playerId);
  const hand = player?.devCards ?? [];

  const reasonNotToPlay = (card: DevCard): string | undefined => {
    const action = PLAY_ACTION[card];
    if (!action) return 'Los PV no se juegan: cuentan solos';
    const error = validateAction(game, playerId, action);
    return error === null ? undefined : ERROR_TEXT[error];
  };

  return (
    <div>
      <div className="mb-1 flex items-center gap-2">
        <h2 className="text-xs font-bold tracking-widest text-stone-400 uppercase">Cartas</h2>
        <button
          type="button"
          disabled={!canBuy}
          onClick={onBuy}
          className="ml-auto rounded bg-stone-100 px-2 py-0.5 text-xs font-semibold text-stone-900 disabled:opacity-30"
        >
          Comprar ({game.devDeck.length})
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

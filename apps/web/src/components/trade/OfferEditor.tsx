import { useEffect, useState } from 'react';
import {
  COSTS,
  RESOURCES,
  type LegalMoves,
  type PlayerId,
  type PlayerView,
  type ResourceBundle,
} from '@tierra-austral/engine';
import { PLAYER_COLORS } from '../../lib/playerColors.js';
import { ResourceStepper, describe, emptyPick, total, trim, type Pick } from './ResourceStepper.js';

interface OfferEditorProps {
  readonly view: PlayerView;
  readonly onSend: (
    give: Partial<ResourceBundle>,
    want: Partial<ResourceBundle>,
    to: PlayerId[] | 'all',
  ) => void;
  readonly onClose: () => void;
  /**
   * A counteroffer: the sides already swapped and filled in, plus the offer
   * it answers. That id matters — a counteroffer is allowed by a different
   * rule than a fresh offer.
   */
  readonly preset?: {
    readonly give: Pick;
    readonly want: Pick;
    readonly to: PlayerId;
    readonly offerId: string;
  };
  readonly title?: string;
}

const SHORTCUTS = [
  { key: 'road', label: 'un camino', cost: COSTS.road },
  { key: 'settlement', label: 'un pueblo', cost: COSTS.settlement },
  { key: 'city', label: 'una ciudad', cost: COSTS.city },
  { key: 'devCard', label: 'una carta', cost: COSTS.devCard },
] as const;

/**
 * Building an offer, start to finish, in one place.
 *
 * The old flow asked you to select cards in your hand first and then come
 * here, which is why the panel used to say "Doy nada todavía — elegí cartas
 * de tu mano": an instruction about somewhere else on the screen. Nothing is
 * selected anywhere now; both sides are counters, and the sentence under
 * them says in words what you are about to propose.
 *
 * Disabling the same resource on the opposite side is a convenience and not
 * a rule — the engine rejects give-and-ask-the-same either way, and there is
 * a test for that.
 */
export function OfferEditor({ view, onSend, onClose, preset, title }: OfferEditorProps) {
  const [give, setGive] = useState<Pick>(() => preset?.give ?? emptyPick());
  const [want, setWant] = useState<Pick>(() => preset?.want ?? emptyPick());
  const [to, setTo] = useState<string>(preset?.to ?? 'all');

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  const blockedInWant = Object.fromEntries(
    RESOURCES.map((resource) => [resource, give[resource] > 0]),
  );
  const blockedInGive = Object.fromEntries(
    RESOURCES.map((resource) => [resource, want[resource] > 0]),
  );

  /**
   * Whether the engine would take this, and why not.
   *
   * **A counteroffer is not an offer.** It is answered on somebody else's
   * turn — that is the whole point of it — so asking `canCreateOffer` said
   * "podés ofertar en tu turno" and left the button dead for exactly the
   * people who were trying to use it. The permission for a counteroffer is
   * `canCounter` on the offer being answered.
   */
  const allowed =
    preset === undefined
      ? view.legalMoves.canCreateOffer
      : (view.legalMoves.offers[preset.offerId]?.canCounter ?? false);

  const why = !allowed
    ? preset === undefined
      ? reasonFromMoves(view.legalMoves)
      : 'Esa oferta ya no está abierta'
    : total(give) === 0
      ? 'Elegí qué das'
      : total(want) === 0
        ? 'Elegí qué pedís'
        : undefined;

  /** Fills "pedís" with exactly what the hand is short of for one thing. */
  const askFor = (cost: ResourceBundle): void => {
    const next = emptyPick();
    for (const resource of RESOURCES) {
      next[resource] = Math.max(0, cost[resource] - view.me.resources[resource]);
    }
    setWant(next);
  };

  const others = view.players.filter((player) => player.id !== view.you);

  return (
    <div className="flex flex-col gap-3" data-tour="offer-editor">
      {title === undefined ? null : (
        <h3 className="font-display text-[15px] text-guanaco">{title}</h3>
      )}

      <ResourceStepper
        label="Vos das"
        value={give}
        onChange={setGive}
        hand={view.me.resources}
        blocked={blockedInGive}
      />
      <ResourceStepper label="Vos pedís" value={want} onChange={setWant} blocked={blockedInWant} />

      <div>
        <p className="mb-1 text-[13px] text-guanaco-apagado">Pedir lo que me falta para…</p>
        <div className="flex flex-wrap gap-1">
          {SHORTCUTS.map((shortcut) => (
            <button
              key={shortcut.key}
              type="button"
              onClick={() => {
                askFor(shortcut.cost);
              }}
              className="rounded-panel bg-chapa px-2 py-1 text-[13px] hover:bg-chapa-alta"
            >
              {shortcut.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-1 text-[13px] text-guanaco-apagado">A quién</p>
        <div className="flex flex-wrap gap-1">
          <button
            type="button"
            aria-pressed={to === 'all'}
            onClick={() => {
              setTo('all');
            }}
            className={`rounded-panel px-3 py-1 text-[13px] font-semibold ${
              to === 'all' ? 'bg-guanaco text-noche' : 'bg-chapa text-guanaco-apagado'
            }`}
          >
            Todos
          </button>
          {others.map((player) => (
            <button
              key={player.id}
              type="button"
              disabled={player.hasLeft}
              aria-pressed={to === player.id}
              title={player.hasLeft ? `${player.name} abandonó la partida` : undefined}
              onClick={() => {
                setTo(player.id);
              }}
              className={`rounded-panel px-3 py-1 text-[13px] font-semibold disabled:opacity-35 ${
                to === player.id ? 'text-noche' : 'bg-chapa text-guanaco-apagado'
              }`}
              style={to === player.id ? { backgroundColor: PLAYER_COLORS[player.color] } : {}}
            >
              {player.name}
              {player.hasLeft ? ' · abandonó' : ''}
            </button>
          ))}
        </div>
      </div>

      {/* The whole offer in a sentence, because two rows of counters are a
          form and this is what you are actually proposing. */}
      <p className="rounded-panel bg-chapa p-2 text-[15px] leading-snug">
        {total(give) === 0 && total(want) === 0 ? (
          <span className="text-guanaco-apagado">Armá tu oferta con los + y −</span>
        ) : (
          <>
            Das <strong className="text-estepa">{describe(give) || '…'}</strong> y pedís{' '}
            <strong className="text-estepa">{describe(want) || '…'}</strong>
          </>
        )}
      </p>

      <div>
        <button
          type="button"
          disabled={why !== undefined}
          onClick={() => {
            onSend(trim(give), trim(want), to === 'all' ? 'all' : [to]);
            setGive(emptyPick());
            setWant(emptyPick());
          }}
          className="min-h-[48px] w-full rounded-panel bg-estepa px-4 text-[17px] font-semibold text-noche disabled:bg-chapa-alta disabled:text-guanaco-apagado"
        >
          Ofertar
        </button>
        {why === undefined ? null : (
          <p className="mt-1 text-center text-[13px] text-guanaco-apagado">{why}</p>
        )}
      </div>
    </div>
  );
}

/**
 * Why the engine will not take an offer right now.
 *
 * `canCreateOffer` is a single boolean, so the reason behind it has to be
 * reconstructed from the rest of the moves — but only from the moves, never
 * from a rule written here.
 */
const reasonFromMoves = (moves: LegalMoves): string => {
  const mine = Object.values(moves.offers).filter((offer) => offer.canCancel).length;
  if (mine >= 3) return 'Ya tenés 3 ofertas abiertas';
  if (!moves.canEndTurn) return 'Podés ofertar en tu turno, después de tirar';
  return 'No se puede ofertar ahora';
};

export type { Pick };
export { emptyPick } from './ResourceStepper.js';

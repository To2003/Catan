import type { PlayerId, PlayerView } from '@tierra-austral/engine';

interface TurnBannerProps {
  readonly view: PlayerView;
  readonly nameOf: (playerId: PlayerId) => string;
}

/**
 * One line saying whose turn it is and what the game is waiting for.
 *
 * Everything it says comes from the phase and the legal moves; it is the same
 * information the buttons carry, written as a sentence for the people who are
 * not the ones being asked to act.
 */
export const waitingFor = (view: PlayerView, nameOf: (playerId: PlayerId) => string): string => {
  const mine = view.currentPlayer === view.you;
  const who = mine ? 'Vos' : nameOf(view.currentPlayer);
  const phase = view.phase;

  switch (phase.kind) {
    case 'setup':
      return phase.step === 'settlement'
        ? `${who} ${mine ? 'ponés' : 'pone'} un asentamiento`
        : `${who} ${mine ? 'ponés' : 'pone'} un camino`;

    case 'preRoll':
      return mine ? 'Tirá los dados' : `Espera que ${who} tire los dados`;

    case 'discard': {
      const owed = view.legalMoves.discardOwed;
      if (owed !== undefined) return `Descartá ${owed} cartas`;
      const names = Object.entries(phase.pending)
        .map(([playerId, count]) => `${nameOf(playerId)} (${count})`)
        .join(', ');
      return `Esperando el descarte de ${names}`;
    }

    case 'moveRobber':
      return mine ? 'Elegí dónde poner el ladrón' : `${who} mueve el ladrón`;

    case 'steal':
      return mine ? 'Elegí a quién robarle' : `${who} elige a quién robarle`;

    case 'roadBuilding':
      return mine
        ? `Poné ${phase.remaining} camino${phase.remaining === 1 ? '' : 's'} gratis`
        : `${who} pone caminos gratis`;

    case 'main':
      return mine ? 'Construí, comerciá o terminá el turno' : `Juega ${who}`;

    case 'gameOver':
      return `Ganó ${nameOf(phase.winner)}`;

    default:
      return who;
  }
};

export function TurnBanner({ view, nameOf }: TurnBannerProps) {
  const mine = view.currentPlayer === view.you;
  const owedByMe = view.legalMoves.discardOwed !== undefined;
  const urgent = mine || owedByMe;

  return (
    <div
      className={`flex items-center gap-2 px-4 py-1.5 text-sm ${
        urgent ? 'bg-amarillo font-semibold text-stone-900' : 'bg-stone-800 text-stone-300'
      }`}
    >
      <span aria-hidden>{urgent ? '👉' : '⏳'}</span>
      <span>{waitingFor(view, nameOf)}</span>
      {view.phase.kind === 'discard' ? (
        <span className="ml-auto flex gap-2 text-xs">
          {view.players.map((player) => {
            const owes = view.phase.kind === 'discard' ? view.phase.pending[player.id] : undefined;
            return (
              <span
                key={player.id}
                className={owes === undefined ? 'opacity-60' : 'font-bold'}
                title={owes === undefined ? 'listo' : `debe ${owes}`}
              >
                {player.name}: {owes === undefined ? 'listo ✓' : `descartando (${owes})`}
              </span>
            );
          })}
        </span>
      ) : null}
    </div>
  );
}

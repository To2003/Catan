import type { PlayerId } from '@tierra-austral/engine';
import type { RoomState } from '../store/gameStore.js';

interface RestartVoteProps {
  readonly room: RoomState;
  readonly you: PlayerId;
  readonly nameOf: (playerId: PlayerId) => string;
  readonly onPropose: () => void;
  readonly onVote: (approve: boolean) => void;
  /** Ticks once a second so the countdown moves without reading the clock in render. */
  readonly now: number;
}

/**
 * Starting the game over, mid-game.
 *
 * It takes everybody who is actually connected: somebody who dropped cannot
 * hold the room hostage, and the panel says how many are being asked. The game
 * stays playable while the vote is open — this is a question, not a pause.
 */
export function RestartVote({ room, you, nameOf, onPropose, onVote, now }: RestartVoteProps) {
  const vote = room.restartVote;

  if (!vote) {
    const until = room.restartCooldown[you] ?? 0;
    const waiting = Math.max(0, Math.ceil((until - now) / 1000));
    return (
      <button
        type="button"
        disabled={waiting > 0}
        onClick={onPropose}
        title={
          waiting > 0
            ? `Propusiste hace poco: podés volver a proponer en ${Math.ceil(waiting / 60)} min`
            : 'Proponer empezar de nuevo, con otro tablero'
        }
        className="w-full rounded-panel bg-chapa px-2 py-1 text-xs font-semibold text-guanaco-apagado hover:bg-chapa-alta disabled:opacity-40"
      >
        {waiting > 0 ? `Reiniciar (esperá ${Math.ceil(waiting / 60)} min)` : 'Proponer reiniciar'}
      </button>
    );
  }

  const seconds = Math.max(0, Math.ceil((vote.deadline - now) / 1000));
  const mine = vote.votes[you];

  return (
    <div className="rounded-panel border border-estepa/60 bg-chapa p-2">
      <p className="text-[13px] font-semibold">{nameOf(vote.by)} propone empezar de nuevo</p>
      <p className="text-[11px] text-guanaco-apagado">
        Hacen falta los {vote.needed.length} que están conectados · quedan {seconds}s
      </p>

      <ul className="mt-1 space-y-0.5 text-[11px]">
        {vote.needed.map((playerId) => {
          const answer = vote.votes[playerId];
          return (
            <li key={playerId} className="flex gap-2">
              <span>{nameOf(playerId)}</span>
              <span
                className={
                  answer === 'yes'
                    ? 'text-verde'
                    : answer === 'no'
                      ? 'text-lenga'
                      : 'text-guanaco-apagado'
                }
              >
                {answer === 'yes' ? 'a favor' : answer === 'no' ? 'en contra' : 'sin votar'}
              </span>
            </li>
          );
        })}
      </ul>

      {mine === undefined ? (
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            onClick={() => {
              onVote(true);
            }}
            className="flex-1 rounded-panel bg-verde px-2 py-1 text-xs font-semibold"
          >
            Dale
          </button>
          <button
            type="button"
            onClick={() => {
              onVote(false);
            }}
            className="flex-1 rounded-panel bg-lenga px-2 py-1 text-xs font-semibold"
          >
            No
          </button>
        </div>
      ) : (
        <p className="mt-1 text-[11px] text-guanaco-apagado">
          Votaste {mine === 'yes' ? 'a favor' : 'en contra'}
        </p>
      )}
    </div>
  );
}

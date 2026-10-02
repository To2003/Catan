import { useEffect, useRef, useState } from 'react';
import type { LegalMoves, Phase } from '@tierra-austral/engine';
import { SETTINGS, settingEnabled } from './GameSettings.js';

const PIPS: Record<number, readonly [number, number][]> = {
  1: [[1, 1]],
  2: [
    [0, 0],
    [2, 2],
  ],
  3: [
    [0, 0],
    [1, 1],
    [2, 2],
  ],
  4: [
    [0, 0],
    [0, 2],
    [2, 0],
    [2, 2],
  ],
  5: [
    [0, 0],
    [0, 2],
    [1, 1],
    [2, 0],
    [2, 2],
  ],
  6: [
    [0, 0],
    [0, 1],
    [0, 2],
    [2, 0],
    [2, 1],
    [2, 2],
  ],
};

/**
 * One die, big enough to read across a table.
 *
 * Enamel, like the number tokens: cream face, dark ring, pips in the night
 * blue. Before the first roll the faces are empty, which says "nothing has
 * happened yet" without a sentence.
 */
export function Die({ value, size = 96 }: { readonly value?: number; readonly size?: number }) {
  return (
    <span
      role="img"
      aria-label={value === undefined ? 'Dado sin tirar' : `Dado: ${value}`}
      style={{ width: size, height: size }}
      className="grid shrink-0 grid-cols-3 grid-rows-3 gap-[6%] rounded-[18%] bg-[#efe6d3] p-[12%] ring-2 ring-[#1b2730] ring-inset"
    >
      {Array.from({ length: 9 }, (_, index) => {
        const row = Math.floor(index / 3);
        const column = index % 3;
        const on =
          value !== undefined && (PIPS[value] ?? []).some(([r, c]) => r === row && c === column);
        return (
          <span
            key={index}
            aria-hidden
            className={`rounded-full ${on ? 'bg-noche' : ''}`}
            style={on ? { boxShadow: 'inset 0 -1px 1px rgba(255,255,255,.25)' } : {}}
          />
        );
      })}
    </span>
  );
}

interface DiceDockProps {
  readonly dice: readonly [number, number] | undefined;
  /** Counts the rolls, so the same two numbers twice still tumble. */
  readonly roll: number;
  readonly phase: Phase['kind'];
  readonly moves: LegalMoves;
  readonly onRoll: () => void;
  readonly onEndTurn: () => void;
  /** What the game is asking for during the opening placement. */
  readonly setupHint: string;
  /** Off while something else is clearly more urgent, like owing a discard. */
  readonly urgent: boolean;
}

const BUTTON =
  'flex min-h-[56px] w-full items-center justify-center rounded-panel px-5 text-[20px] font-semibold transition-colors';

/**
 * The dice and the one big button, anchored to the bottom-left of the board.
 *
 * They used to be a chip in the top bar, which is the furthest corner of the
 * screen from where your eyes are. Down here they are next to the board and
 * next to your hand, and the last roll stays on screen instead of being
 * something you had to catch while it happened.
 *
 * One big button, and only one: whichever the phase is actually asking for.
 * During the placement there is no button at all, because the answer is a
 * click on the board.
 */
export function DiceDock({
  dice,
  roll,
  phase,
  moves,
  onRoll,
  onEndTurn,
  setupHint,
  urgent,
}: DiceDockProps) {
  /**
   * Whether the "you can still build something" nudge has already been shown
   * this turn. Once per turn: twice is nagging.
   */
  const [warned, setWarned] = useState(false);
  const [asking, setAsking] = useState(false);
  const lastRoll = useRef(roll);
  useEffect(() => {
    if (lastRoll.current === roll) return;
    lastRoll.current = roll;
    setWarned(false);
    setAsking(false);
  }, [roll]);

  const canRoll = moves.canRoll;
  const canEnd = moves.canEndTurn;
  const affordable = (['road', 'settlement', 'city', 'devCard'] as const).filter(
    (key) => moves.canAfford[key],
  );
  const LABEL = {
    road: 'un camino',
    settlement: 'un pueblo',
    city: 'una ciudad',
    devCard: 'una carta',
  };

  const endTurn = (): void => {
    if (settingEnabled(SETTINGS.confirmEndTurn) && !warned && affordable.length > 0) {
      setAsking(true);
      setWarned(true);
      return;
    }
    setAsking(false);
    onEndTurn();
  };

  return (
    <div
      data-tour="dice-dock"
      className="pointer-events-auto flex w-full flex-col gap-2 rounded-panel bg-chapa/80 p-3 backdrop-blur-sm lg:w-[230px]"
    >
      <div className="flex items-center gap-2">
        {/* Clicking the dice rolls them, because that is what dice are for. */}
        <button
          key={roll}
          type="button"
          disabled={!canRoll}
          onClick={onRoll}
          aria-label={
            dice === undefined
              ? 'Tirar los dados'
              : `Último tiro: ${dice[0]} y ${dice[1]}, total ${dice[0] + dice[1]}`
          }
          className={`dice-tumble flex items-center gap-1.5 rounded-panel ${
            canRoll ? 'cursor-pointer hover:brightness-110' : 'cursor-default'
          }`}
        >
          <Die {...(dice === undefined ? {} : { value: dice[0] })} size={54} />
          <Die {...(dice === undefined ? {} : { value: dice[1] })} size={54} />
        </button>
        <span
          aria-hidden
          className="font-display ml-auto text-[40px] leading-none font-bold text-guanaco"
        >
          {dice === undefined ? '—' : dice[0] + dice[1]}
        </span>
      </div>

      {phase === 'setup' ? (
        <p className="text-[14px] leading-snug text-guanaco-apagado">{setupHint}</p>
      ) : phase === 'preRoll' ? (
        <button
          type="button"
          data-tour="main-action"
          disabled={!canRoll}
          onClick={onRoll}
          className={`${BUTTON} bg-estepa text-noche hover:bg-estepa/85 disabled:bg-chapa-alta disabled:text-guanaco-apagado ${
            canRoll && urgent ? 'pulse-soft' : ''
          }`}
        >
          Tirar dados
        </button>
      ) : phase === 'main' ? (
        <>
          <button
            type="button"
            data-tour="main-action"
            disabled={!canEnd}
            onClick={endTurn}
            className={`${BUTTON} bg-guanaco text-noche hover:bg-guanaco/85 disabled:bg-chapa-alta disabled:text-guanaco-apagado ${
              canEnd && urgent && affordable.length === 0 ? 'pulse-soft' : ''
            }`}
          >
            Terminar turno
          </button>

          {asking ? (
            <div className="rounded-panel bg-estepa/15 p-2 text-[13px] ring-1 ring-estepa/40">
              <p className="text-guanaco">
                Todavía te alcanza para {LABEL[affordable[0] ?? 'road']}. ¿Terminás igual?
              </p>
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setAsking(false);
                  }}
                  className="flex-1 rounded-panel bg-chapa-alta px-2 py-1.5 font-semibold"
                >
                  Me quedo
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAsking(false);
                    onEndTurn();
                  }}
                  className="flex-1 rounded-panel bg-guanaco px-2 py-1.5 font-semibold text-noche"
                >
                  Terminar
                </button>
              </div>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

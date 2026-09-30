import { useMemo } from 'react';
import {
  MIN_PLAYERS,
  generateBoard,
  type BoardMode,
  type PlayerColor,
} from '@tierra-austral/engine';
import { useGame } from '../store/gameStore.js';
import { Chat } from '../components/Chat.js';
import { RulesButton } from '../components/Rules.js';
import { PLAYER_COLORS, PLAYER_COLOR_LABELS } from '../lib/playerColors.js';
import { Board } from '../components/board/Board.js';

const COLORS: readonly PlayerColor[] = ['celeste', 'bordo', 'verde', 'amarillo'];

/** The three ways a board can come out, in the words the lobby uses. */
const MODES: readonly { mode: BoardMode; label: string; blurb: string }[] = [
  {
    mode: 'random',
    label: 'Aleatorio',
    blurb: 'Como sale. Lo único que se respeta es que no haya dos rojos pegados.',
  },
  {
    mode: 'classic',
    label: 'Clásico',
    blurb: 'El tablero fijo de siempre: mismos terrenos, mismos números, mismos puertos.',
  },
  {
    mode: 'balanced',
    label: 'Balanceado',
    blurb:
      'Al azar, pero sin números repetidos pegados, sin tres terrenos iguales en fila y con los recursos parejos.',
  },
];

/** Colours, ready marks and the host's start button. */
export function LobbyScreen() {
  const room = useGame((state) => state.room);
  const playerId = useGame((state) => state.playerId);
  const setColor = useGame((state) => state.setColor);
  const setReady = useGame((state) => state.setReady);
  const start = useGame((state) => state.start);
  const newBoard = useGame((state) => state.newBoard);
  const setBoardMode = useGame((state) => state.setBoardMode);
  const error = useGame((state) => state.error);
  const chat = useGame((state) => state.chat);
  const sendChat = useGame((state) => state.sendChat);

  // The lobby draws the board from the seed the server is showing everybody.
  // Generating it here is not a rule decision: it is the same pure function
  // the engine uses, run on a number the server chose.
  const previewSeed = room?.previewSeed;
  const boardMode = room?.boardMode;
  const preview = useMemo(
    () =>
      previewSeed === undefined || boardMode === undefined
        ? undefined
        : generateBoard(previewSeed, boardMode),
    [previewSeed, boardMode],
  );

  if (!room) return null;
  const me = room.seats.find((seat) => seat.playerId === playerId);
  const isHost = room.hostId === playerId;
  const everyoneReady =
    room.seats.length >= MIN_PLAYERS &&
    room.seats.every((seat) => seat.ready && seat.color !== undefined);

  /**
   * The one thing standing between the room and a game.
   *
   * It used to read "3 de 4 · hacen falta 3" next to a greyed-out Arrancar,
   * which is true and says nothing: a colour nobody picked keeps the button
   * off and the line never mentioned it.
   */
  const missingColor = room.seats.filter((seat) => seat.color === undefined);
  const notReady = room.seats.filter((seat) => seat.color !== undefined && !seat.ready);
  const whatIsMissing =
    room.seats.length < MIN_PLAYERS
      ? `Son ${room.seats.length}: hacen falta ${MIN_PLAYERS - room.seats.length} más (mínimo ${MIN_PLAYERS}, máximo 4)`
      : missingColor.length > 0
        ? `Falta que elija color: ${missingColor.map((seat) => seat.name).join(', ')}`
        : notReady.length > 0
          ? `Falta que esté listo: ${notReady.map((seat) => seat.name).join(', ')}`
          : isHost
            ? 'Están todos: dale a Arrancar'
            : `Están todos: espera que ${room.seats.find((seat) => seat.playerId === room.hostId)?.name ?? 'el anfitrión'} arranque`;

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 overflow-y-auto bg-stone-900 py-6 text-stone-100">
      <div className="text-center">
        <h1 className="font-display text-2xl">Sala</h1>
        <p className="font-display text-4xl tracking-[0.3em]">{room.code}</p>
        <p className="mt-1 text-xs text-guanaco-apagado">Pasale el código a los demás</p>
      </div>

      {/* The board everybody is about to play, before anybody commits. */}
      <div className="flex w-full max-w-3xl flex-col items-center">
        <div className="h-64 w-full">
          {preview ? (
            <Board board={preview.board} robberHex={preview.robberHex} debug={false} />
          ) : null}
        </div>
        <div className="mt-2 flex flex-wrap items-center justify-center gap-1">
          {MODES.map((option) => (
            <button
              key={option.mode}
              type="button"
              disabled={!isHost}
              title={option.blurb}
              onClick={() => {
                setBoardMode(option.mode);
              }}
              className={`rounded-panel px-3 py-1 text-[13px] font-semibold disabled:opacity-60 ${
                room.boardMode === option.mode
                  ? 'bg-guanaco text-noche'
                  : 'bg-chapa text-guanaco-apagado'
              }`}
            >
              {option.label}
            </button>
          ))}
          {isHost && room.boardMode !== 'classic' ? (
            <button
              type="button"
              onClick={newBoard}
              className="rounded-panel bg-chapa px-3 py-1 text-[13px] font-semibold hover:bg-chapa-alta"
            >
              Otro tablero
            </button>
          ) : null}
        </div>
        <p className="mt-1 max-w-md text-center text-[13px] text-guanaco-apagado">
          {MODES.find((option) => option.mode === room.boardMode)?.blurb}
          {isHost ? '' : ' · lo elige el host'}
        </p>
      </div>

      {error ? <p className="rounded bg-bordo px-3 py-1.5 text-sm font-semibold">{error}</p> : null}

      {/* The room's conversation sits next to the room's people, and stays
          exactly where it is once the game starts. */}
      <div className="flex w-full max-w-3xl flex-col items-center gap-6 lg:flex-row lg:items-start lg:justify-center">
        <div className="flex w-80 flex-col gap-4">
          <ul className="w-80 space-y-1">
            {room.seats.map((seat) => (
              <li
                key={seat.playerId}
                className="flex items-center gap-2 rounded bg-stone-800 px-3 py-2 text-sm"
              >
                <span
                  className="inline-block size-3 rounded-full border border-stone-600"
                  style={{
                    backgroundColor: seat.color
                      ? PLAYER_COLORS[seat.color as PlayerColor]
                      : 'transparent',
                  }}
                />
                <span>{seat.name}</span>
                {room.hostId === seat.playerId ? (
                  <span className="text-[10px] text-stone-400">host</span>
                ) : null}
                {!seat.connected ? (
                  <span className="text-[10px] text-stone-500">desconectado</span>
                ) : null}
                {(room.wins[seat.playerId] ?? 0) > 0 ? (
                  <span
                    title={`${room.wins[seat.playerId] ?? 0} ganada(s) en esta sala`}
                    className="font-display text-[11px] text-estepa"
                  >
                    🏆 {room.wins[seat.playerId] ?? 0}
                  </span>
                ) : null}
                <span className="ml-auto text-xs">{seat.ready ? 'listo' : '…'}</span>
              </li>
            ))}
          </ul>

          <div className="flex w-80 flex-wrap gap-2">
            {COLORS.map((color) => {
              const taken = room.seats.some(
                (seat) => seat.color === color && seat.playerId !== playerId,
              );
              return (
                <button
                  key={color}
                  type="button"
                  disabled={taken}
                  onClick={() => {
                    setColor(color);
                  }}
                  className={`flex-1 rounded px-2 py-1.5 text-xs font-semibold disabled:opacity-25 ${
                    me?.color === color ? 'ring-2 ring-white' : ''
                  }`}
                  style={{ backgroundColor: PLAYER_COLORS[color], color: '#12100e' }}
                >
                  {PLAYER_COLOR_LABELS[color]}
                </button>
              );
            })}
          </div>

          <div className="flex w-80 gap-2">
            <button
              type="button"
              onClick={() => {
                setReady(!me?.ready);
              }}
              className="flex-1 rounded bg-stone-700 px-3 py-2 font-semibold hover:bg-stone-600"
            >
              {me?.ready ? 'No estoy listo' : 'Estoy listo'}
            </button>
            {isHost ? (
              <button
                type="button"
                disabled={!everyoneReady}
                onClick={start}
                className="flex-1 rounded bg-stone-100 px-3 py-2 font-semibold text-stone-900 disabled:opacity-30"
              >
                Arrancar
              </button>
            ) : null}
          </div>

          <div className="flex items-center gap-3">
            <p className="text-[13px] text-guanaco-apagado">{whatIsMissing}</p>
            <RulesButton className="ml-auto shrink-0" />
          </div>
        </div>

        <div className="w-80 rounded-panel bg-chapa p-3 lg:w-96">
          <Chat
            messages={chat}
            nameOf={(id) => room.seats.find((seat) => seat.playerId === id)?.name ?? id}
            colorOf={(id) => {
              const color = room.seats.find((seat) => seat.playerId === id)?.color;
              return color === undefined ? '#ffffff' : PLAYER_COLORS[color as PlayerColor];
            }}
            onSend={sendChat}
            collapsible={false}
            height="h-56"
          />
        </div>
      </div>
    </main>
  );
}

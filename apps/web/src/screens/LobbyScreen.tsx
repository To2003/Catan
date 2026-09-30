import { useMemo, useState } from 'react';
import {
  MAX_PLAYERS,
  MIN_PLAYERS,
  generateBoard,
  type BoardMode,
  type PlayerColor,
} from '@tierra-austral/engine';
import { useGame } from '../store/gameStore.js';
import { Chat } from '../components/Chat.js';
import { CopyButton } from '../components/CopyButton.js';
import { LeaveButton } from '../components/LeaveButton.js';
import { RulesButton } from '../components/Rules.js';
import { SegmentedControl, type Segment } from '../components/SegmentedControl.js';
import { Seat } from '../components/lobby/Seat.js';
import { PLAYER_COLORS } from '../lib/playerColors.js';
import { inviteLink } from '../lib/tokens.js';
import { Board } from '../components/board/Board.js';

/** The three ways a board can come out, in the words the lobby uses. */
const MODES: readonly (Segment<BoardMode> & { blurb: string })[] = [
  {
    value: 'random',
    label: 'Aleatorio',
    hint: 'Como sale',
    blurb: 'Como sale. Lo único que se respeta es que no haya dos rojos pegados.',
  },
  {
    value: 'classic',
    label: 'Clásico',
    hint: 'Siempre el mismo',
    blurb: 'El tablero fijo de siempre: mismos terrenos, mismos números, mismos puertos.',
  },
  {
    value: 'balanced',
    label: 'Balanceado',
    hint: 'Al azar, sin rachas',
    blurb:
      'Al azar, pero sin números repetidos pegados, sin tres terrenos iguales en fila y con los recursos parejos.',
  },
];

/**
 * The room before the game.
 *
 * Three columns, because a lobby is three unrelated jobs happening at once:
 * getting everybody seated, agreeing on a board, and talking while you wait.
 * Stacked in one narrow strip, as it was, each of them ended up below the fold
 * at some point. Every column scrolls on its own, so the page never does and
 * the ready button never walks off the bottom.
 */
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
  const chatSeen = useGame((state) => state.chatSeen);
  const markChatSeen = useGame((state) => state.markChatSeen);

  /** The drawer on a narrow screen, where the chat has no column of its own. */
  const [chatOpen, setChatOpen] = useState(false);

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
  const hostName = room.seats.find((seat) => seat.playerId === room.hostId)?.name ?? 'el anfitrión';
  const nameOf = (id: string): string =>
    room.seats.find((seat) => seat.playerId === id)?.name ?? id;

  const takenBy: Partial<Record<PlayerColor, string>> = {};
  for (const seat of room.seats) {
    if (seat.color !== undefined) takenBy[seat.color as PlayerColor] = seat.name;
  }

  const missingPlayers = Math.max(0, MIN_PLAYERS - room.seats.length);
  const missingColor = room.seats.filter((seat) => seat.color === undefined);
  const notReady = room.seats.filter((seat) => seat.color !== undefined && !seat.ready);
  const everyoneReady = missingPlayers === 0 && missingColor.length === 0 && notReady.length === 0;

  /**
   * Why the start button is off, said on the button itself.
   *
   * It used to read "3 de 4 · hacen falta 3" beside a greyed-out Arrancar,
   * which is true and says nothing: a colour nobody picked keeps the button
   * off and that line never mentioned it.
   */
  const blockedBecause =
    missingPlayers > 0
      ? `Falta${missingPlayers === 1 ? '' : 'n'} ${missingPlayers} jugador${
          missingPlayers === 1 ? '' : 'es'
        }`
      : missingColor.length > 0
        ? `Falta el color de ${missingColor.map((seat) => seat.name).join(', ')}`
        : notReady.length > 0
          ? `Falta que esté listo: ${notReady.map((seat) => seat.name).join(', ')}`
          : undefined;

  const activeMode = MODES.find((option) => option.value === room.boardMode);
  const unread = Math.max(0, chat.length - chatSeen);

  const chatPanel = (
    <Chat
      messages={chat}
      nameOf={nameOf}
      colorOf={(id) => {
        const color = room.seats.find((seat) => seat.playerId === id)?.color;
        return color === undefined ? '#e3d5bf' : PLAYER_COLORS[color as PlayerColor];
      }}
      onSend={sendChat}
      collapsible={false}
      fill
      autoFocus
    />
  );

  return (
    <main className="flex h-dvh flex-col overflow-hidden bg-noche text-guanaco">
      <div className="lobby min-h-0 flex-1 p-3">
        {/* ── The room, and who is in it ──────────────────────────────── */}
        {/* Named because it scrolls: a scrollable region is a tab stop in
            Chrome, and an unnamed one announces nothing when you land on it. */}
        <section
          aria-label="Sala y jugadores"
          className="lobby-sala flex min-h-0 flex-col gap-3 md:overflow-y-auto"
        >
          <div className="rounded-panel bg-chapa p-4">
            <p className="text-[13px] text-guanaco-apagado">Código de la sala</p>
            <p className="font-display mt-0.5 text-[52px] leading-none tracking-[0.12em] text-guanaco">
              {room.code}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <CopyButton text={room.code} label="Copiar código" />
              <CopyButton text={inviteLink(room.code)} label="Copiar link" />
            </div>
            <p className="mt-2 text-[13px] text-guanaco-apagado">
              El link abre la sala con el código ya puesto.
            </p>
          </div>

          <div>
            <h2 className="mb-1.5 text-[13px] font-semibold text-guanaco">
              Jugadores{' '}
              <span className="font-normal text-guanaco-apagado">
                {room.seats.length} de {MAX_PLAYERS}
              </span>
            </h2>
            <ul className="space-y-1.5">
              {Array.from({ length: MAX_PLAYERS }, (_, index) => {
                const seat = room.seats[index];
                return (
                  <Seat
                    key={seat?.playerId ?? `vacio-${index}`}
                    index={index + 1}
                    {...(seat === undefined
                      ? {}
                      : {
                          person: {
                            playerId: seat.playerId,
                            name: seat.name,
                            ...(seat.color === undefined
                              ? {}
                              : { color: seat.color as PlayerColor }),
                            ready: seat.ready,
                            connected: seat.connected,
                            wins: room.wins[seat.playerId] ?? 0,
                          },
                        })}
                    isHost={seat?.playerId === room.hostId}
                    isYou={seat?.playerId === playerId}
                    takenBy={takenBy}
                    onPickColor={setColor}
                  />
                );
              })}
            </ul>
          </div>

          {error ? (
            <p role="alert" className="rounded-panel bg-lenga px-3 py-2 text-[13px] font-semibold">
              {error}
            </p>
          ) : null}
        </section>

        {/* ── The board everybody is about to play ────────────────────── */}
        <section
          aria-label="El tablero de la partida"
          className="lobby-tablero flex min-h-[20rem] flex-col gap-2 rounded-panel bg-chapa/40 p-3 md:min-h-0"
        >
          <div className="flex flex-wrap items-center gap-2">
            <SegmentedControl
              label="Cómo se arma el tablero"
              options={MODES}
              value={room.boardMode}
              onChange={setBoardMode}
              disabled={!isHost}
            />

            {/* Its own button, set apart from the group: asking for another
                draw is not a fourth way of laying the board out. */}
            <button
              type="button"
              disabled={!isHost || room.boardMode === 'classic'}
              onClick={newBoard}
              title={
                room.boardMode === 'classic'
                  ? 'El clásico es siempre el mismo tablero'
                  : 'Sortear otro tablero'
              }
              className="flex items-center gap-1.5 rounded-panel bg-chapa px-3 py-1.5 text-[13px] font-semibold text-guanaco-apagado transition-colors enabled:hover:bg-chapa-alta enabled:hover:text-guanaco disabled:opacity-40"
            >
              <span aria-hidden>🎲</span> Otro tablero
            </button>

            {isHost ? null : (
              <span className="text-[13px] text-guanaco-apagado">Lo elige {hostName}</span>
            )}
          </div>

          <p className="min-h-[1.25rem] text-[13px] text-guanaco-apagado">{activeMode?.blurb}</p>

          {/* The same measured board the game uses: no fixed size, it takes
              whatever the column leaves it. Remounting on the key replays the
              fade, so a new draw looks like a new draw. */}
          <div key={`${room.boardMode}-${room.previewSeed}`} className="board-swap min-h-0 flex-1">
            {preview ? (
              <Board board={preview.board} robberHex={preview.robberHex} debug={false} />
            ) : null}
          </div>
        </section>

        {/* ── The two buttons anybody came here to press ──────────────── */}
        <div className="lobby-acciones flex flex-col gap-2">
          <div className="flex gap-2">
            <button
              type="button"
              aria-pressed={me?.ready ?? false}
              onClick={() => {
                setReady(!me?.ready);
              }}
              className={`flex-1 rounded-panel px-3 py-2.5 font-semibold transition-colors ${
                me?.ready
                  ? 'bg-verde/25 text-verde ring-1 ring-verde/50 hover:bg-verde/35'
                  : 'bg-chapa-alta text-guanaco hover:bg-chapa'
              }`}
            >
              {me?.ready ? '✓ Estoy listo' : 'Estoy listo'}
            </button>

            {isHost ? (
              <button
                type="button"
                disabled={!everyoneReady}
                {...(blockedBecause === undefined ? {} : { title: blockedBecause })}
                onClick={start}
                className="flex-1 rounded-panel bg-estepa px-3 py-2.5 text-[15px] font-semibold text-noche transition-colors hover:bg-estepa/85 disabled:bg-chapa-alta disabled:text-guanaco-apagado"
              >
                {everyoneReady ? 'Arrancar' : (blockedBecause ?? 'Arrancar')}
              </button>
            ) : (
              <p className="flex flex-1 items-center justify-center rounded-panel bg-chapa px-3 py-2.5 text-center text-[13px] text-guanaco-apagado">
                {everyoneReady
                  ? `Esperando que ${hostName} arranque`
                  : (blockedBecause ?? `Esperando que ${hostName} arranque`)}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <RulesButton />
            <LeaveButton from="lobby" className="ml-auto" />
          </div>
        </div>

        {/* ── The room's conversation ─────────────────────────────────── */}
        <section
          aria-label="Mensajes de la sala"
          className="lobby-chat hidden min-h-0 flex-col rounded-panel bg-chapa p-3 md:flex"
        >
          {chatPanel}
        </section>
      </div>

      {/* On a phone the chat has no column, so it becomes a drawer. The two
          buttons above stay put either way. */}
      <div className="shrink-0 border-t border-chapa px-3 py-2 md:hidden">
        <button
          type="button"
          aria-expanded={chatOpen}
          onClick={() => {
            setChatOpen((open) => {
              if (!open) markChatSeen();
              return !open;
            });
          }}
          className="flex w-full items-center gap-2 text-[13px] font-semibold text-guanaco"
        >
          <span>Mensajes</span>
          {!chatOpen && unread > 0 ? (
            <span className="rounded-full bg-estepa px-1.5 text-[12px] font-bold text-noche">
              {unread}
            </span>
          ) : null}
          <span className="ml-auto text-guanaco-apagado">{chatOpen ? '▾' : '▴'}</span>
        </button>
        {chatOpen ? <div className="mt-2 h-56">{chatPanel}</div> : null}
      </div>
    </main>
  );
}

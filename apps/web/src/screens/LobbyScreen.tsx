import { MIN_PLAYERS, type PlayerColor } from '@tierra-austral/engine';
import { useGame } from '../store/gameStore.js';
import { PLAYER_COLORS, PLAYER_COLOR_LABELS } from '../lib/playerColors.js';

const COLORS: readonly PlayerColor[] = ['celeste', 'bordo', 'verde', 'amarillo'];

/** Colours, ready marks and the host's start button. */
export function LobbyScreen() {
  const room = useGame((state) => state.room);
  const playerId = useGame((state) => state.playerId);
  const setColor = useGame((state) => state.setColor);
  const setReady = useGame((state) => state.setReady);
  const start = useGame((state) => state.start);
  const error = useGame((state) => state.error);

  if (!room) return null;
  const me = room.seats.find((seat) => seat.playerId === playerId);
  const isHost = room.hostId === playerId;
  const everyoneReady =
    room.seats.length >= MIN_PLAYERS &&
    room.seats.every((seat) => seat.ready && seat.color !== undefined);

  return (
    <main className="flex h-screen flex-col items-center justify-center gap-6 bg-stone-900 text-stone-100">
      <div className="text-center">
        <h1 className="text-2xl font-bold">Sala</h1>
        <p className="font-mono text-4xl tracking-[0.3em]">{room.code}</p>
        <p className="mt-1 text-xs text-stone-400">Pasale el código a los demás</p>
      </div>

      {error ? <p className="rounded bg-bordo px-3 py-1.5 text-sm font-semibold">{error}</p> : null}

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

      <p className="text-xs text-stone-500">
        {room.seats.length} de 4 · hacen falta {MIN_PLAYERS}
      </p>
    </main>
  );
}

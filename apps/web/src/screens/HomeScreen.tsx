import { useState } from 'react';
import { useGame } from '../store/gameStore.js';
import { readInviteCodeFromUrl, readLastRoom } from '../lib/tokens.js';
import { RulesButton } from '../components/Rules.js';

/** Create a room or join one with a code. */
export function HomeScreen() {
  const createRoom = useGame((state) => state.createRoom);
  const joinRoom = useGame((state) => state.joinRoom);
  const connected = useGame((state) => state.connected);
  const error = useGame((state) => state.error);

  const [name, setName] = useState('');
  // A shared link wins over the last room this browser was in: somebody sent
  // you here on purpose.
  const [code, setCode] = useState(readInviteCodeFromUrl() ?? readLastRoom() ?? '');

  const canPlay = connected && name.trim().length > 0;

  return (
    <main className="flex h-screen flex-col items-center justify-center gap-6 bg-stone-900 text-stone-100">
      <h1 className="text-3xl font-bold tracking-tight">Tierra Austral</h1>

      {error ? <p className="rounded bg-bordo px-3 py-1.5 text-sm font-semibold">{error}</p> : null}

      <div className="flex w-80 flex-col gap-3">
        <label className="flex flex-col gap-1 text-sm">
          Tu nombre
          <input
            value={name}
            maxLength={20}
            onChange={(event) => {
              setName(event.target.value);
            }}
            className="rounded bg-stone-800 px-3 py-2"
          />
        </label>

        <button
          type="button"
          disabled={!canPlay}
          onClick={() => {
            createRoom(name.trim());
          }}
          className="rounded bg-stone-100 px-3 py-2 font-semibold text-stone-900 disabled:opacity-30"
        >
          Crear sala
        </button>

        <div className="mt-2 flex gap-2">
          <input
            value={code}
            maxLength={5}
            placeholder="CÓDIGO"
            onChange={(event) => {
              setCode(event.target.value.toUpperCase());
            }}
            className="w-32 rounded bg-stone-800 px-3 py-2 text-center font-mono tracking-widest"
          />
          <button
            type="button"
            disabled={!canPlay || code.length !== 5}
            onClick={() => {
              joinRoom(code, name.trim());
            }}
            className="flex-1 rounded bg-stone-700 px-3 py-2 font-semibold hover:bg-stone-600 disabled:opacity-30"
          >
            Unirse
          </button>
        </div>
      </div>

      <RulesButton />

      <p className="text-xs text-stone-500">
        {connected ? 'Conectado' : 'Conectando…'} · 3 a 4 jugadores
      </p>
    </main>
  );
}

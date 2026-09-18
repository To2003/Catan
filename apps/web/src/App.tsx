import { useEffect, useState } from 'react';
import { HEX_COUNT } from '@tierra-austral/engine';
import { socket } from './net/socket.js';

export function App() {
  const [connected, setConnected] = useState(socket.connected);

  useEffect(() => {
    const onConnect = (): void => {
      setConnected(true);
    };
    const onDisconnect = (): void => {
      setConnected(false);
    };
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
    };
  }, []);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-stone-900 text-stone-100">
      <h1 className="text-4xl font-bold tracking-tight">Tierra Austral</h1>
      <p className="text-stone-400">Todavía no hay nada para jugar, pero el andamio está en pie.</p>
      <p className="text-sm">
        Servidor:{' '}
        <span className={connected ? 'text-verde' : 'text-bordo'}>
          {connected ? 'conectado' : 'desconectado'}
        </span>
      </p>
      <p className="text-sm text-stone-500">El tablero va a tener {HEX_COUNT} hexágonos.</p>
    </main>
  );
}

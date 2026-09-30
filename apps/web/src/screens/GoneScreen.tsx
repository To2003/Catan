import { useGame } from '../store/gameStore.js';

/**
 * Where you land after the door closes behind you.
 *
 * Two ways to get here and they are not the same news, so they do not get the
 * same screen: one of them is something you did and the other is something
 * somebody did to you. Either way the seat is gone, so the only thing on
 * offer is the way back to the front door — and, when there is one, the code
 * to walk in again from scratch.
 */
export function GoneScreen() {
  const kickedOut = useGame((state) => state.kickedOut);
  const leftRoom = useGame((state) => state.leftRoom);
  const dismiss = useGame((state) => state.dismissGone);

  return (
    <main className="flex h-dvh flex-col items-center justify-center gap-5 bg-noche px-4 text-center text-guanaco">
      <h1 className="font-display text-3xl">
        {kickedOut ? 'Te sacaron de la sala' : 'Saliste de la sala'}
      </h1>

      <p className="max-w-sm text-[14px] leading-relaxed text-guanaco-apagado">
        {kickedOut
          ? 'El anfitrión te expulsó. Tu lugar quedó libre y este navegador no puede volver a entrar a esa partida.'
          : 'Abandonaste para siempre: tu lugar quedó libre y no podés volver a esa partida. Tus piezas se quedaron en el tablero y la mesa juega tus turnos sola.'}
        {leftRoom === undefined ? '' : ` (sala ${leftRoom})`}
      </p>

      <button
        type="button"
        onClick={dismiss}
        className="rounded-panel bg-estepa px-5 py-2.5 font-semibold text-noche hover:bg-estepa/85"
      >
        Volver al inicio
      </button>
    </main>
  );
}

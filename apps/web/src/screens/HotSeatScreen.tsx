import { useCallback, useMemo, useState } from 'react';
import {
  RESOURCES,
  applyAction,
  availableMaritimeRates,
  createGame,
  isVisibleTo,
  legalMoves,
  publicVictoryPoints,
  legalCitySpots,
  legalRoadSpots,
  legalRobberHexes,
  legalSettlementSpots,
  legalStealTargets,
  victoryPoints,
  type Action,
  type DevCard,
  type EdgeId,
  type GameEvent,
  type HexId,
  type PlayerId,
  type PlayerSeat,
  type ReadonlyGameState,
  type Resource,
  type ResourceBundle,
  type VertexId,
} from '@tierra-austral/engine';
import { Board } from '../components/board/Board.js';
import { DiscardModal } from '../components/DiscardModal.js';
import { ERROR_TEXT } from '../lib/errorText.js';
import { TradePanel } from '../components/TradePanel.js';
import { DevCardPanel } from '../components/DevCardPanel.js';
import { ResourceChoiceModal } from '../components/ResourceChoiceModal.js';
import { PLAYER_COLORS } from '../lib/playerColors.js';
import { eventText } from '../lib/eventText.js';
import { RESOURCE_LABELS } from '../lib/terrainStyles.js';
import { randomSeed, readDebugFromUrl, readSeedFromUrl, writeSeedToUrl } from '../lib/seed.js';

/**
 * Hot-seat debug screen, behind `?debug=1`.
 *
 * It calls `applyAction` and `legal*` straight from the engine, with no server
 * in between. That does not put rules in the web app: the screen asks the
 * engine what is legal and sends it actions, it never decides anything itself.
 *
 * Deliberately unpolished. It exists to exercise M2 by hand.
 */

const SEATS: readonly PlayerSeat[] = [
  { id: 'p1', name: 'Ana', color: 'celeste' },
  { id: 'p2', name: 'Bruno', color: 'bordo' },
  { id: 'p3', name: 'Cata', color: 'verde' },
  { id: 'p4', name: 'Dante', color: 'amarillo' },
];

const phaseText = (state: ReadonlyGameState): string => {
  const phase = state.phase;
  switch (phase.kind) {
    case 'setup':
      return `Setup, ronda ${phase.round}: ${phase.step === 'settlement' ? 'asentamiento' : 'camino'}`;
    case 'preRoll':
      return 'Antes de tirar';
    case 'discard':
      return `Descarte: faltan ${Object.keys(phase.pending).length}`;
    case 'moveRobber':
      return 'Mover el ladrón';
    case 'steal':
      return 'Elegir a quién robarle';
    case 'main':
      return 'Turno principal';
    case 'roadBuilding':
      return `Construcción de caminos: te queda${phase.remaining === 1 ? '' : 'n'} ${phase.remaining}`;
    case 'gameOver':
      return 'Partida terminada';
    default:
      return phase.kind;
  }
};

export function HotSeatScreen() {
  const [seed, setSeed] = useState(() => readSeedFromUrl() ?? randomSeed());
  const [game, setGame] = useState<ReadonlyGameState>(() => createGame(seed, SEATS));
  const [log, setLog] = useState<readonly GameEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  /** Which card is waiting for the player to choose its resources. */
  const [choosing, setChoosing] = useState<'yearOfPlenty' | 'monopoly' | null>(null);
  const [debug, setDebug] = useState(readDebugFromUrl);

  const nameOf = useCallback(
    (id: PlayerId) => game.players.find((player) => player.id === id)?.name ?? id,
    [game],
  );

  const colorOf = useCallback(
    (id: PlayerId) => {
      const player = game.players.find((candidate) => candidate.id === id);
      return player ? PLAYER_COLORS[player.color] : '#ffffff';
    },
    [game],
  );

  // The active player is whoever the engine says is on turn: there is nothing
  // to choose until M3 brings simultaneous discards.
  const active = game.currentPlayer;

  const send = useCallback(
    (action: Action, as: PlayerId = active) => {
      const result = applyAction(game, as, action);
      if (!result.ok) {
        setError(ERROR_TEXT[result.error]);
        return;
      }
      setError(null);
      setGame(result.state);
      setLog((entries) => [...entries, ...result.events]);
    },
    [game, active],
  );

  const restart = useCallback(() => {
    const next = randomSeed();
    setSeed(next);
    writeSeedToUrl(next);
    setGame(createGame(next, SEATS));
    setLog([]);
    setError(null);
  }, []);

  const settlements = useMemo(() => legalSettlementSpots(game, active), [game, active]);
  const cities = useMemo(() => legalCitySpots(game, active), [game, active]);
  const roads = useMemo(() => legalRoadSpots(game, active), [game, active]);
  const robberHexes = useMemo(() => legalRobberHexes(game, active), [game, active]);
  const rates = useMemo(() => availableMaritimeRates(game, active), [game, active]);
  // The same summary the server ships inside a view, computed locally here so
  // the panels are fed identically in both modes.
  const moves = useMemo(() => legalMoves(game, active), [game, active]);
  const stealTargets = useMemo(() => legalStealTargets(game, active), [game, active]);

  // Whoever owes cards goes first, one at a time: enough for a local game.
  const discarding = useMemo(() => {
    if (game.phase.kind !== 'discard') return undefined;
    const [playerId] = Object.keys(game.phase.pending);
    if (playerId === undefined) return undefined;
    const player = game.players.find((candidate) => candidate.id === playerId);
    const owed = game.phase.pending[playerId];
    return player && owed !== undefined ? { player, owed } : undefined;
  }, [game]);

  const onVertex = useCallback(
    (vertex: VertexId) => {
      // A vertex can be both: a settlement spot wins, since upgrading needs a
      // settlement already there.
      if (settlements.includes(vertex)) send({ type: 'placeSettlement', vertex });
      else if (cities.includes(vertex)) send({ type: 'upgradeCity', vertex });
    },
    [settlements, cities, send],
  );

  const onEdge = useCallback(
    (edge: EdgeId) => {
      send({ type: 'placeRoad', edge });
    },
    [send],
  );

  const onHex = useCallback(
    (hex: HexId) => {
      send({ type: 'moveRobber', hex });
    },
    [send],
  );

  const onTrade = useCallback(
    (give: Resource, want: Resource) => {
      send({ type: 'maritimeTrade', give, want });
    },
    [send],
  );

  const onPlayCard = useCallback(
    (card: DevCard) => {
      if (card === 'yearOfPlenty' || card === 'monopoly') {
        setChoosing(card);
        return;
      }
      if (card === 'knight') send({ type: 'playKnight' });
      if (card === 'roadBuilding') send({ type: 'playRoadBuilding' });
    },
    [send],
  );

  const onChoose = useCallback(
    (chosen: Resource[]) => {
      const [first, second] = chosen;
      if (choosing === 'monopoly' && first) send({ type: 'playMonopoly', resource: first });
      if (choosing === 'yearOfPlenty' && first && second) {
        send({ type: 'playYearOfPlenty', resources: [first, second] });
      }
      setChoosing(null);
    },
    [choosing, send],
  );

  const onDiscard = useCallback(
    (cards: Partial<ResourceBundle>) => {
      if (discarding) send({ type: 'discard', cards }, discarding.player.id);
    },
    [discarding, send],
  );

  const activePlayer = game.players.find((player) => player.id === active);

  return (
    <main className="flex h-screen flex-col overflow-hidden bg-stone-900 text-stone-100">
      <header className="flex flex-wrap items-center gap-3 border-b border-stone-700 px-4 py-2">
        <h1 className="text-lg font-bold tracking-tight">Hot-seat</h1>
        <span className="rounded bg-stone-800 px-2 py-1 font-mono text-xs text-stone-300">
          semilla {seed}
        </span>
        <span className="rounded bg-stone-800 px-2 py-1 text-xs">{phaseText(game)}</span>
        {game.lastRoll ? (
          <span className="rounded bg-stone-800 px-2 py-1 text-xs">
            dados {game.lastRoll[0]} + {game.lastRoll[1]} = {game.lastRoll[0] + game.lastRoll[1]}
          </span>
        ) : null}
        {error ? (
          <span className="rounded bg-bordo px-2 py-1 text-xs font-semibold">{error}</span>
        ) : null}

        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              send({ type: 'rollDice' });
            }}
            disabled={game.phase.kind !== 'preRoll'}
            className="rounded bg-stone-100 px-3 py-1.5 text-sm font-semibold text-stone-900 disabled:opacity-30"
          >
            Tirar dados
          </button>
          <button
            type="button"
            onClick={() => {
              send({ type: 'endTurn' });
            }}
            disabled={game.phase.kind !== 'main'}
            className="rounded bg-stone-100 px-3 py-1.5 text-sm font-semibold text-stone-900 disabled:opacity-30"
          >
            Terminar turno
          </button>
          <button
            type="button"
            onClick={restart}
            className="rounded bg-stone-700 px-3 py-1.5 text-sm font-semibold hover:bg-stone-600"
          >
            Partida nueva
          </button>
          <button
            type="button"
            onClick={() => {
              setDebug((on) => !on);
            }}
            aria-pressed={debug}
            className={`rounded px-3 py-1.5 text-sm font-semibold ${
              debug ? 'bg-amarillo text-stone-900' : 'bg-stone-700 hover:bg-stone-600'
            }`}
          >
            IDs
          </button>
        </div>
      </header>

      <div className="relative flex min-h-0 flex-1">
        {choosing ? (
          <ResourceChoiceModal
            title={choosing === 'monopoly' ? 'Monopolio: elegí un recurso' : 'Año de abundancia'}
            count={choosing === 'monopoly' ? 1 : 2}
            onConfirm={onChoose}
            onCancel={() => {
              setChoosing(null);
            }}
          />
        ) : null}
        {discarding ? (
          <DiscardModal player={discarding.player} owed={discarding.owed} onConfirm={onDiscard} />
        ) : null}
        <section className="min-h-0 flex-1 p-2">
          <Board
            board={game.board}
            robberHex={game.robberHex}
            debug={debug}
            interaction={{
              buildings: game.buildings,
              roads: game.roads,
              colorOf,
              legalVertices: [...new Set([...settlements, ...cities])],
              legalEdges: roads,
              legalHexes: robberHexes,
              onVertex,
              onEdge,
              onHex,
            }}
          />
        </section>

        <aside className="flex w-80 min-w-80 flex-col gap-3 overflow-y-auto border-l border-stone-700 p-3 text-sm">
          <div>
            <h2 className="mb-1 text-xs font-bold tracking-widest text-stone-400 uppercase">
              Jugadores
            </h2>
            <ul className="space-y-1">
              {game.turnOrder.map((id) => {
                const player = game.players.find((candidate) => candidate.id === id);
                if (!player) return null;
                const isActive = id === active;
                return (
                  <li
                    key={id}
                    className={`flex items-center gap-2 rounded px-2 py-1 ${
                      isActive ? 'bg-stone-700' : ''
                    }`}
                  >
                    <span
                      className="inline-block size-3 rounded-full"
                      style={{ backgroundColor: PLAYER_COLORS[player.color] }}
                    />
                    <span className={isActive ? 'font-semibold' : ''}>{player.name}</span>
                    {game.longestRoad?.owner === id ? (
                      <span title="Camino más largo" className="text-xs">
                        🛣
                      </span>
                    ) : null}
                    {game.largestArmy === id ? (
                      <span title="Gran ejército" className="text-xs">
                        ⚔
                      </span>
                    ) : null}
                    <span
                      className="ml-auto font-mono text-xs text-stone-400"
                      title={isActive ? 'Incluye tus cartas de PV' : 'Puntos visibles'}
                    >
                      {isActive ? victoryPoints(game, id) : publicVictoryPoints(game, id)} PV
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>

          {stealTargets.length > 0 ? (
            <div>
              <h2 className="mb-1 text-xs font-bold tracking-widest text-stone-400 uppercase">
                Robarle a
              </h2>
              <div className="flex flex-wrap gap-2">
                {stealTargets.map((target) => {
                  const victim = game.players.find((candidate) => candidate.id === target);
                  const cards = victim
                    ? RESOURCES.reduce((sum, resource) => sum + victim.resources[resource], 0)
                    : 0;
                  return (
                    <button
                      key={target}
                      type="button"
                      // Even with a single candidate the action is explicit: the
                      // engine never resolves a steal on its own (SPEC §12.7).
                      autoFocus={stealTargets.length === 1}
                      onClick={() => {
                        send({ type: 'steal', target });
                      }}
                      className="rounded bg-stone-100 px-2 py-1 text-xs font-semibold text-stone-900"
                    >
                      {victim?.name ?? target} ({cards})
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          <div>
            <h2 className="mb-1 text-xs font-bold tracking-widest text-stone-400 uppercase">
              Mano de {activePlayer?.name ?? '—'}
            </h2>
            <ul className="grid grid-cols-5 gap-1 text-center font-mono text-xs">
              {RESOURCES.map((resource) => (
                <li key={resource} className="rounded bg-stone-800 px-1 py-1">
                  <div className="text-[10px] text-stone-400">{RESOURCE_LABELS[resource]}</div>
                  <div className="text-base">{activePlayer?.resources[resource] ?? 0}</div>
                </li>
              ))}
            </ul>
            <p className="mt-1 text-xs text-stone-400">
              Piezas: {activePlayer?.stock.roads ?? 0} caminos ·{' '}
              {activePlayer?.stock.settlements ?? 0} asentamientos ·{' '}
              {activePlayer?.stock.cities ?? 0} ciudades
            </p>
          </div>

          <DevCardPanel
            hand={activePlayer?.devCards ?? []}
            deckLeft={game.devDeck.length}
            moves={moves}
            onBuy={() => {
              send({ type: 'buyDevCard' });
            }}
            onPlay={onPlayCard}
          />

          <TradePanel
            rates={rates}
            hand={activePlayer?.resources ?? { wood: 0, brick: 0, sheep: 0, wheat: 0, ore: 0 }}
            bank={game.bank}
            enabled={game.phase.kind === 'main'}
            onTrade={onTrade}
          />

          <div>
            <h2 className="mb-1 text-xs font-bold tracking-widest text-stone-400 uppercase">
              Banco
            </h2>
            <ul className="grid grid-cols-5 gap-1 text-center font-mono text-xs">
              {RESOURCES.map((resource) => (
                <li key={resource} className="rounded bg-stone-800 px-1 py-1">
                  {game.bank[resource]}
                </li>
              ))}
            </ul>
          </div>

          <div className="min-h-0 flex-1">
            <h2 className="mb-1 text-xs font-bold tracking-widest text-stone-400 uppercase">
              Eventos ({log.length})
            </h2>
            <ol className="space-y-0.5 font-mono text-[11px] text-stone-300">
              {[...log]
                // Nothing is hidden in hot-seat, but the log goes through the
                // same audience check the server will use in M6, so the filter
                // is exercised from day one.
                .filter((event) => isVisibleTo(event, active))
                .slice(-60)
                .reverse()
                .map((event, index) => (
                  <li key={`${event.type}-${log.length - index}`} className="truncate">
                    {eventText(event, nameOf)}
                  </li>
                ))}
            </ol>
          </div>
        </aside>
      </div>
    </main>
  );
}

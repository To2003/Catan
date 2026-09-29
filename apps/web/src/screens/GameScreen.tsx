import { useCallback, useEffect, useState } from 'react';
import {
  RESOURCES,
  type DevCard,
  type EdgeId,
  type HexId,
  type PlayerId,
  type Resource,
  type ResourceBundle,
  type VertexId,
} from '@tierra-austral/engine';
import { Board } from '../components/board/Board.js';
import { DevCardPanel } from '../components/DevCardPanel.js';
import { DiscardModal } from '../components/DiscardModal.js';
import { ResourceChoiceModal } from '../components/ResourceChoiceModal.js';
import { OfferPanel } from '../components/OfferPanel.js';
import { TradePanel } from '../components/TradePanel.js';
import { Chat } from '../components/Chat.js';
import { EventLog } from '../components/EventLog.js';
import { PlayerList } from '../components/PlayerList.js';
import { RobberHint } from '../components/RobberHint.js';
import { DiceRoll } from '../components/DiceRoll.js';
import { isMuted, setMuted } from '../lib/sounds.js';
import { PLAYER_COLORS } from '../lib/playerColors.js';
import { RESOURCE_LABELS } from '../lib/terrainStyles.js';
import { useGame } from '../store/gameStore.js';
import { FORCE_TURN_HINT_MS } from '../lib/timing.js';

/**
 * The game, over the network.
 *
 * Everything on screen comes from the view the server sent, including which
 * moves are legal. The client decides nothing.
 */
export function GameScreen() {
  const view = useGame((state) => state.view);
  const room = useGame((state) => state.room);
  const events = useGame((state) => state.events);
  const error = useGame((state) => state.error);
  const send = useGame((state) => state.send);
  const forceTurn = useGame((state) => state.forceTurn);
  const chat = useGame((state) => state.chat);
  const sendChat = useGame((state) => state.sendChat);
  const [muted, setMutedState] = useState(isMuted);

  const [choosing, setChoosing] = useState<'yearOfPlenty' | 'monopoly' | null>(null);
  /** Which hex the pointer is over while the robber is being placed. */
  const [hoveredHex, setHoveredHex] = useState<HexId | undefined>(undefined);
  const [pointer, setPointer] = useState({ x: 0, y: 0 });
  /** Whose longest route to trace on the board. */
  const [hoveredRoute, setHoveredRoute] = useState<PlayerId | undefined>(undefined);
  /** Whose buildings to ring, while picking somebody to rob. */
  const [hoveredVictim, setHoveredVictim] = useState<PlayerId | undefined>(undefined);

  // A ticking clock, so the force-turn button lights up on its own rather than
  // reading the wall clock while rendering. The server is the one that enforces
  // the two minutes; this only decides when to offer the button.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => {
      window.clearInterval(timer);
    };
  }, []);

  const nameOf = useCallback(
    (id: PlayerId) => view?.players.find((player) => player.id === id)?.name ?? id,
    [view],
  );

  const colorOf = useCallback(
    (id: PlayerId) => {
      const player = view?.players.find((candidate) => candidate.id === id);
      return player ? PLAYER_COLORS[player.color] : '#ffffff';
    },
    [view],
  );

  const onVertex = useCallback(
    (vertex: VertexId) => {
      if (!view) return;
      if (view.legalMoves.settlements.includes(vertex)) send({ type: 'placeSettlement', vertex });
      else if (view.legalMoves.cities.includes(vertex)) send({ type: 'upgradeCity', vertex });
    },
    [view, send],
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
      send({ type: 'discard', cards });
    },
    [send],
  );

  if (!view) return null;

  // How many rolls have been seen, so the dice replay their tumble each time.
  const rolls = events.filter((event) => event.type === 'DiceRolled').length;
  // What the last production gave this player, to flash the counters.
  const lastGain = [...events]
    .reverse()
    .find((event) => event.type === 'ResourcesProduced' || event.type === 'SetupResourcesGranted');
  const gained = new Set(
    lastGain?.type === 'ResourcesProduced' || lastGain?.type === 'SetupResourcesGranted'
      ? lastGain.grants.filter((grant) => grant.player === view.you).map((grant) => grant.resource)
      : [],
  );

  /** The buildings worth pointing at right now: a robbery's victims, or a target's. */
  const markedVertices = (() => {
    if (hoveredVictim !== undefined) {
      return view.board.vertexIds.filter(
        (vertex) => view.buildings[vertex]?.owner === hoveredVictim,
      );
    }
    if (hoveredHex !== undefined) {
      const corners = view.board.hexes[hoveredHex]?.corners ?? [];
      return corners.filter((corner) => {
        const owner = view.buildings[corner]?.owner;
        return owner !== undefined && owner !== view.you;
      });
    }
    return [];
  })();

  const markedEdges =
    hoveredRoute === undefined
      ? []
      : (view.players.find((player) => player.id === hoveredRoute)?.route ?? []);

  const isMyTurn = view.currentPlayer === view.you;
  const owed = view.legalMoves.discardOwed;
  const blocked = room?.blockedBy;
  const canForce =
    room?.hostId === view.you && blocked !== undefined && now - blocked.since > FORCE_TURN_HINT_MS;

  const phaseText = (): string => {
    switch (view.phase.kind) {
      case 'setup':
        return `Setup ${view.phase.round}: ${view.phase.step === 'settlement' ? 'asentamiento' : 'camino'}`;
      case 'preRoll':
        return 'Antes de tirar';
      case 'discard':
        return 'Descarte';
      case 'moveRobber':
        return 'Mover el ladrón';
      case 'steal':
        return 'Elegir a quién robarle';
      case 'roadBuilding':
        return `Caminos gratis: ${view.phase.remaining}`;
      case 'main':
        return 'Turno principal';
      default:
        return view.phase.kind;
    }
  };

  return (
    <main className="flex h-screen flex-col overflow-hidden bg-stone-900 text-stone-100">
      <header className="flex flex-wrap items-center gap-3 border-b border-stone-700 px-4 py-2">
        <h1 className="text-lg font-bold tracking-tight">Tierra Austral</h1>
        <span className="rounded bg-stone-800 px-2 py-1 font-mono text-xs">{room?.code}</span>
        <span className="rounded bg-stone-800 px-2 py-1 text-xs">{phaseText()}</span>
        <span className="rounded bg-stone-800 px-2 py-1 text-xs">
          {isMyTurn ? 'Es tu turno' : `Juega ${nameOf(view.currentPlayer)}`}
        </span>
        <DiceRoll dice={view.lastRoll} roll={rolls} />
        {error ? (
          <span className="rounded bg-bordo px-2 py-1 text-xs font-semibold">{error}</span>
        ) : null}

        <div className="ml-auto flex items-center gap-2">
          {blocked ? (
            <button
              type="button"
              disabled={!canForce}
              onClick={forceTurn}
              title={canForce ? '' : 'Hay que esperar 2 minutos'}
              className="rounded bg-stone-700 px-3 py-1.5 text-sm font-semibold hover:bg-stone-600 disabled:opacity-30"
            >
              Forzar turno de {nameOf(blocked.playerId)}
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => {
              send({ type: 'rollDice' });
            }}
            disabled={!view.legalMoves.canRoll}
            className="rounded bg-stone-100 px-3 py-1.5 text-sm font-semibold text-stone-900 disabled:opacity-30"
          >
            Tirar dados
          </button>
          <button
            type="button"
            onClick={() => {
              send({ type: 'endTurn' });
            }}
            disabled={!view.legalMoves.canEndTurn}
            className="rounded bg-stone-100 px-3 py-1.5 text-sm font-semibold text-stone-900 disabled:opacity-30"
          >
            Terminar turno
          </button>
          <button
            type="button"
            aria-pressed={muted}
            title={muted ? 'Sonido apagado' : 'Sonido prendido'}
            onClick={() => {
              const next = !muted;
              setMuted(next);
              setMutedState(next);
            }}
            className="rounded bg-stone-700 px-2 py-1.5 text-sm hover:bg-stone-600"
          >
            {muted ? '🔇' : '🔊'}
          </button>
        </div>
      </header>

      <div className="relative flex min-h-0 flex-1">
        {owed !== undefined ? (
          <DiscardModal player={view.me} owed={owed} onConfirm={onDiscard} />
        ) : null}
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

        <section
          className="min-h-0 flex-1 p-2"
          onMouseMove={(event) => {
            if (hoveredHex !== undefined) setPointer({ x: event.clientX, y: event.clientY });
          }}
        >
          <Board
            board={view.board}
            robberHex={view.robberHex}
            debug={false}
            interaction={{
              buildings: view.buildings,
              roads: view.roads,
              colorOf,
              legalVertices: [
                ...new Set([...view.legalMoves.settlements, ...view.legalMoves.cities]),
              ],
              legalEdges: view.legalMoves.roads,
              legalHexes: view.legalMoves.robberHexes,
              onVertex,
              onEdge,
              onHex,
              hoveredHex,
              onHexHover: setHoveredHex,
              markedVertices,
              markedEdges,
            }}
          />
        </section>

        {hoveredHex !== undefined ? (
          <RobberHint view={view} hex={hoveredHex} at={pointer} nameOf={nameOf} />
        ) : null}

        <aside className="flex w-80 min-w-80 flex-col gap-3 overflow-y-auto border-l border-stone-700 p-3 text-sm">
          <div>
            <h2 className="mb-1 text-xs font-bold tracking-widest text-stone-400 uppercase">
              Jugadores
            </h2>
            <PlayerList
              view={view}
              connected={(id) =>
                room?.seats.find((seat) => seat.playerId === id)?.connected ?? true
              }
              onHoverRoute={setHoveredRoute}
            />
          </div>

          {view.legalMoves.stealTargets.length > 0 ? (
            <div>
              <h2 className="mb-1 text-xs font-bold tracking-widest text-stone-400 uppercase">
                Robarle a
              </h2>
              <div className="flex flex-wrap gap-2">
                {view.legalMoves.stealTargets.map((target) => {
                  const victim = view.players.find((player) => player.id === target);
                  return (
                    <button
                      key={target}
                      type="button"
                      onClick={() => {
                        send({ type: 'steal', target });
                      }}
                      // Hovering a name rings that player's buildings, so you
                      // can see who you are about to rob before you do it.
                      onMouseEnter={() => {
                        setHoveredVictim(target);
                      }}
                      onMouseLeave={() => {
                        setHoveredVictim(undefined);
                      }}
                      onFocus={() => {
                        setHoveredVictim(target);
                      }}
                      onBlur={() => {
                        setHoveredVictim(undefined);
                      }}
                      className="rounded bg-stone-100 px-2 py-1 text-xs font-semibold text-stone-900"
                    >
                      {nameOf(target)} · {victim?.resourceCount ?? 0} 🂠
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          <div>
            <h2 className="mb-1 text-xs font-bold tracking-widest text-stone-400 uppercase">
              Tu mano
            </h2>
            <ul className="grid grid-cols-5 gap-1 text-center font-mono text-xs">
              {RESOURCES.map((resource) => (
                <li
                  key={`${resource}-${gained.has(resource) ? rolls : 0}`}
                  className={`rounded bg-stone-800 px-1 py-1 ${gained.has(resource) ? 'gain-flash' : ''}`}
                >
                  <div className="text-[10px] text-stone-400">{RESOURCE_LABELS[resource]}</div>
                  <div className="text-base">{view.me.resources[resource]}</div>
                </li>
              ))}
            </ul>
            <p className="mt-1 text-xs text-stone-400">
              Piezas: {view.me.stock.roads} caminos · {view.me.stock.settlements} asentamientos ·{' '}
              {view.me.stock.cities} ciudades
            </p>
          </div>

          <DevCardPanel
            hand={view.me.devCards}
            deckLeft={view.devDeckCount}
            moves={view.legalMoves}
            onBuy={() => {
              send({ type: 'buyDevCard' });
            }}
            onPlay={onPlayCard}
          />

          <OfferPanel
            you={view.you}
            hand={view.me.resources}
            offers={view.tradeOffers}
            moves={view.legalMoves}
            nameOf={nameOf}
            players={view.players.map((player) => ({ id: player.id, name: player.name }))}
            onCreate={(give, want, to) => {
              send({ type: 'createOffer', give, want, to });
            }}
            onRespond={(offerId, response) => {
              send({ type: 'respondOffer', offerId, response });
            }}
            onCounter={(offerId, give, want) => {
              send({ type: 'counterOffer', offerId, give, want });
            }}
            onConfirm={(offerId, withPlayer) => {
              send({ type: 'confirmTrade', offerId, withPlayer });
            }}
            onCancel={(offerId) => {
              send({ type: 'cancelOffer', offerId });
            }}
          />

          <TradePanel
            rates={view.legalMoves.maritimeRates}
            hand={view.me.resources}
            bank={view.bank}
            enabled={view.phase.kind === 'main'}
            onTrade={(give, want) => {
              send({ type: 'maritimeTrade', give, want });
            }}
          />

          <Chat messages={chat} nameOf={nameOf} colorOf={colorOf} onSend={sendChat} />

          <EventLog events={events} you={view.you} nameOf={nameOf} debug={false} />
        </aside>
      </div>
    </main>
  );
}

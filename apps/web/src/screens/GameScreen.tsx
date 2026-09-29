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
import { ResourceChoiceModal } from '../components/ResourceChoiceModal.js';
import { OfferPanel } from '../components/OfferPanel.js';
import { TradePanel } from '../components/TradePanel.js';
import { Chat } from '../components/Chat.js';
import { Hand } from '../components/cards/Hand.js';
import { FlyingCards } from '../components/effects/FlyingCards.js';
import { RollOverlay } from '../components/effects/RollOverlay.js';
import { Toasts } from '../components/effects/Toasts.js';
import { TurnBanner, waitingFor } from '../components/TurnBanner.js';
import { RestartVote } from '../components/RestartVote.js';
import { EventLog } from '../components/EventLog.js';
import { PlayerList } from '../components/PlayerList.js';
import { RobberHint } from '../components/RobberHint.js';
import { DiceRoll } from '../components/DiceRoll.js';
import { isMuted, setMuted, sounds } from '../lib/sounds.js';
import { PLAYER_COLORS } from '../lib/playerColors.js';
import { RESOURCE_ICONS, TERRAIN_STYLES } from '../lib/terrainStyles.js';
import { SPEED_LABELS, speedScale, type AnimationSpeed } from '../lib/animation.js';
import { useGame } from '../store/gameStore.js';
import { readDebugFromUrl } from '../lib/seed.js';
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
  const proposeRestart = useGame((state) => state.proposeRestart);
  const voteRestart = useGame((state) => state.voteRestart);
  const chat = useGame((state) => state.chat);
  const sendChat = useGame((state) => state.sendChat);
  const effects = useGame((state) => state.effects);
  const animation = useGame((state) => state.animation);
  const setAnimation = useGame((state) => state.setAnimation);
  const pruneEffects = useGame((state) => state.pruneEffects);
  const [muted, setMutedState] = useState(isMuted);
  // The engine's own bookkeeping in the log, behind the flag that already
  // exists for board ids.
  const debugLog = readDebugFromUrl();

  const [choosing, setChoosing] = useState<'yearOfPlenty' | 'monopoly' | null>(null);
  /** Which hex the pointer is over while the robber is being placed. */
  const [hoveredHex, setHoveredHex] = useState<HexId | undefined>(undefined);
  const [pointer, setPointer] = useState({ x: 0, y: 0 });
  /** Whose longest route to trace on the board. */
  const [hoveredRoute, setHoveredRoute] = useState<PlayerId | undefined>(undefined);
  /** Whose buildings to ring, while picking somebody to rob. */
  const [hoveredVictim, setHoveredVictim] = useState<PlayerId | undefined>(undefined);
  /**
   * Cards picked from the hand. One selection serves both jobs it can have —
   * paying a discard and building an offer — because you are never doing both
   * at once.
   */
  const [picked, setPicked] = useState<Partial<ResourceBundle>>({});
  const [tab, setTab] = useState<'comercio' | 'chat' | 'registro'>('comercio');
  /**
   * How many messages had arrived when the chat tab was last open; unread is a
   * subtraction from that.
   */
  const [chatSeen, setChatSeen] = useState(0);

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

  /** A hex as somebody would say it out loud: "el bosque del 11". */
  const hexLabel = useCallback(
    (hex: string) => {
      const tile = view?.board.hexes[hex as HexId];
      if (!tile) return hex;
      const terrain = TERRAIN_STYLES[tile.terrain].label.toLowerCase();
      return tile.number === undefined ? `el ${terrain}` : `${terrain} del ${tile.number}`;
    },
    [view],
  );

  // Effects carry their own expiry; this is only the sweeper.
  useEffect(() => {
    const timer = window.setInterval(pruneEffects, 700);
    return () => {
      window.clearInterval(timer);
    };
  }, [pruneEffects]);

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

  const togglePicked = useCallback(
    (resource: Resource) => {
      setPicked((current) => {
        const held = view?.me.resources[resource] ?? 0;
        const next = (current[resource] ?? 0) + 1;
        // Clicking past the last copy wraps around to none, so a mis-click is
        // one more click to undo rather than a hunt for a minus button.
        return { ...current, [resource]: next > held ? 0 : next };
      });
    },
    [view],
  );

  const clearPicked = useCallback(() => {
    setPicked({});
  }, []);

  const onDiscard = useCallback(() => {
    send({ type: 'discard', cards: picked });
    setPicked({});
  }, [picked, send]);

  const myTurn = view?.currentPlayer === view?.you;

  useEffect(() => {
    if (!view) return;
    document.title = myTurn ? '¡Tu turno! · Tierra Austral' : 'Tierra Austral';
    return () => {
      document.title = 'Tierra Austral';
    };
  }, [myTurn, view]);

  useEffect(() => {
    // A short nudge when the turn lands on you, for the tab in the background.
    if (myTurn) sounds.turn();
  }, [myTurn]);

  if (!view) return null;

  // How many rolls have been seen, so the dice replay their tumble each time.
  const rolls = events.filter((event) => event.type === 'DiceRolled').length;

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

  const scale = speedScale(animation);
  // The newest roll, never an older one that has not faded yet.
  const roll = [...effects].reverse().find((effect) => effect.kind === 'roll');
  const pulsingHexes = effects
    .filter((effect) => effect.kind === 'produce')
    .flatMap((effect) => effect.grants.map((grant) => grant.hex as HexId));

  /** "+2 🌲 +1 🐑" over each player who just received something. */
  const gains = new Map<string, string>();
  for (const effect of effects) {
    if (effect.kind !== 'produce') continue;
    const perPlayer = new Map<string, Map<string, number>>();
    for (const grant of effect.grants) {
      const bundle = perPlayer.get(grant.player) ?? new Map<string, number>();
      bundle.set(grant.resource, (bundle.get(grant.resource) ?? 0) + grant.amount);
      perPlayer.set(grant.player, bundle);
    }
    for (const [playerId, bundle] of perPlayer) {
      gains.set(
        playerId,
        [...bundle.entries()]
          .map(([resource, amount]) => `+${amount} ${RESOURCE_ICONS[resource as Resource]}`)
          .join(' '),
      );
    }
  }

  const isMyTurn = view.currentPlayer === view.you;
  const pickedTotal = RESOURCES.reduce((sum, resource) => sum + (picked[resource] ?? 0), 0);
  const unreadChat = tab === 'chat' ? 0 : Math.max(0, chat.length - chatSeen);
  const owed = view.legalMoves.discardOwed;
  const blocked = room?.blockedBy;
  const canForce =
    room?.hostId === view.you && blocked !== undefined && now - blocked.since > FORCE_TURN_HINT_MS;

  return (
    <main
      className={`flex h-screen flex-col overflow-hidden bg-stone-900 text-stone-100 ${
        isMyTurn && scale > 0 ? 'turn-glow' : ''
      }`}
    >
      <header className="flex flex-wrap items-center gap-3 border-b border-chapa px-4 py-2">
        <h1 className="font-display text-xl tracking-tight text-guanaco">Tierra Austral</h1>
        <span className="font-display rounded-panel bg-chapa px-2 py-1 text-sm tracking-[0.2em]">
          {room?.code}
        </span>
        <DiceRoll dice={view.lastRoll} roll={rolls} />
        {error ? (
          <span className="rounded bg-bordo px-2 py-1 text-xs font-semibold">{error}</span>
        ) : null}

        <div className="ml-auto flex items-center gap-2">
          <label className="flex items-center gap-1 text-[11px] text-guanaco-apagado">
            <span className="sr-only">Velocidad de las animaciones</span>
            <select
              value={animation}
              onChange={(event) => {
                setAnimation(event.target.value as AnimationSpeed);
              }}
              className="rounded-panel bg-chapa px-1 py-1 text-xs"
            >
              {(['normal', 'fast', 'off'] as const).map((speed) => (
                <option key={speed} value={speed}>
                  {SPEED_LABELS[speed]}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            aria-pressed={muted}
            title={muted ? 'Sonido apagado' : 'Sonido prendido'}
            onClick={() => {
              const next = !muted;
              setMuted(next);
              setMutedState(next);
            }}
            className="rounded-panel bg-chapa px-2 py-1.5 text-sm hover:bg-chapa-alta"
          >
            {muted ? '🔇' : '🔊'}
          </button>
        </div>
      </header>

      <TurnBanner view={view} nameOf={nameOf} />

      <div className="relative flex min-h-0 flex-1 flex-col lg:flex-row">
        {roll ? (
          <RollOverlay
            dice={roll.dice}
            player={roll.player}
            nameOf={nameOf}
            seven={roll.dice[0] + roll.dice[1] === 7}
          />
        ) : null}
        <Toasts effects={effects} hexLabel={hexLabel} />
        <FlyingCards effects={effects} colorOf={colorOf} scale={scale} />

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
          className="relative min-h-[46vh] flex-1 p-2 pb-28"
          onMouseMove={(event) => {
            if (hoveredHex !== undefined) setPointer({ x: event.clientX, y: event.clientY });
          }}
        >
          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex flex-col items-center gap-1">
            {owed !== undefined ? (
              <div className="pointer-events-auto flex items-center gap-3 rounded-panel bg-lenga px-3 py-1.5 text-sm shadow-lg">
                <span className="font-semibold">
                  Descartá {owed} carta{owed === 1 ? '' : 's'} — elegiste {pickedTotal}
                </span>
                <button
                  type="button"
                  disabled={pickedTotal !== owed}
                  onClick={onDiscard}
                  className="rounded-panel bg-guanaco px-2 py-1 text-xs font-semibold text-noche disabled:opacity-40"
                >
                  Descartar
                </button>
              </div>
            ) : pickedTotal > 0 ? (
              <div className="pointer-events-auto flex items-center gap-3 rounded-panel bg-chapa px-3 py-1 text-xs shadow-lg">
                <span>Elegiste {pickedTotal} para ofertar</span>
                <button
                  type="button"
                  onClick={clearPicked}
                  className="rounded-panel bg-chapa-alta px-2 py-0.5 font-semibold"
                >
                  Soltar
                </button>
              </div>
            ) : null}

            <Hand
              hand={view.me.resources}
              selected={picked}
              onToggle={togglePicked}
              selectable={owed !== undefined || (isMyTurn && view.phase.kind === 'main')}
            />
          </div>

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
              pulsingHexes,
              markedVertices,
              markedEdges,
            }}
          />
        </section>

        {hoveredHex !== undefined ? (
          <RobberHint view={view} hex={hoveredHex} at={pointer} nameOf={nameOf} />
        ) : null}

        <aside className="flex w-full flex-col gap-3 overflow-y-auto border-t border-chapa bg-noche p-3 text-sm lg:w-[21rem] lg:min-w-[21rem] lg:border-t-0 lg:border-l">
          {/* 1. What the game is waiting for, and the buttons that answer it. */}
          <section className="rounded-panel bg-chapa p-2">
            <p className="font-display text-[15px] leading-tight">{waitingFor(view, nameOf)}</p>

            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  send({ type: 'rollDice' });
                }}
                disabled={!view.legalMoves.canRoll}
                className="rounded-panel bg-estepa px-3 py-1.5 text-sm font-semibold text-noche disabled:bg-chapa-alta disabled:text-guanaco-apagado"
              >
                Tirar dados
              </button>
              <button
                type="button"
                onClick={() => {
                  send({ type: 'endTurn' });
                }}
                disabled={!view.legalMoves.canEndTurn}
                className="rounded-panel bg-guanaco px-3 py-1.5 text-sm font-semibold text-noche disabled:bg-chapa-alta disabled:text-guanaco-apagado"
              >
                Terminar turno
              </button>
              {blocked ? (
                <button
                  type="button"
                  disabled={!canForce}
                  onClick={forceTurn}
                  title={canForce ? '' : 'Hay que esperar 2 minutos'}
                  className="rounded-panel bg-chapa-alta px-2 py-1.5 text-xs font-semibold disabled:opacity-40"
                >
                  Forzar turno de {nameOf(blocked.playerId)}
                </button>
              ) : null}
            </div>

            {view.legalMoves.stealTargets.length > 0 ? (
              <div className="mt-2">
                <p className="text-[11px] text-guanaco-apagado">A quién le robás</p>
                <div className="mt-1 flex flex-wrap gap-2">
                  {view.legalMoves.stealTargets.map((target) => {
                    const victim = view.players.find((player) => player.id === target);
                    return (
                      <button
                        key={target}
                        type="button"
                        onClick={() => {
                          send({ type: 'steal', target });
                        }}
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
                        className="rounded-panel bg-lenga px-2 py-1 text-xs font-semibold"
                      >
                        {nameOf(target)} · {victim?.resourceCount ?? 0} cartas
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}

            <p className="mt-2 text-[11px] text-guanaco-apagado">
              Te quedan {view.me.stock.roads} caminos · {view.me.stock.settlements} pueblos ·{' '}
              {view.me.stock.cities} ciudades
            </p>
          </section>

          {room ? (
            <RestartVote
              room={room}
              you={view.you}
              nameOf={nameOf}
              onPropose={proposeRestart}
              onVote={voteRestart}
              now={now}
            />
          ) : null}

          {/* 2. Who is playing. */}
          <section>
            <h2 className="mb-1 text-[13px] font-semibold text-guanaco">Jugadores</h2>
            <PlayerList
              view={view}
              connected={(id) =>
                room?.seats.find((seat) => seat.playerId === id)?.connected ?? true
              }
              onHoverRoute={setHoveredRoute}
              gains={gains}
            />
          </section>

          {/* 3. Everything that can wait, behind tabs. */}
          <section className="flex min-h-0 flex-1 flex-col">
            <div className="mb-2 flex gap-1">
              {(['comercio', 'chat', 'registro'] as const).map((name) => (
                <button
                  key={name}
                  type="button"
                  onClick={() => {
                    setTab(name);
                    if (name === 'chat') setChatSeen(chat.length);
                  }}
                  className={`flex-1 rounded-panel px-2 py-1 text-xs font-semibold capitalize ${
                    tab === name ? 'bg-chapa-alta text-guanaco' : 'bg-chapa text-guanaco-apagado'
                  }`}
                >
                  {name}
                  {name === 'chat' && unreadChat > 0 ? (
                    <span className="ml-1 rounded-full bg-estepa px-1 text-[10px] text-noche">
                      {unreadChat}
                    </span>
                  ) : null}
                </button>
              ))}
            </div>

            {tab === 'comercio' ? (
              <div className="flex flex-col gap-3">
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
                  give={picked}
                  onClearGive={clearPicked}
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
              </div>
            ) : tab === 'chat' ? (
              <Chat messages={chat} nameOf={nameOf} colorOf={colorOf} onSend={sendChat} />
            ) : (
              <EventLog
                events={events}
                you={view.you}
                context={{ nameOf, hexLabel }}
                debug={debugLog}
              />
            )}
          </section>
        </aside>
      </div>
    </main>
  );
}

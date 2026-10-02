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
import { BankPanel } from '../components/trade/BankPanel.js';
import { OfferEditor } from '../components/trade/OfferEditor.js';
import { OfferList } from '../components/trade/OfferList.js';
import { emptyPick, type Pick } from '../components/trade/ResourceStepper.js';
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
import { LeaveButton } from '../components/LeaveButton.js';
import { RulesButton } from '../components/Rules.js';
import { CodeText, EyeButton, useHiddenCode } from '../components/RoomCode.js';
import { CostColumn } from '../components/CostColumn.js';
import { DiceDock } from '../components/DiceDock.js';
import { GameSettings, SETTINGS, useSetting } from '../components/GameSettings.js';
import { TourRunner } from '../components/TourRunner.js';
import { WELCOME_TOUR } from '../lib/tour.js';
import { isMuted, setMuted, sounds } from '../lib/sounds.js';
import { PLAYER_COLORS } from '../lib/playerColors.js';
import { RESOURCE_ICONS, TERRAIN_STYLES } from '../lib/terrainStyles.js';
import { speedScale } from '../lib/animation.js';
import { BOARD_MODE_LABELS } from '../lib/boardModes.js';
import { useGame } from '../store/gameStore.js';
import { useBoardHover } from '../lib/useBoardHover.js';
import { WIDE_ENOUGH, useMediaQuery } from '../lib/useMediaQuery.js';
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
  const chatSeen = useGame((state) => state.chatSeen);
  const markChatSeen = useGame((state) => state.markChatSeen);
  const effects = useGame((state) => state.effects);
  const animation = useGame((state) => state.animation);
  const setAnimation = useGame((state) => state.setAnimation);
  const pruneEffects = useGame((state) => state.pruneEffects);
  const [muted, setMutedState] = useState(isMuted);
  const hiddenCode = useHiddenCode();
  const wide = useMediaQuery(WIDE_ENOUGH);
  const hexIcons = useSetting(SETTINGS.hexIcons);
  // The engine's own bookkeeping in the log, behind the flag that already
  // exists for board ids.
  const debugLog = readDebugFromUrl();

  const [choosing, setChoosing] = useState<'yearOfPlenty' | 'monopoly' | null>(null);
  /**
   * Everything the board highlights on hover, with one owner.
   *
   * Keyed on the phase and whose turn it is, which is what makes the thing
   * being hovered stop existing.
   */
  const hover = useBoardHover(`${view?.phase.kind ?? '-'}:${view?.currentPlayer ?? '-'}`);
  const hoveredHex = hover.hex;
  const hoveredRoute = hover.route;
  const hoveredVictim = hover.victim;
  /**
   * Cards picked from the hand. One selection serves both jobs it can have —
   * paying a discard and building an offer — because you are never doing both
   * at once.
   */
  const [picked, setPicked] = useState<Partial<ResourceBundle>>({});
  const [tab, setTab] = useState<'cartas' | 'comercio' | 'chat' | 'registro'>('cartas');
  const [tradeWith, setTradeWith] = useState<'jugadores' | 'banco'>('jugadores');
  /** The offer being answered with a counter, and the sides already swapped. */
  const [countering, setCountering] = useState<string | null>(null);
  const [counterPreset, setCounterPreset] = useState<
    { give: Pick; want: Pick; to: string } | undefined
  >(undefined);

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
      // Cleared here as well as on the phase change: the element that would
      // have fired a mouseleave is about to stop existing.
      hover.clear();
      send({ type: 'moveRobber', hex });
    },
    [send, hover],
  );

  /**
   * A tap on a candidate hex.
   *
   * There is no hover on a touch screen, so the first tap is the hover —
   * it shows who the hex would hurt — and the second one, on the same hex or
   * on the hint's own button, is the move.
   */
  const onHexTap = useCallback(
    (hex: HexId, at: { x: number; y: number }) => {
      if (hover.hex === hex && hover.byTouch) {
        onHex(hex);
        return;
      }
      hover.movePointer(at.x, at.y);
      hover.setHex(hex, true);
    },
    [hover, onHex],
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

  /**
   * Answering an offer with one of your own.
   *
   * The sides swap: what they asked for is what you would be giving. Filled
   * in rather than blank, because a counteroffer is almost always a nudge to
   * an offer that was nearly right.
   */
  const startCounter = useCallback(
    (offer: {
      id: string;
      from: string;
      give: Partial<ResourceBundle>;
      want: Partial<ResourceBundle>;
    }) => {
      const fill = (bundle: Partial<ResourceBundle>): Pick => {
        const pick = emptyPick();
        for (const resource of RESOURCES) pick[resource] = bundle[resource] ?? 0;
        return pick;
      };
      setCountering(offer.id);
      setCounterPreset({ give: fill(offer.want), want: fill(offer.give), to: offer.from });
      setTab('comercio');
      setTradeWith('jugadores');
    },
    [],
  );

  const onDiscard = useCallback(() => {
    send({ type: 'discard', cards: picked });
    setPicked({});
  }, [picked, send]);

  const myTurn = view?.currentPlayer === view?.you;
  /** An offer waiting on your answer: the same kind of "you are up" as a turn. */
  const waiting = (view?.tradeOffers ?? []).some(
    (offer) => offer.responses[view?.you ?? ''] === 'pending',
  );

  useEffect(() => {
    // The same short nudge as a turn landing on you, for the same reason.
    if (waiting) sounds.turn();
  }, [waiting]);

  useEffect(() => {
    if (!view) return;
    document.title = myTurn || waiting ? '¡Tu turno! · Tierra Austral' : 'Tierra Austral';
    return () => {
      document.title = 'Tierra Austral';
    };
  }, [myTurn, waiting, view]);

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
  const phase = view.phase.kind;
  const inSetup = phase === 'setup';
  /**
   * Where the game is up to, in the words people use at the table.
   *
   * The number comes from the engine, not from counting events here: a reload
   * arrives with no history to count (SPEC.md §6).
   */
  const whereWeAre =
    view.phase.kind === 'setup'
      ? `Preparación · ${view.phase.round === 1 ? 'ida' : 'vuelta'}`
      : `Ronda ${view.round}`;
  const pickedTotal = RESOURCES.reduce((sum, resource) => sum + (picked[resource] ?? 0), 0);
  const unreadChat = tab === 'chat' ? 0 : Math.max(0, chat.length - chatSeen);
  /** Offers somebody is making to you, which are the ones that need an answer. */
  const incoming = view.tradeOffers.filter((offer) => offer.from !== view.you);
  const owed = view.legalMoves.discardOwed;
  const blocked = room?.blockedBy;
  const canForce =
    room?.hostId === view.you && blocked !== undefined && now - blocked.since > FORCE_TURN_HINT_MS;

  const dock = (
    <DiceDock
      dice={view.lastRoll}
      roll={rolls}
      phase={view.phase.kind}
      moves={view.legalMoves}
      onRoll={() => {
        send({ type: 'rollDice' });
      }}
      onEndTurn={() => {
        send({ type: 'endTurn' });
      }}
      setupHint={waitingFor(view, nameOf)}
      urgent={isMyTurn && owed === undefined}
    />
  );

  return (
    <main
      className={`flex h-dvh flex-col overflow-hidden bg-stone-900 text-stone-100 ${
        isMyTurn && scale > 0 ? 'turn-glow' : ''
      }`}
    >
      <TourRunner
        tour={WELCOME_TOUR}
        busy={choosing !== null || owed !== undefined || roll !== undefined}
        tips={{
          seven: view.lastRoll !== undefined && view.lastRoll[0] + view.lastRoll[1] === 7,
          robber: view.phase.kind === 'moveRobber' && isMyTurn,
          offer: incoming.length > 0,
          canBuild: isMyTurn && phase === 'main' && view.legalMoves.canAfford.settlement,
          devCard: view.me.devCards.length > 0,
        }}
      />

      <header className="flex flex-wrap items-center gap-2.5 border-b border-chapa px-3 py-1.5">
        <h1 className="font-display text-lg tracking-tight text-guanaco">Tierra Austral</h1>
        <span className="font-display flex items-center gap-1 rounded-panel bg-chapa px-2 py-0.5 text-[13px] tracking-[0.2em]">
          <CodeText code={room?.code ?? ''} hidden={hiddenCode.hidden} />
          <EyeButton hidden={hiddenCode.hidden} onToggle={hiddenCode.toggle} className="-mr-1" />
        </span>
        <span
          title="Una ronda es una vuelta completa a la mesa"
          className="font-display rounded-panel bg-chapa px-2 py-0.5 text-[13px]"
        >
          {whereWeAre}
        </span>
        <span
          title="Cómo se armó este tablero"
          className="rounded-panel bg-chapa px-2 py-0.5 text-[13px] text-guanaco-apagado"
        >
          {BOARD_MODE_LABELS[view.boardMode]}
        </span>
        <TurnBanner view={view} nameOf={nameOf} />
        {error ? (
          <span className="rounded bg-bordo px-2 py-1 text-[13px] font-semibold">{error}</span>
        ) : null}

        <div className="ml-auto flex items-center gap-2">
          <RulesButton />
          <LeaveButton from="game" />
          <GameSettings
            animation={animation}
            onAnimation={setAnimation}
            muted={muted}
            onMuted={(next) => {
              setMutedState(next);
              setMuted(next);
            }}
          />
        </div>
      </header>

      {/* Stacked on a phone, the children must not shrink below their own
          content: a flex item that does spills out of itself and paints over
          whatever comes next. The column scrolls instead. Side by side from
          `lg` up, each panel scrolls on its own and the page never does. */}
      <div className="relative flex min-h-0 flex-1 flex-col overflow-y-auto lg:flex-row lg:overflow-hidden">
        {/* The left edge was empty. What goes there is the one thing you look
            up mid-turn and cannot get from the board. */}
        <CostColumn canAfford={view.legalMoves.canAfford} stock={view.me.stock} />

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
          className="relative flex shrink-0 flex-col px-2 py-1 lg:min-h-0 lg:w-0 lg:min-w-0 lg:flex-1"
          onPointerLeave={() => {
            if (!hover.byTouch) hover.clear();
          }}
          onMouseMove={(event) => {
            if (hoveredHex !== undefined && !hover.byTouch) {
              hover.movePointer(event.clientX, event.clientY);
            }
          }}
        >
          {/* The board takes whatever is left once the hand has its band. The
              hand is a row of the column, not something floating over the
              board: sat on top of it, the fan's outer cards hung past the
              bottom edge and the window cut them in half. */}
          <div data-tour="board" className="relative min-h-[38vh] flex-1 lg:min-h-0">
            <Board
              board={view.board}
              robberHex={view.robberHex}
              debug={false}
              icons={hexIcons}
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
                onHexHover: hover.setHex,
                onHexTap,
                pulsingHexes,
                markedVertices,
                markedEdges,
              }}
            />
          </div>

          {/* Bottom-left of the board, over it rather than inside the costs
              column — that one collapses to a tab and then to a drawer, and
              the dice have to stay put. Rendered once: two copies would mean
              two elements answering to the same `data-tour` anchor. */}
          {wide ? (
            <div className="pointer-events-none absolute bottom-2 left-3 z-20 w-[230px]">
              {dock}
            </div>
          ) : null}

          {/* Padded past the dock so the hand centres in what is left of the
              board rather than under the dice. */}
          <div
            data-tour="hand"
            className="pointer-events-none z-10 flex min-w-0 shrink-0 flex-col items-center gap-1 lg:pl-[240px]"
          >
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

          {/* Under 1024 there is no room beside the board, so the dock
              becomes a bar with the main button across the full width. */}
          {wide ? null : <div className="mt-1">{dock}</div>}
        </section>

        {hoveredHex !== undefined ? (
          <RobberHint
            view={view}
            hex={hoveredHex}
            at={hover.pointer}
            nameOf={nameOf}
            {...(hover.byTouch
              ? {
                  onConfirm: () => {
                    onHex(hoveredHex);
                  },
                }
              : {})}
          />
        ) : null}

        <aside className="flex w-full shrink-0 flex-col gap-3 border-t border-chapa bg-noche p-3 text-sm lg:w-[21rem] lg:min-w-[21rem] lg:overflow-y-auto lg:border-t-0 lg:border-l">
          {/* 1. The buttons that answer whatever the top bar is asking for.
              The sentence itself lives there and only there — and when there
              is nothing to press, the panel is not there either. An empty
              strip of chrome reads as something that failed to load. */}
          <section data-tour="turn-instruction" className="rounded-panel bg-chapa p-2">
            {/* The phase's instruction, and nothing you could press: the
                dice and the one big button live in the dock, and having them
                here too was two of each. */}
            <p className="font-display text-[15px] leading-snug text-guanaco">
              {waitingFor(view, nameOf)}
            </p>

            <div className="mt-2 flex flex-wrap gap-2">
              {blocked ? (
                <button
                  type="button"
                  disabled={!canForce}
                  onClick={forceTurn}
                  title={canForce ? '' : 'Hay que esperar 2 minutos'}
                  className="rounded-panel bg-chapa-alta px-2 py-1.5 text-[13px] font-semibold disabled:opacity-40"
                >
                  Forzar turno de {nameOf(blocked.playerId)}
                </button>
              ) : null}
            </div>

            {view.legalMoves.stealTargets.length > 0 ? (
              <div className="mt-2">
                <p className="text-[13px] text-guanaco-apagado">A quién le robás</p>
                <div className="mt-1 flex flex-wrap gap-2">
                  {view.legalMoves.stealTargets.map((target) => {
                    const victim = view.players.find((player) => player.id === target);
                    return (
                      <button
                        key={target}
                        type="button"
                        onClick={() => {
                          // Same hole as the robber: these buttons unmount
                          // the moment one is pressed.
                          hover.clear();
                          send({ type: 'steal', target });
                        }}
                        onMouseEnter={() => {
                          hover.setVictim(target);
                        }}
                        onMouseLeave={() => {
                          hover.setVictim(undefined);
                        }}
                        onFocus={() => {
                          hover.setVictim(target);
                        }}
                        onBlur={() => {
                          hover.setVictim(undefined);
                        }}
                        className="rounded-panel bg-lenga px-2 py-1 text-[13px] font-semibold"
                      >
                        {nameOf(target)} · {victim?.resourceCount ?? 0} cartas
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </section>

          {/* An offer aimed at you is a decision waiting on you, so it goes
              at the top of the panel rather than inside a tab you might not
              have open. */}
          {incoming.length > 0 ? (
            <div data-tour="incoming-offer">
              <h2 className="mb-1 text-[13px] font-semibold text-estepa">
                Te ofrecen {incoming.length === 1 ? 'un cambio' : `${incoming.length} cambios`}
              </h2>
              <OfferList
                you={view.you}
                offers={view.tradeOffers}
                moves={view.legalMoves}
                nameOf={nameOf}
                colorOf={colorOf}
                mine={false}
                onRespond={(offerId, response) => {
                  send({ type: 'respondOffer', offerId, response });
                }}
                onConfirm={(offerId, withPlayer) => {
                  send({ type: 'confirmTrade', offerId, withPlayer });
                }}
                onCancel={(offerId) => {
                  send({ type: 'cancelOffer', offerId });
                }}
                onCounter={startCounter}
              />
            </div>
          ) : null}

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
          <section data-tour="players">
            <h2 className="mb-1 text-[13px] font-semibold text-guanaco">Jugadores</h2>
            <PlayerList
              youAreHost={room?.hostId === view.you}
              view={view}
              connected={(id) =>
                room?.seats.find((seat) => seat.playerId === id)?.connected ?? true
              }
              onHoverRoute={hover.setRoute}
              gains={gains}
            />
          </section>

          {/* 3. Everything that can wait, behind tabs. */}
          <section className="flex min-h-0 flex-1 flex-col">
            <div data-tour="tabs" className="mb-2 flex gap-1">
              {(['cartas', 'comercio', 'chat', 'registro'] as const).map((name) => (
                <button
                  key={name}
                  type="button"
                  title={name === 'cartas' ? 'Cartas de desarrollo' : undefined}
                  onClick={() => {
                    setTab(name);
                    // Leaving the tab also settles what was read while it was open.
                    if (name === 'chat' || tab === 'chat') markChatSeen();
                  }}
                  className={`flex-1 rounded-panel px-1.5 py-1 text-[13px] font-semibold capitalize ${
                    tab === name ? 'bg-chapa-alta text-guanaco' : 'bg-chapa text-guanaco-apagado'
                  }`}
                >
                  {name}
                  {name === 'comercio' && incoming.length > 0 ? (
                    <span className="ml-1 rounded-full bg-estepa px-1 text-[12px] text-noche">
                      {incoming.length}
                    </span>
                  ) : null}
                  {name === 'chat' && unreadChat > 0 ? (
                    <span className="ml-1 rounded-full bg-estepa px-1 text-[12px] text-noche">
                      {unreadChat}
                    </span>
                  ) : null}
                </button>
              ))}
            </div>

            {/* Trading and dev cards are both meaningless while the board is
                being set up, so the tabs say so once instead of showing three
                panels of dead buttons. */}
            {inSetup && (tab === 'cartas' || tab === 'comercio') ? (
              <p className="rounded-panel bg-chapa p-3 text-[13px] text-guanaco-apagado">
                Disponible cuando arranque la partida
              </p>
            ) : tab === 'cartas' ? (
              <DevCardPanel
                hand={view.me.devCards}
                deckLeft={view.devDeckCount}
                moves={view.legalMoves}
                onBuy={() => {
                  send({ type: 'buyDevCard' });
                }}
                onPlay={onPlayCard}
              />
            ) : tab === 'comercio' ? (
              <div className="flex flex-col gap-3">
                {/* Two tabs over one panel: trading with a person and with
                    the bank are the same question asked of someone else. */}
                <div className="flex gap-1">
                  {(['jugadores', 'banco'] as const).map((which) => (
                    <button
                      key={which}
                      type="button"
                      onClick={() => {
                        setTradeWith(which);
                      }}
                      className={`flex-1 rounded-panel px-2 py-1 text-[13px] font-semibold capitalize ${
                        tradeWith === which
                          ? 'bg-chapa-alta text-guanaco'
                          : 'bg-chapa text-guanaco-apagado'
                      }`}
                    >
                      {which}
                    </button>
                  ))}
                </div>

                {tradeWith === 'banco' ? (
                  <BankPanel
                    rates={view.legalMoves.maritimeRates}
                    hand={view.me.resources}
                    bank={view.bank}
                    enabled={view.phase.kind === 'main' && view.currentPlayer === view.you}
                    onTrade={(give, want) => {
                      send({ type: 'maritimeTrade', give, want });
                    }}
                  />
                ) : (
                  <>
                    <OfferEditor
                      view={view}
                      onSend={(give, want, to) => {
                        if (countering) {
                          send({ type: 'counterOffer', offerId: countering, give, want });
                          setCountering(null);
                        } else {
                          send({ type: 'createOffer', give, want, to });
                        }
                      }}
                      onClose={() => {
                        setCountering(null);
                      }}
                      {...(counterPreset === undefined
                        ? {}
                        : { preset: counterPreset, title: 'Tu contraoferta' })}
                    />

                    <OfferList
                      you={view.you}
                      offers={view.tradeOffers}
                      moves={view.legalMoves}
                      nameOf={nameOf}
                      colorOf={colorOf}
                      mine
                      onRespond={(offerId, response) => {
                        send({ type: 'respondOffer', offerId, response });
                      }}
                      onConfirm={(offerId, withPlayer) => {
                        send({ type: 'confirmTrade', offerId, withPlayer });
                      }}
                      onCancel={(offerId) => {
                        send({ type: 'cancelOffer', offerId });
                      }}
                      onCounter={startCounter}
                    />
                  </>
                )}
              </div>
            ) : tab === 'chat' ? (
              // The tab is the toggle, and the badge on it is the unread mark,
              // so the panel does not need a second one inside.
              <Chat
                messages={chat}
                nameOf={nameOf}
                colorOf={colorOf}
                onSend={sendChat}
                collapsible={false}
                height="max-h-64"
              />
            ) : (
              <EventLog
                events={events}
                you={view.you}
                turn={view.turn}
                players={view.turnOrder.length}
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

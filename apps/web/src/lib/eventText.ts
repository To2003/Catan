import {
  RESOURCES,
  type DevCard,
  type GameEvent,
  type PlayerId,
  type ResourceBundle,
} from '@tierra-austral/engine';
import { RESOURCE_ICONS, RESOURCE_LABELS } from './terrainStyles.js';

/**
 * Events, written for the people playing.
 *
 * The log used to read like the engine's own vocabulary — "Fase: moveRobber",
 * "mueve el ladrón de h9 a h14" — which is exactly what a player cannot use.
 * Hexes get called by what they look like on the table, phases stay out of the
 * way unless you asked for them, and every line starts with an icon so the
 * column can be skimmed.
 */

export const DEV_CARD_LABELS: Record<DevCard, string> = {
  knight: 'Caballero',
  vp: 'Punto de victoria',
  roadBuilding: 'Construcción de caminos',
  yearOfPlenty: 'Año de abundancia',
  monopoly: 'Monopolio',
};

const describeBundle = (bundle: Partial<Readonly<ResourceBundle>>): string => {
  const parts = RESOURCES.filter((resource) => (bundle[resource] ?? 0) > 0).map(
    (resource) => `${bundle[resource] ?? 0} ${RESOURCE_ICONS[resource]}`,
  );
  return parts.length > 0 ? parts.join(' + ') : '—';
};

export interface LogLine {
  readonly icon: string;
  readonly text: string;
  /** Phase changes and other machinery: hidden unless the debug flag is on. */
  readonly internal?: boolean;
}

export interface LogContext {
  readonly nameOf: (playerId: PlayerId) => string;
  /** A hex as a person would name it: "el bosque del 11". */
  readonly hexLabel: (hex: string) => string;
}

export const eventLine = (event: GameEvent, { nameOf, hexLabel }: LogContext): LogLine => {
  switch (event.type) {
    case 'SetupSettlementPlaced':
      return { icon: '🏠', text: `${nameOf(event.player)} fundó un pueblo` };
    case 'SetupRoadPlaced':
      return { icon: '🛤', text: `${nameOf(event.player)} trazó su primer camino` };
    case 'SetupResourcesGranted':
      return {
        icon: '🎁',
        text:
          event.grants.length === 0
            ? `${nameOf(event.player)} no cobró nada por su segundo pueblo`
            : `${nameOf(event.player)} cobró ${describeBundle(
                event.grants.reduce<Partial<ResourceBundle>>((total, grant) => {
                  total[grant.resource] = (total[grant.resource] ?? 0) + grant.amount;
                  return total;
                }, {}),
              )}`,
      };

    case 'DiceRolled':
      return {
        icon: '🎲',
        text: `${nameOf(event.player)} tiró ${event.dice[0]} + ${event.dice[1]} = ${event.total}`,
      };

    case 'ResourcesProduced': {
      const byPlayer = new Map<PlayerId, Partial<ResourceBundle>>();
      for (const grant of event.grants) {
        const bundle = byPlayer.get(grant.player) ?? {};
        bundle[grant.resource] = (bundle[grant.resource] ?? 0) + grant.amount;
        byPlayer.set(grant.player, bundle);
      }
      return {
        icon: '🌾',
        text: [...byPlayer.entries()]
          .map(([playerId, bundle]) => `${nameOf(playerId)} ${describeBundle(bundle)}`)
          .join(' · '),
      };
    }

    case 'ProductionSkipped':
      return event.reason === 'robber'
        ? { icon: '🦹', text: `El ladrón bloqueó ${hexLabel(event.hex)}` }
        : {
            icon: '🏦',
            text: `El banco se quedó sin ${RESOURCE_LABELS[event.resource].toLowerCase()}: nadie cobró`,
          };

    case 'DiscardRequired':
      return {
        icon: '💀',
        text: `Salió 7 y descartan ${Object.entries(event.pending)
          .map(([playerId, count]) => `${nameOf(playerId)} (${count})`)
          .join(', ')}`,
      };
    case 'CardsDiscarded':
      return { icon: '🗑', text: `${nameOf(event.player)} descartó ${event.count} cartas` };
    case 'DiscardDetail':
      return { icon: '🗑', text: `Descartaste ${describeBundle(event.cards)}`, internal: false };

    case 'RobberMoved':
      return {
        icon: '🦹',
        text: `${nameOf(event.player)} movió el ladrón a ${hexLabel(event.to)}`,
      };
    case 'StealSkipped':
      return { icon: '🤷', text: 'No había a quién robarle' };
    case 'StealResolved':
      return {
        icon: '🂠',
        text: `${nameOf(event.thief)} le robó una carta a ${nameOf(event.victim)}`,
      };
    case 'ResourceStolen':
      return {
        icon: '👀',
        text: `La carta fue ${RESOURCE_LABELS[event.resource].toLowerCase()} ${
          RESOURCE_ICONS[event.resource]
        }`,
      };

    case 'RoadPlaced':
      return { icon: '🛤', text: `${nameOf(event.player)} construyó un camino` };
    case 'BuildingPlaced':
      return { icon: '🏠', text: `${nameOf(event.player)} construyó un pueblo` };
    case 'CityUpgraded':
      return { icon: '🏛', text: `${nameOf(event.player)} levantó una ciudad` };
    case 'ResourcesPaid':
      return { icon: '💸', text: `${nameOf(event.player)} pagó al banco`, internal: true };

    case 'MaritimeTraded':
      return {
        icon: '⛵',
        text: `${nameOf(event.player)} cambió ${event.gave} ${
          RESOURCE_ICONS[event.give]
        } por 1 ${RESOURCE_ICONS[event.want]} (${event.rate}:1)`,
      };

    case 'DevCardBought':
      return {
        icon: '🃏',
        text: `${nameOf(event.player)} compró una carta (quedan ${event.deckLeft})`,
      };
    case 'DevCardDrawn':
      return { icon: '👀', text: `Te tocó ${DEV_CARD_LABELS[event.card]}` };
    case 'DevCardPlayed':
      return { icon: '🃏', text: `${nameOf(event.player)} jugó ${DEV_CARD_LABELS[event.card]}` };
    case 'YearOfPlentyTaken':
      return {
        icon: '🎁',
        text: `${nameOf(event.player)} tomó ${event.resources
          .map((resource) => RESOURCE_ICONS[resource])
          .join(' + ')} del banco`,
      };
    case 'MonopolyResolved':
      return {
        icon: '💰',
        text: `${nameOf(event.player)} monopolizó ${RESOURCE_LABELS[
          event.resource
        ].toLowerCase()} y juntó ${event.total}`,
      };
    case 'RoadBuildingStarted':
      return { icon: '🛤', text: `${nameOf(event.player)} pone ${event.remaining} caminos gratis` };
    case 'RoadBuildingEnded':
      return { icon: '🛤', text: `Puso ${event.placed} camino(s) de la carta`, internal: true };

    case 'OfferCreated':
      return {
        icon: '🤝',
        text: `${nameOf(event.offer.from)} ofrece ${describeBundle(
          event.offer.give,
        )} por ${describeBundle(event.offer.want)}`,
      };
    case 'OfferResponded':
      return {
        icon: event.response === 'accept' ? '👍' : '👎',
        text: `${nameOf(event.player)} ${event.response === 'accept' ? 'acepta' : 'rechaza'}`,
      };
    case 'CounterOffered':
      return {
        icon: '🔁',
        text: `${nameOf(event.offer.from)} contraoferta ${describeBundle(
          event.offer.give,
        )} por ${describeBundle(event.offer.want)}`,
      };
    case 'OfferCancelled':
      return { icon: '✖', text: 'Se cayó una oferta', internal: true };
    case 'TradeConfirmed':
      return {
        icon: '🤝',
        text: `${nameOf(event.from)} y ${nameOf(event.with)} cerraron: ${describeBundle(
          event.give,
        )} por ${describeBundle(event.want)}`,
      };

    case 'LongestRoadChanged':
      return {
        icon: '🛣',
        text:
          event.owner === undefined
            ? 'El camino más largo quedó vacante'
            : `${nameOf(event.owner)} se lleva el camino más largo (${event.length} tramos)`,
      };
    case 'LargestArmyChanged':
      return {
        icon: '⚔',
        text: `${nameOf(event.owner)} se lleva el gran ejército (${event.knights} caballeros)`,
      };

    case 'PhaseChanged':
      return { icon: '⚙', text: `Fase: ${event.phase.kind}`, internal: true };
    case 'TurnEnded':
      return { icon: '⏭', text: `${nameOf(event.player)} terminó su turno`, internal: true };
    case 'PlayerLeft':
      return { icon: '🚪', text: `${nameOf(event.player)} abandonó la partida` };
    case 'GameWon':
      return {
        icon: '🏆',
        text: `¡Ganó ${nameOf(event.player)} con ${event.points} PV (${
          event.revealedVpCards
        } cartas escondidas)!`,
      };
  }
};

/** The one-line form, for places with no room for an icon column. */
export const eventText = (event: GameEvent, nameOf: (playerId: PlayerId) => string): string => {
  const line = eventLine(event, { nameOf, hexLabel: (hex) => hex });
  return `${line.icon} ${line.text}`;
};

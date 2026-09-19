import {
  RESOURCES,
  type GameEvent,
  type PlayerId,
  type ResourceBundle,
} from '@tierra-austral/engine';
import { RESOURCE_LABELS } from './terrainStyles.js';

const describeBundle = (bundle: Readonly<ResourceBundle>): string =>
  RESOURCES.filter((resource) => bundle[resource] > 0)
    .map((resource) => `${bundle[resource]} ${RESOURCE_LABELS[resource]}`)
    .join(', ');

/**
 * Engine events as a line of text for the debug log. Rough on purpose: this is
 * a tool, not the game log the players will read.
 */
export const eventText = (event: GameEvent, nameOf: (id: PlayerId) => string): string => {
  switch (event.type) {
    case 'SetupSettlementPlaced':
      return `${nameOf(event.player)} coloca un asentamiento en ${event.vertex}`;
    case 'SetupRoadPlaced':
      return `${nameOf(event.player)} coloca un camino en ${event.edge}`;
    case 'SetupResourcesGranted':
      return event.grants.length === 0
        ? `${nameOf(event.player)} no cobra nada por el segundo asentamiento`
        : `${nameOf(event.player)} cobra ${event.grants
            .map((grant) => `${grant.amount} ${RESOURCE_LABELS[grant.resource]}`)
            .join(', ')}`;
    case 'DiceRolled':
      return `${nameOf(event.player)} tira ${event.dice[0]} + ${event.dice[1]} = ${event.total}`;
    case 'ResourcesProduced':
      return `Producción: ${event.grants
        .map(
          (grant) => `${nameOf(grant.player)} +${grant.amount} ${RESOURCE_LABELS[grant.resource]}`,
        )
        .join(' · ')}`;
    case 'ProductionSkipped':
      return event.reason === 'robber'
        ? `El ladrón bloquea ${event.hex}`
        : `Al banco no le alcanza: nadie cobra ${RESOURCE_LABELS[event.resource]}`;
    case 'RoadPlaced':
      return `${nameOf(event.player)} construye un camino en ${event.edge}`;
    case 'BuildingPlaced':
      return `${nameOf(event.player)} construye un asentamiento en ${event.vertex}`;
    case 'CityUpgraded':
      return `${nameOf(event.player)} mejora a ciudad en ${event.vertex}`;
    case 'ResourcesPaid':
      return `${nameOf(event.player)} paga al banco`;
    case 'DiscardRequired':
      return `Sale un 7: descartan ${Object.entries(event.pending)
        .map(([id, count]) => `${nameOf(id)} (${count})`)
        .join(', ')}`;
    case 'CardsDiscarded':
      return `${nameOf(event.player)} descarta ${event.count} cartas`;
    case 'DiscardDetail':
      return `  ${nameOf(event.player)} descarta ${describeBundle(event.cards)}`;
    case 'RobberMoved':
      return `${nameOf(event.player)} mueve el ladrón de ${event.from} a ${event.to}`;
    case 'StealSkipped':
      return 'No hay a quién robarle';
    case 'StealResolved':
      return `${nameOf(event.thief)} le roba una carta a ${nameOf(event.victim)}`;
    case 'ResourceStolen':
      return `  La carta robada es ${RESOURCE_LABELS[event.resource]}`;
    case 'PhaseChanged':
      return `Fase: ${event.phase.kind}`;
    case 'TurnEnded':
      return `${nameOf(event.player)} termina su turno, sigue ${nameOf(event.next)}`;
    case 'GameWon':
      return `¡Gana ${nameOf(event.player)} con ${event.points} PV!`;
  }
};

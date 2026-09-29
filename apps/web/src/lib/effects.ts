import type { GameEvent, PlayerId, Resource } from '@tierra-austral/engine';

/**
 * Transient things to show on screen, derived from events the engine already
 * emits.
 *
 * Nothing here decides anything: an effect is a picture of something that has
 * already happened. They carry their own expiry so a slow render, a burst of
 * events or a tab left in the background can never leave one stuck.
 */
export type Effect =
  | { kind: 'roll'; id: number; until: number; player: PlayerId; dice: readonly [number, number] }
  | {
      kind: 'produce';
      id: number;
      until: number;
      grants: readonly { player: PlayerId; resource: Resource; amount: number; hex: string }[];
    }
  | { kind: 'blocked'; id: number; until: number; hex: string }
  | { kind: 'scarcity'; id: number; until: number; resource: Resource }
  | { kind: 'seven'; id: number; until: number; pending: Readonly<Record<PlayerId, number>> }
  | {
      kind: 'steal';
      id: number;
      until: number;
      thief: PlayerId;
      victim: PlayerId;
      resource?: Resource;
    }
  | { kind: 'trade'; id: number; until: number; from: PlayerId; with: PlayerId }
  | { kind: 'bonus'; id: number; until: number; text: string };

/** How long each kind stays on screen at normal speed, in milliseconds. */
const LIFETIME: Record<Effect['kind'], number> = {
  roll: 2200,
  produce: 1800,
  blocked: 3500,
  scarcity: 5000,
  seven: 3500,
  steal: 2600,
  trade: 2200,
  bonus: 4000,
};

let nextId = 1;

/** An effect before it is given an identity and an expiry. */
type NewEffect = {
  [K in Effect['kind']]: Omit<Extract<Effect, { kind: K }>, 'id' | 'until'>;
}[Effect['kind']];

/**
 * Turns a batch of events into effects.
 *
 * `scale` is the animation speed: at zero the list comes back empty, so
 * "sin animaciones" costs nothing rather than rendering invisible work.
 */
export const effectsFrom = (
  events: readonly GameEvent[],
  you: PlayerId,
  scale: number,
  now = Date.now(),
): Effect[] => {
  if (scale === 0) return [];

  const born: Effect[] = [];
  const add = (effect: NewEffect): void => {
    born.push({ ...effect, id: nextId++, until: now + LIFETIME[effect.kind] * scale });
  };

  for (const event of events) {
    switch (event.type) {
      case 'DiceRolled':
        add({ kind: 'roll', player: event.player, dice: event.dice });
        break;

      case 'ResourcesProduced':
      case 'SetupResourcesGranted':
        if (event.grants.length > 0) {
          add({
            kind: 'produce',
            grants: event.grants.map((grant) => ({
              player: grant.player,
              resource: grant.resource,
              amount: grant.amount,
              hex: grant.hex,
            })),
          });
        }
        break;

      case 'ProductionSkipped':
        if (event.reason === 'robber') add({ kind: 'blocked', hex: event.hex });
        else add({ kind: 'scarcity', resource: event.resource });
        break;

      case 'DiscardRequired':
        add({ kind: 'seven', pending: event.pending });
        break;

      case 'StealResolved':
        add({ kind: 'steal', thief: event.thief, victim: event.victim });
        break;

      case 'ResourceStolen':
        // Only the two of them get the private event, so only they see which
        // card it was; everybody else keeps the anonymous one above.
        if (event.thief === you || event.victim === you) {
          add({
            kind: 'steal',
            thief: event.thief,
            victim: event.victim,
            resource: event.resource,
          });
        }
        break;

      case 'TradeConfirmed':
        add({ kind: 'trade', from: event.from, with: event.with });
        break;

      case 'LongestRoadChanged':
        add({
          kind: 'bonus',
          text:
            event.owner === undefined
              ? 'El camino más largo queda vacante'
              : `Camino más largo: ${event.length} tramos`,
        });
        break;

      case 'LargestArmyChanged':
        add({ kind: 'bonus', text: `Gran ejército: ${event.knights} caballeros` });
        break;

      default:
        break;
    }
  }

  return born;
};

/** Drops what has already had its moment. */
export const stillAlive = (effects: readonly Effect[], now = Date.now()): Effect[] =>
  effects.filter((effect) => effect.until > now);

/**
 * Kinds where only the newest one makes sense on screen.
 *
 * Two rolls can overlap when turns go quickly, and showing the older one is
 * worse than showing none: the dice in the middle of the board would be
 * announcing a number that is no longer the one being played.
 */
const ONLY_NEWEST: ReadonlySet<Effect['kind']> = new Set(['roll', 'seven']);

/** Merges a new batch over the live ones, replacing what cannot coexist. */
export const mergeEffects = (current: readonly Effect[], born: readonly Effect[]): Effect[] => {
  const replaced = new Set(
    born.filter((effect) => ONLY_NEWEST.has(effect.kind)).map((e) => e.kind),
  );
  return [...stillAlive(current).filter((effect) => !replaced.has(effect.kind)), ...born];
};

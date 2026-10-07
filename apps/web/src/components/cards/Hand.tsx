import { RESOURCES, type Resource, type ResourceBundle } from '@tierra-austral/engine';
import { CARD_HEIGHT, ResourceCard } from './ResourceCard.js';

interface HandProps {
  readonly hand: Readonly<ResourceBundle>;
  /** How many of each are picked right now, for discarding or offering. */
  readonly selected: Readonly<Partial<ResourceBundle>>;
  readonly onToggle: (resource: Resource) => void;
  /** Off while there is nothing to select for. */
  readonly selectable: boolean;
}

/** Above this many cards, identical ones stack instead of fanning out. */
const FAN_LIMIT = 12;

/**
 * The band the hand lives in, in pixels.
 *
 * Reserved by the layout rather than measured from the cards, but derived
 * from the card's own height so the two cannot drift: the card, plus room to
 * lift one up and to let the fan's outer cards drop. If the band were any
 * tighter the screen edge would cut the corner off the leftmost card, which
 * is exactly what used to happen.
 */
export const HAND_HEIGHT = CARD_HEIGHT + 36;

/** With nothing in hand there is nothing to reserve: one line, and the board gets the rest. */
export const EMPTY_HAND_HEIGHT = 22;

/**
 * Your hand, along the bottom of the board.
 *
 * It sits over the board rather than in the side panel because that is where
 * you are looking when you are deciding what to build. Few cards fan out one
 * by one; a big hand stacks by resource with a count, which is also how people
 * hold them.
 */
export function Hand({ hand, selected, onToggle, selectable }: HandProps) {
  const total = RESOURCES.reduce((sum, resource) => sum + hand[resource], 0);
  if (total === 0) {
    return (
      <div
        style={{ height: EMPTY_HAND_HEIGHT }}
        className="pointer-events-none flex items-center justify-center text-[13px] text-guanaco-apagado"
      >
        Sin cartas en la mano
      </div>
    );
  }

  const fanned = total <= FAN_LIMIT;
  const cards: { resource: Resource; runIndex: number; count?: number; key: string }[] = fanned
    ? RESOURCES.flatMap((resource) =>
        Array.from({ length: hand[resource] }, (_, index) => ({
          resource,
          runIndex: index,
          key: `${resource}-${index}`,
        })),
      )
    : RESOURCES.filter((resource) => hand[resource] > 0).map((resource) => ({
        resource,
        runIndex: 0,
        count: hand[resource],
        key: resource,
      }));

  const middle = (cards.length - 1) / 2;

  return (
    <div
      style={{ height: HAND_HEIGHT }}
      className="pointer-events-auto flex items-center justify-center gap-1"
    >
      {cards.map((card, index) => {
        const offset = index - middle;
        const picked = selected[card.resource] ?? 0;
        // A fanned hand tilts; a stacked one stays upright, because a badge is
        // hard to read on an angle.
        const tilt = fanned ? offset * 3.5 : 0;
        const lift = fanned ? Math.abs(offset) * 2.5 : 0;
        // In a fan, the first `picked` copies of a resource are the chosen
        // ones, so picking two wheat lifts two wheat cards.
        const isPicked = fanned ? card.runIndex < picked : picked > 0;

        return (
          <span
            key={card.key}
            style={{ transform: `rotate(${tilt}deg) translateY(${lift}px)` }}
            className="transition-transform"
          >
            <ResourceCard
              resource={card.resource}
              {...(card.count === undefined ? {} : { count: card.count })}
              {...(picked > 0 && !fanned ? { title: `${picked} elegida(s)` } : {})}
              selected={isPicked}
              {...(selectable
                ? {
                    onClick: () => {
                      onToggle(card.resource);
                    },
                  }
                : {})}
            />
          </span>
        );
      })}
    </div>
  );
}

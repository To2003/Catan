import { useEffect, useRef } from 'react';
import type { PlayerId } from '@tierra-austral/engine';
import type { Effect } from '../../lib/effects.js';
import { RESOURCE_ICONS } from '../../lib/terrainStyles.js';

interface FlyingCardsProps {
  readonly effects: readonly Effect[];
  readonly colorOf: (playerId: PlayerId) => string;
  readonly scale: number;
}

const centreOf = (selector: string): { x: number; y: number } | undefined => {
  const element = document.querySelector(selector);
  if (!element) return undefined;
  const box = element.getBoundingClientRect();
  return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
};

/**
 * Cards travelling from where they came from to whoever got them.
 *
 * The cards are built as plain DOM nodes rather than React state on purpose.
 * They are fire-and-forget decoration that has to measure the page first: each
 * one removes itself when its animation ends, so a burst of events, a
 * re-render or a tab left in the background can never strand one mid-flight.
 *
 * Positions come from `data-hex` and `data-player` attributes. If either end
 * is off screen the flight is skipped — a missing animation beats a card
 * flying to the wrong place.
 */
export function FlyingCards({ effects, colorOf, scale }: FlyingCardsProps) {
  const layer = useRef<HTMLDivElement>(null);
  const launched = useRef(new Set<number>());

  const flightEffects = effects.filter(
    (effect) => effect.kind === 'produce' || effect.kind === 'steal',
  );
  const signature = flightEffects.map((effect) => effect.id).join(',');

  useEffect(() => {
    const container = layer.current;
    if (!container || scale === 0) return;

    const launch = (
      from: { x: number; y: number },
      to: { x: number; y: number },
      glyph: string,
      tint: string,
      delay: number,
    ): void => {
      const card = document.createElement('span');
      card.className =
        'card-fly absolute flex size-8 items-center justify-center rounded-md border text-base shadow-lg';
      card.textContent = glyph;
      card.style.left = `${from.x}px`;
      card.style.top = `${from.y}px`;
      card.style.borderColor = tint;
      card.style.backgroundColor = '#1c1917';
      card.style.animationDelay = `${delay}ms`;
      card.style.animationDuration = `${900 * scale}ms`;
      card.style.setProperty('--fly-x', `${to.x - from.x}px`);
      card.style.setProperty('--fly-y', `${to.y - from.y}px`);
      card.addEventListener('animationend', () => {
        card.remove();
      });
      container.append(card);
    };

    for (const effect of flightEffects) {
      if (launched.current.has(effect.id)) continue;
      launched.current.add(effect.id);

      if (effect.kind === 'produce') {
        effect.grants.forEach((grant, index) => {
          const from = centreOf(`[data-hex="${grant.hex}"]`);
          const to = centreOf(`[data-player="${grant.player}"]`);
          if (!from || !to) return;
          for (let copy = 0; copy < grant.amount; copy += 1) {
            launch(
              from,
              to,
              RESOURCE_ICONS[grant.resource],
              colorOf(grant.player),
              (index * 60 + copy * 90) * scale,
            );
          }
        });
      } else {
        const from = centreOf(`[data-player="${effect.victim}"]`);
        const to = centreOf(`[data-player="${effect.thief}"]`);
        if (from && to) {
          launch(
            from,
            to,
            effect.resource ? RESOURCE_ICONS[effect.resource] : '🂠',
            colorOf(effect.thief),
            0,
          );
        }
      }
    }

    // Ids only grow, so the set is trimmed rather than left to collect a
    // whole game's worth of numbers.
    if (launched.current.size > 200) {
      launched.current = new Set([...launched.current].slice(-50));
    }
  }, [signature, scale, colorOf, flightEffects]);

  return <div ref={layer} className="pointer-events-none fixed inset-0 z-30" aria-hidden />;
}

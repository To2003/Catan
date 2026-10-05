import { useEffect, useRef } from 'react';
import {
  TIPS,
  alreadySeen,
  markSeen,
  quietAfterTour,
  runTour,
  toursEnabled,
  type Tour,
} from '../lib/tour.js';

interface TourRunnerProps {
  /** The walkthrough for this screen, shown once. */
  readonly tour: Tour;
  /** Which one-step nudges are true right now, by key. */
  readonly tips?: Readonly<Record<string, boolean>>;
  /** Off while something is already demanding attention. */
  readonly busy?: boolean;
}

/**
 * Starts a tour when there is one to start, and otherwise stays out of the way.
 *
 * Three rules, all of them about not getting in the middle of a game:
 *
 * - Nothing runs while a modal is open or the dice are rolling. A popover
 *   over an overlay points at something nobody can see.
 * - A tour whose anchors are all missing does not run at all, rather than
 *   running and highlighting nothing.
 * - Anything shown is marked as seen immediately, so a reload or a
 *   reconnection does not start it over.
 */
export function TourRunner({ tour, tips, busy = false }: TourRunnerProps) {
  /** One at a time, and never a second attempt while the first is up. */
  const running = useRef(false);

  useEffect(() => {
    if (busy || running.current || !toursEnabled()) return;

    // A tip never lands on top of something you just closed.
    const pending =
      alreadySeen(tour.id) && !quietAfterTour()
        ? Object.entries(tips ?? {}).find(
            ([key, now]) => now && !alreadySeen(`ayuda:${key}`) && TIPS[key] !== undefined,
          )
        : undefined;

    const start = async (): Promise<void> => {
      running.current = true;
      if (!alreadySeen(tour.id)) {
        markSeen(tour.id);
        await runTour(tour.steps, {
          onDone: () => {
            running.current = false;
          },
        });
        return;
      }
      if (!pending) {
        running.current = false;
        return;
      }
      const [key] = pending;
      markSeen(`ayuda:${key}`);
      const step = TIPS[key];
      if (!step) {
        running.current = false;
        return;
      }
      await runTour([step], {
        onDone: () => {
          running.current = false;
        },
      });
    };

    if (alreadySeen(tour.id) && !pending) return;
    // A tick late, so the thing being pointed at has finished rendering.
    const timer = window.setTimeout(
      () => {
        void start();
      },
      alreadySeen(tour.id) ? 1200 : 400,
    );
    return () => {
      window.clearTimeout(timer);
    };
  }, [tour, tips, busy]);

  return null;
}

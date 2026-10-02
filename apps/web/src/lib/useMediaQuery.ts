import { useEffect, useState } from 'react';

/**
 * A media query as state, for the cases where CSS classes are not enough.
 *
 * Two of them: when a component must render *once* rather than twice with
 * one hidden — duplicate headings and duplicate `data-tour` anchors are both
 * real problems — and when the default differs per size, which is a value
 * and not a style.
 */
export const useMediaQuery = (query: string): boolean => {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);

  useEffect(() => {
    const media = window.matchMedia(query);
    const update = (): void => {
      setMatches(media.matches);
    };
    update();
    media.addEventListener('change', update);
    return () => {
      media.removeEventListener('change', update);
    };
  }, [query]);

  return matches;
};

/** Tailwind's `lg`: where the board gets room beside it. */
export const WIDE_ENOUGH = '(min-width: 1024px)';

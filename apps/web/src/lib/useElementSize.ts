import { useEffect, useRef, useState } from 'react';

export interface Size {
  readonly width: number;
  readonly height: number;
}

/**
 * The measured box of an element, kept up to date with a ResizeObserver.
 *
 * The board needs real pixels, not a percentage: it has to work out how much
 * of its own margin it can drop to fill whatever space is left after the
 * panel, the top bar and the hand. Percentages leave that decision to the
 * aspect ratio of the artwork, which is how it ended up floating in the middle
 * of a wide screen.
 */
export const useElementSize = <T extends HTMLElement>(): {
  ref: React.RefObject<T | null>;
  size: Size;
} => {
  const ref = useRef<T>(null);
  const [size, setSize] = useState<Size>({ width: 0, height: 0 });

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      // Only react to real changes: a fractional wobble would re-render the
      // board on every scroll.
      setSize((current) =>
        Math.abs(current.width - width) < 1 && Math.abs(current.height - height) < 1
          ? current
          : { width, height },
      );
    });

    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, []);

  return { ref, size };
};

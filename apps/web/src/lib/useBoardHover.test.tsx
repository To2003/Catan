import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useBoardHover } from './useBoardHover.js';

/**
 * The bug this hook exists for.
 *
 * Hover used to be cleared by `onMouseLeave` handlers on the very elements
 * being hovered. That covers the mouse moving away and nothing else — and
 * the case that actually happened was the element going away instead: click
 * a hex to move the robber, the phase changes, the candidate hexes unmount,
 * no mouse event fires, and the tooltip hangs there pinned to the last
 * pointer position.
 *
 * All three hovers went through the same hole, so all three are checked.
 */
describe('a phase change clears what the board was highlighting', () => {
  it.each([
    [
      'the robber hex',
      (api: ReturnType<typeof useBoardHover>) => {
        api.setHex('h4');
      },
      'hex',
    ],
    [
      'the victim',
      (api: ReturnType<typeof useBoardHover>) => {
        api.setVictim('p2');
      },
      'victim',
    ],
    [
      'the longest route',
      (api: ReturnType<typeof useBoardHover>) => {
        api.setRoute('p3');
      },
      'route',
    ],
  ] as const)('%s', (_name, set, field) => {
    const { result, rerender } = renderHook(({ phase }) => useBoardHover(phase), {
      initialProps: { phase: 'moveRobber:p1' },
    });

    act(() => {
      set(result.current);
    });
    expect(result.current[field]).toBeDefined();

    // The move lands: the phase moves on and the element unmounts without
    // ever telling the hover about it.
    rerender({ phase: 'main:p1' });
    expect(result.current[field]).toBeUndefined();
  });
});

describe('the other three ways out', () => {
  it('clears when the window loses focus', () => {
    const { result } = renderHook(() => useBoardHover('moveRobber:p1'));
    act(() => {
      result.current.setHex('h4');
    });

    act(() => {
      window.dispatchEvent(new Event('blur'));
    });
    expect(result.current.hex).toBeUndefined();
  });

  it('clears when the tab is hidden', () => {
    const { result } = renderHook(() => useBoardHover('moveRobber:p1'));
    act(() => {
      result.current.setVictim('p2');
    });

    const visibility = Object.getOwnPropertyDescriptor(Document.prototype, 'visibilityState');
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'hidden',
    });
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    if (visibility) Object.defineProperty(Document.prototype, 'visibilityState', visibility);

    expect(result.current.victim).toBeUndefined();
  });

  it('clears on demand, which is what a click handler calls', () => {
    const { result } = renderHook(() => useBoardHover('moveRobber:p1'));
    act(() => {
      result.current.setHex('h4');
      result.current.setVictim('p2');
      result.current.setRoute('p3');
    });

    act(() => {
      result.current.clear();
    });
    expect(result.current.hex).toBeUndefined();
    expect(result.current.victim).toBeUndefined();
    expect(result.current.route).toBeUndefined();
  });
});

describe('a hex chosen by touch', () => {
  it('remembers it was a tap, so the screen can ask for a second one', () => {
    const { result } = renderHook(() => useBoardHover('moveRobber:p1'));
    act(() => {
      result.current.setHex('h4', true);
    });
    expect(result.current.byTouch).toBe(true);

    // And letting go of the hex forgets it: the flag is about this hex.
    act(() => {
      result.current.setHex(undefined);
    });
    expect(result.current.byTouch).toBe(false);
  });
});

describe('the same phase', () => {
  it('does not clear on a re-render that changes nothing', () => {
    const { result, rerender } = renderHook(({ phase }) => useBoardHover(phase), {
      initialProps: { phase: 'moveRobber:p1' },
    });
    act(() => {
      result.current.setHex('h4');
    });

    rerender({ phase: 'moveRobber:p1' });
    expect(result.current.hex).toBe('h4');
  });
});

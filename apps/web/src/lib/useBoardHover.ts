import { useCallback, useEffect, useRef, useState } from 'react';
import type { HexId, PlayerId } from '@tierra-austral/engine';

export interface BoardHover {
  /** The hex the robber would go to, while that choice is open. */
  readonly hex: HexId | undefined;
  /** Whose buildings to ring, while picking somebody to rob. */
  readonly victim: PlayerId | undefined;
  /** Whose longest route to trace. */
  readonly route: PlayerId | undefined;
  readonly pointer: { readonly x: number; readonly y: number };
  /** Set while the hex was chosen by touch, where there is no hover to leave. */
  readonly byTouch: boolean;
}

export interface BoardHoverApi extends BoardHover {
  readonly setHex: (hex: HexId | undefined, byTouch?: boolean) => void;
  readonly setVictim: (player: PlayerId | undefined) => void;
  readonly setRoute: (player: PlayerId | undefined) => void;
  readonly movePointer: (x: number, y: number) => void;
  readonly clear: () => void;
}

const EMPTY: BoardHover = {
  hex: undefined,
  victim: undefined,
  route: undefined,
  pointer: { x: 0, y: 0 },
  byTouch: false,
};

/**
 * One owner for everything the board highlights on hover.
 *
 * It used to be three pieces of state cleared by `onMouseLeave` handlers
 * living on the very elements they described. That works right up until the
 * element goes away for a reason other than the mouse: click a hex to move
 * the robber, the phase changes, the candidate hexes unmount, and no mouse
 * event ever fires — so the tooltip stayed on screen, pinned to wherever the
 * pointer happened to be, until you hovered something else. The same hole was
 * under the steal targets, which unmount the moment you pick one.
 *
 * So the leave handlers are not the only way out any more. The hover also
 * clears whenever the phase changes, when the pointer leaves the board, and
 * when the window loses focus or is hidden — three things that all mean "you
 * are not pointing at that any more" and none of which fire a mouseleave.
 *
 * @param phaseKey anything that changes when the board's question changes.
 */
export const useBoardHover = (phaseKey: string): BoardHoverApi => {
  const [state, setState] = useState<BoardHover>(EMPTY);

  const clear = useCallback(() => {
    setState((current) => (current === EMPTY ? current : EMPTY));
  }, []);

  // The phase changing is the case that broke: the thing being hovered stops
  // existing without the pointer going anywhere.
  const lastPhase = useRef(phaseKey);
  useEffect(() => {
    if (lastPhase.current === phaseKey) return;
    lastPhase.current = phaseKey;
    clear();
  }, [phaseKey, clear]);

  // Alt-tabbing away counts as stopping pointing at it, and leaves no event
  // on the element either.
  useEffect(() => {
    const onHidden = (): void => {
      if (document.visibilityState === 'hidden') clear();
    };
    window.addEventListener('blur', clear);
    document.addEventListener('visibilitychange', onHidden);
    return () => {
      window.removeEventListener('blur', clear);
      document.removeEventListener('visibilitychange', onHidden);
    };
  }, [clear]);

  const setHex = useCallback((hex: HexId | undefined, byTouch = false) => {
    setState((current) => ({ ...current, hex, byTouch: hex === undefined ? false : byTouch }));
  }, []);

  const setVictim = useCallback((victim: PlayerId | undefined) => {
    setState((current) => ({ ...current, victim }));
  }, []);

  const setRoute = useCallback((route: PlayerId | undefined) => {
    setState((current) => ({ ...current, route }));
  }, []);

  const movePointer = useCallback((x: number, y: number) => {
    setState((current) =>
      current.pointer.x === x && current.pointer.y === y
        ? current
        : { ...current, pointer: { x, y } },
    );
  }, []);

  return { ...state, setHex, setVictim, setRoute, movePointer, clear };
};

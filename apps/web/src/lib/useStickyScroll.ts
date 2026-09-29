import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * A scroll pane that follows new content, unless you are reading older content.
 *
 * The rule people expect from a chat: if you are at the bottom, new messages
 * pull you along; if you scrolled up to read something, nothing moves under
 * you and a badge tells you how much you are missing.
 *
 * The bookkeeping is deliberately anchored rather than counted: when you scroll
 * away from the bottom we remember how many items there were, and "unread" is
 * the difference. That keeps every state change inside an event handler, so the
 * effect only ever touches the DOM.
 */
export interface StickyScroll<T extends HTMLElement> {
  readonly ref: React.RefObject<T | null>;
  /** How many items arrived since you scrolled away. Zero while pinned. */
  readonly unread: number;
  readonly pinned: boolean;
  readonly onScroll: () => void;
  readonly scrollToBottom: () => void;
}

/** How close to the bottom still counts as "at the bottom". */
const SLACK_PX = 24;

export const useStickyScroll = <T extends HTMLElement>(itemCount: number): StickyScroll<T> => {
  const ref = useRef<T>(null);
  const [anchoredAt, setAnchoredAt] = useState<number | null>(null);

  const scrollToBottom = useCallback(() => {
    const element = ref.current;
    if (element) element.scrollTop = element.scrollHeight;
    setAnchoredAt(null);
  }, []);

  const onScroll = useCallback(() => {
    const element = ref.current;
    if (!element) return;
    const atBottom = element.scrollHeight - element.scrollTop - element.clientHeight <= SLACK_PX;
    setAnchoredAt((current) => {
      if (atBottom) return null;
      return current ?? itemCount;
    });
  }, [itemCount]);

  // Pinned: follow the content. Not pinned: leave the scroll exactly where the
  // reader put it.
  useEffect(() => {
    if (anchoredAt !== null) return;
    const element = ref.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [itemCount, anchoredAt]);

  return {
    ref,
    unread: anchoredAt === null ? 0 : Math.max(0, itemCount - anchoredAt),
    pinned: anchoredAt === null,
    onScroll,
    scrollToBottom,
  };
};

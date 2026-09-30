import type { ReactNode } from 'react';
import { useStickyScroll } from '../lib/useStickyScroll.js';

interface ScrollPaneProps {
  readonly itemCount: number;
  readonly className?: string;
  /** The outer box. Pass `min-h-0 flex-1` to let the pane fill a column. */
  readonly frameClassName?: string;
  readonly label: (unread: number) => string;
  readonly children: ReactNode;
}

/**
 * A list that follows new entries while you are at the bottom, and offers to
 * catch you up when you are not.
 */
export function ScrollPane({
  itemCount,
  className,
  frameClassName,
  label,
  children,
}: ScrollPaneProps) {
  const { ref, unread, onScroll, scrollToBottom } = useStickyScroll<HTMLDivElement>(itemCount);

  return (
    <div className={`relative min-h-0 ${frameClassName ?? ''}`}>
      <div ref={ref} onScroll={onScroll} className={className ?? 'max-h-40 overflow-y-auto'}>
        {children}
      </div>

      {unread > 0 ? (
        <button
          type="button"
          onClick={scrollToBottom}
          className="absolute inset-x-0 bottom-1 mx-auto w-max rounded-full bg-guanaco px-3 py-1 text-[12px] font-semibold text-noche shadow-lg"
        >
          ↓ {label(unread)}
        </button>
      ) : null}
    </div>
  );
}

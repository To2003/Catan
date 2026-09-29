import type { ReactNode } from 'react';
import { useStickyScroll } from '../lib/useStickyScroll.js';

interface ScrollPaneProps {
  readonly itemCount: number;
  readonly className?: string;
  readonly label: (unread: number) => string;
  readonly children: ReactNode;
}

/**
 * A list that follows new entries while you are at the bottom, and offers to
 * catch you up when you are not.
 */
export function ScrollPane({ itemCount, className, label, children }: ScrollPaneProps) {
  const { ref, unread, onScroll, scrollToBottom } = useStickyScroll<HTMLDivElement>(itemCount);

  return (
    <div className="relative min-h-0">
      <div ref={ref} onScroll={onScroll} className={className ?? 'max-h-40 overflow-y-auto'}>
        {children}
      </div>

      {unread > 0 ? (
        <button
          type="button"
          onClick={scrollToBottom}
          className="absolute inset-x-0 bottom-1 mx-auto w-max rounded-full bg-stone-100 px-3 py-1 text-[11px] font-semibold text-stone-900 shadow-lg"
        >
          ↓ {label(unread)}
        </button>
      ) : null}
    </div>
  );
}

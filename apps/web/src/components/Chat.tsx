import { useState } from 'react';
import type { PlayerId } from '@tierra-austral/engine';
import { MAX_CHAT_LENGTH } from '../lib/timing.js';
import { ScrollPane } from './ScrollPane.js';

interface ChatProps {
  readonly messages: readonly { from: PlayerId; text: string; at: number }[];
  readonly nameOf: (id: PlayerId) => string;
  readonly colorOf: (id: PlayerId) => string;
  readonly onSend: (text: string) => void;
}

/**
 * The room's chat.
 *
 * Collapsing keeps the panel short during a busy turn; the badge is there so
 * folding it away does not mean missing that somebody asked you for wheat.
 */
export function Chat({ messages, nameOf, colorOf, onSend }: ChatProps) {
  const [text, setText] = useState('');
  const [open, setOpen] = useState(true);
  // Set when collapsing, so "unread" is a subtraction rather than a counter
  // that has to be kept in step with arrivals.
  const [seenAt, setSeenAt] = useState(messages.length);

  const unread = open ? 0 : Math.max(0, messages.length - seenAt);

  return (
    <div>
      <button
        type="button"
        onClick={() => {
          setOpen((current) => {
            if (current) setSeenAt(messages.length);
            return !current;
          });
        }}
        className="mb-1 flex w-full items-center gap-2 text-xs font-bold tracking-widest text-stone-400 uppercase"
      >
        <span>Chat</span>
        {unread > 0 ? (
          <span className="rounded-full bg-amarillo px-1.5 text-[10px] font-bold text-stone-900">
            {unread}
          </span>
        ) : null}
        <span className="ml-auto text-stone-500">{open ? '▾' : '▸'}</span>
      </button>

      {open ? (
        <>
          <ScrollPane
            itemCount={messages.length}
            className="max-h-28 overflow-y-auto pr-1"
            label={(count) =>
              `${count} mensaje${count === 1 ? '' : 's'} nuevo${count === 1 ? '' : 's'}`
            }
          >
            <ol className="space-y-0.5 text-[11px]">
              {messages.length === 0 ? (
                <li className="text-stone-500">Nadie dijo nada todavía</li>
              ) : (
                messages.map((message) => (
                  <li key={`${message.at}-${message.from}`}>
                    <span className="font-semibold" style={{ color: colorOf(message.from) }}>
                      {nameOf(message.from)}:
                    </span>{' '}
                    {message.text}
                  </li>
                ))
              )}
            </ol>
          </ScrollPane>

          <form
            onSubmit={(event) => {
              event.preventDefault();
              const trimmed = text.trim();
              if (trimmed.length === 0) return;
              onSend(trimmed);
              setText('');
            }}
            className="mt-1 flex gap-1"
          >
            <input
              value={text}
              maxLength={MAX_CHAT_LENGTH}
              placeholder="Escribí algo"
              onChange={(event) => {
                setText(event.target.value);
              }}
              className="min-w-0 flex-1 rounded bg-stone-800 px-2 py-1 text-xs"
            />
            <button
              type="submit"
              className="rounded bg-stone-700 px-2 py-1 text-xs font-semibold hover:bg-stone-600"
            >
              Enviar
            </button>
          </form>
        </>
      ) : null}
    </div>
  );
}

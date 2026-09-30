import { useEffect, useRef, useState } from 'react';
import type { PlayerId } from '@tierra-austral/engine';
import type { ChatMessage } from '../store/gameStore.js';
import { MAX_CHAT_LENGTH } from '../lib/timing.js';
import { ScrollPane } from './ScrollPane.js';

interface ChatProps {
  readonly messages: readonly ChatMessage[];
  readonly nameOf: (id: PlayerId) => string;
  readonly colorOf: (id: PlayerId) => string;
  readonly onSend: (text: string) => void;
  /**
   * Off in the lobby, where the chat is a panel of its own and there is
   * nothing to fold it away from.
   */
  readonly collapsible?: boolean;
  /** How tall the list may grow. The lobby has room; the side panel does not. */
  readonly height?: string;
  /**
   * Fill the height of whatever contains it, with the input pinned at the
   * bottom. That is what the lobby's own column wants; the game's side panel
   * wants the opposite, a box that ends where its content ends.
   */
  readonly fill?: boolean;
  /** Put the cursor in the box on arrival. Only where typing is the point. */
  readonly autoFocus?: boolean;
}

/**
 * The room's conversation, in the lobby and in the game.
 *
 * One component in both places because it is one conversation: starting a
 * game, voting to start over and playing a rematch all leave it where it was.
 * Everything renders as text — a message is a string the server handed over,
 * never markup.
 */
export function Chat({
  messages,
  nameOf,
  colorOf,
  onSend,
  collapsible = true,
  height = 'max-h-28',
  fill = false,
  autoFocus = false,
}: ChatProps) {
  const [text, setText] = useState('');
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (autoFocus) input.current?.focus();
  }, [autoFocus]);
  const [open, setOpen] = useState(true);
  // Set when collapsing, so "unread" is a subtraction rather than a counter
  // that has to be kept in step with arrivals.
  const [seenAt, setSeenAt] = useState(messages.length);

  const unread = open || !collapsible ? 0 : Math.max(0, messages.length - seenAt);
  const showing = open || !collapsible;

  return (
    <div className={fill ? 'flex h-full min-h-0 flex-col' : ''}>
      {collapsible ? (
        <button
          type="button"
          onClick={() => {
            setOpen((current) => {
              if (current) setSeenAt(messages.length);
              return !current;
            });
          }}
          className="mb-1 flex w-full items-center gap-2 text-[13px] font-semibold text-guanaco"
        >
          <span>Mensajes</span>
          {unread > 0 ? (
            <span className="rounded-full bg-amarillo px-1.5 text-[13px] font-bold text-stone-900">
              {unread}
            </span>
          ) : null}
          <span className="ml-auto text-stone-500">{open ? '▾' : '▸'}</span>
        </button>
      ) : (
        <h2 className="mb-1 text-[13px] font-semibold text-guanaco">Mensajes</h2>
      )}

      {showing ? (
        <>
          <ScrollPane
            itemCount={messages.length}
            {...(fill ? { frameClassName: 'flex-1' } : {})}
            className={`${fill ? 'h-full' : height} overflow-y-auto pr-1`}
            label={(count) =>
              `${count} mensaje${count === 1 ? '' : 's'} nuevo${count === 1 ? '' : 's'}`
            }
          >
            <ol className="space-y-0.5 text-[13px]">
              {messages.length === 0 ? (
                <li className="text-stone-500">Nadie dijo nada todavía</li>
              ) : (
                messages.map((message) =>
                  message.kind === 'system' || message.from === undefined ? (
                    <li key={message.id} className="text-guanaco-apagado italic">
                      {message.text}
                    </li>
                  ) : (
                    <li key={message.id}>
                      <span className="font-semibold" style={{ color: colorOf(message.from) }}>
                        {nameOf(message.from)}:
                      </span>{' '}
                      {message.text}
                    </li>
                  ),
                )
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
            className="mt-2 flex shrink-0 gap-1"
          >
            <input
              ref={input}
              value={text}
              maxLength={MAX_CHAT_LENGTH}
              placeholder="Escribí algo"
              onChange={(event) => {
                setText(event.target.value);
              }}
              className="min-w-0 flex-1 rounded-panel bg-chapa-alta px-2 py-1 text-[13px] placeholder:text-guanaco-apagado"
            />
            <button
              type="submit"
              className="rounded-panel bg-guanaco px-2 py-1 text-[13px] font-semibold text-noche"
            >
              Enviar
            </button>
          </form>
        </>
      ) : null}
    </div>
  );
}

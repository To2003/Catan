import { useState } from 'react';
import type { PlayerId } from '@tierra-austral/engine';
import { MAX_CHAT_LENGTH } from '../lib/timing.js';

interface ChatProps {
  readonly messages: readonly { from: PlayerId; text: string; at: number }[];
  readonly nameOf: (id: PlayerId) => string;
  readonly onSend: (text: string) => void;
}

/** The room's chat. Short, and out of the way. */
export function Chat({ messages, nameOf, onSend }: ChatProps) {
  const [text, setText] = useState('');

  return (
    <div>
      <h2 className="mb-1 text-xs font-bold tracking-widest text-stone-400 uppercase">Chat</h2>

      <ol className="mb-1 max-h-28 space-y-0.5 overflow-y-auto text-[11px]">
        {messages.length === 0 ? (
          <li className="text-stone-500">Nadie dijo nada todavía</li>
        ) : (
          messages.slice(-30).map((message) => (
            <li key={`${message.at}-${message.from}`}>
              <span className="font-semibold">{nameOf(message.from)}:</span> {message.text}
            </li>
          ))
        )}
      </ol>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          const trimmed = text.trim();
          if (trimmed.length === 0) return;
          onSend(trimmed);
          setText('');
        }}
        className="flex gap-1"
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
    </div>
  );
}

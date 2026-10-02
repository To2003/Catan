import { useEffect, useMemo, useState } from 'react';
// The rules live in one file at the root of the repo. The app renders that
// file, so what is on screen and what is on GitHub can never disagree.
import source from '../../../../REGLAS.md?raw';
import { parseMarkdown, type Block, type Inline } from '../lib/markdown.js';
import { CostCard } from './CostCard.js';
import { WELCOME_TOUR, forgetSeen, runTour } from '../lib/tour.js';

function Text({ content }: { readonly content: readonly Inline[] }) {
  return (
    <>
      {content.map((piece, index) =>
        piece.kind === 'bold' ? (
          <strong key={index} className="font-semibold text-guanaco">
            {piece.text}
          </strong>
        ) : piece.kind === 'italic' ? (
          <em key={index}>{piece.text}</em>
        ) : piece.kind === 'code' ? (
          <code key={index} className="rounded bg-chapa px-1 text-[0.9em]">
            {piece.text}
          </code>
        ) : (
          <span key={index}>{piece.text}</span>
        ),
      )}
    </>
  );
}

function Blocks({ blocks }: { readonly blocks: readonly Block[] }) {
  return (
    <>
      {blocks.map((block, index) => {
        if (block.kind === 'heading') {
          // The sheet already has the document's title on it; repeating it
          // as the first thing inside would just be it twice.
          if (block.level === 1) return null;
          if (block.level === 2) {
            return (
              <h3
                key={index}
                className="font-display mt-6 mb-2 border-b border-chapa pb-1 text-lg text-estepa first:mt-0"
              >
                <Text content={block.content} />
              </h3>
            );
          }
          return (
            <h4 key={index} className="mt-4 mb-1 font-semibold text-guanaco">
              <Text content={block.content} />
            </h4>
          );
        }

        if (block.kind === 'paragraph') {
          return (
            <p key={index} className="mb-3 leading-relaxed">
              <Text content={block.content} />
            </p>
          );
        }

        if (block.kind === 'list') {
          const items = block.items.map((item, itemIndex) => (
            <li key={itemIndex} className="leading-relaxed">
              <Text content={item} />
            </li>
          ));
          return block.ordered ? (
            <ol key={index} className="mb-3 list-decimal space-y-1 pl-5">
              {items}
            </ol>
          ) : (
            <ul key={index} className="mb-3 list-disc space-y-1 pl-5">
              {items}
            </ul>
          );
        }

        return (
          <div key={index} className="mb-4 overflow-x-auto">
            <table className="w-auto border-collapse text-left">
              <thead>
                <tr className="border-b border-chapa-alta">
                  {block.header.map((cell, cellIndex) => (
                    <th key={cellIndex} className="py-1.5 pr-6 font-semibold text-estepa">
                      <Text content={cell} />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {block.rows.map((row, rowIndex) => (
                  <tr key={rowIndex} className="border-b border-chapa/60 last:border-0">
                    {row.map((cell, cellIndex) => (
                      <td key={cellIndex} className="py-1.5 pr-6 align-top">
                        <Text content={cell} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
    </>
  );
}

/**
 * The rules, over whatever is underneath.
 *
 * It is a sheet rather than a page because it gets opened mid-turn: you come
 * to check what a city costs and you go back to the board. Escape closes it,
 * and so does clicking outside.
 */
export function RulesSheet({ onClose }: { readonly onClose: () => void }) {
  const blocks = useMemo(() => parseMarkdown(source), []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  return (
    <div
      role="presentation"
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-noche/80 p-4"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Cómo se juega"
        onClick={(event) => {
          event.stopPropagation();
        }}
        className="flex max-h-full w-full max-w-3xl flex-col rounded-panel bg-noche ring-1 ring-chapa-alta"
      >
        <div className="flex items-center gap-3 border-b border-chapa px-4 py-2">
          <h2 className="font-display text-lg text-guanaco">Cómo se juega</h2>
          <button
            type="button"
            onClick={() => {
              // Replaying is the one case where "already seen" is wrong: you
              // asked for it.
              forgetSeen(WELCOME_TOUR.id);
              onClose();
              void runTour(WELCOME_TOUR.steps);
            }}
            className="ml-auto rounded-panel bg-chapa px-3 py-1 text-[13px] font-semibold hover:bg-chapa-alta"
          >
            Repasar la interfaz
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-panel bg-chapa px-3 py-1 text-[13px] font-semibold hover:bg-chapa-alta"
          >
            Cerrar
          </button>
        </div>

        <div className="overflow-y-auto px-5 py-4 text-[14px] text-stone-300">
          {/* The same card the game shows down its left edge, so the prices
              somebody reads here are the prices they will see there. */}
          <div className="mb-6 rounded-panel bg-chapa/40 p-4">
            <CostCard />
          </div>
          <Blocks blocks={blocks} />
        </div>
      </div>
    </div>
  );
}

/**
 * The button that opens the rules, wherever it is put.
 *
 * It owns the open state, so a screen adds the rules by dropping this in and
 * nothing else.
 */
export function RulesButton({ className = '' }: { readonly className?: string }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        title="Las reglas, para quien no las conoce"
        onClick={() => {
          setOpen(true);
        }}
        className={`rounded-panel bg-chapa px-3 py-1 text-[13px] font-semibold text-guanaco-apagado hover:bg-chapa-alta hover:text-guanaco ${className}`}
      >
        Cómo se juega
      </button>
      {open ? (
        <RulesSheet
          onClose={() => {
            setOpen(false);
          }}
        />
      ) : null}
    </>
  );
}

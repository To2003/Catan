import { useEffect, useRef, useState } from 'react';
import { SPEED_LABELS, type AnimationSpeed } from '../lib/animation.js';

/**
 * A preference this browser keeps, with its default.
 *
 * All of them are local: none of them changes the game, so none of them has
 * any business travelling to the server or to the other players.
 */
export interface Toggle {
  readonly key: string;
  readonly label: string;
  readonly hint?: string;
}

const read = (key: string, fallback: boolean): boolean => {
  try {
    const saved = window.localStorage.getItem(key);
    return saved === null ? fallback : saved === '1';
  } catch {
    return fallback;
  }
};

const write = (key: string, on: boolean): void => {
  try {
    window.localStorage.setItem(key, on ? '1' : '0');
  } catch {
    // Blocked storage just resets the setting between sessions.
  }
};

export const SETTINGS = {
  confirmEndTurn: 'tierra-austral:confirmar-fin-turno',
  hexIcons: 'tierra-austral:iconos-hex',
  tips: 'tierra-austral:mostrar-ayudas',
} as const;

export const settingEnabled = (key: string): boolean => read(key, true);

/**
 * Everything this browser can turn off, behind one gear.
 *
 * They were drifting into the top bar one control at a time — a speed
 * selector here, a mute button there — and each new one made the bar
 * narrower for the things that matter. One menu holds them and the bar gets
 * its width back.
 */
export function GameSettings({
  animation,
  onAnimation,
  muted,
  onMuted,
}: {
  readonly animation: AnimationSpeed;
  readonly onAnimation: (speed: AnimationSpeed) => void;
  readonly muted: boolean;
  readonly onMuted: (muted: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const [, bump] = useState(0);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setOpen(false);
    };
    const onOutside = (event: MouseEvent): void => {
      if (!box.current?.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onOutside);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onOutside);
    };
  }, [open]);

  const toggles: readonly Toggle[] = [
    {
      key: SETTINGS.confirmEndTurn,
      label: 'Confirmar al terminar el turno',
      hint: 'Avisa si todavía te alcanza para construir algo.',
    },
    { key: SETTINGS.hexIcons, label: 'Íconos en los hexes' },
    { key: SETTINGS.tips, label: 'Mostrar ayudas' },
  ];

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Ajustes"
        onClick={() => {
          setOpen((current) => !current);
        }}
        className="rounded-panel bg-chapa px-2 py-1.5 text-[15px] hover:bg-chapa-alta"
      >
        <span aria-hidden>⚙</span>
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute top-full right-0 z-40 mt-1 w-72 rounded-panel bg-chapa p-3 shadow-xl ring-1 ring-chapa-alta"
        >
          <label className="flex items-center gap-2 text-[13px]">
            <span className="flex-1">Animaciones</span>
            <select
              value={animation}
              onChange={(event) => {
                onAnimation(event.target.value as AnimationSpeed);
              }}
              className="rounded-panel bg-chapa-alta px-2 py-1 text-[13px]"
            >
              {(['normal', 'fast', 'off'] as const).map((speed) => (
                <option key={speed} value={speed}>
                  {SPEED_LABELS[speed]}
                </option>
              ))}
            </select>
          </label>

          <label className="mt-2 flex items-center gap-2 text-[13px]">
            <input
              type="checkbox"
              checked={!muted}
              onChange={(event) => {
                onMuted(!event.target.checked);
              }}
              className="size-4 accent-estepa"
            />
            <span>Sonido</span>
          </label>

          {toggles.map((toggle) => (
            <label key={toggle.key} className="mt-2 flex items-start gap-2 text-[13px]">
              <input
                type="checkbox"
                defaultChecked={settingEnabled(toggle.key)}
                onChange={(event) => {
                  write(toggle.key, event.target.checked);
                  // Nothing else subscribes to localStorage, so a re-render
                  // of the tree is what applies it.
                  bump((n) => n + 1);
                  window.dispatchEvent(new Event('tierra-austral:settings'));
                }}
                className="mt-0.5 size-4 shrink-0 accent-estepa"
              />
              <span>
                <span className="block text-guanaco">{toggle.label}</span>
                {toggle.hint === undefined ? null : (
                  <span className="block text-[12px] text-guanaco-apagado">{toggle.hint}</span>
                )}
              </span>
            </label>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** Re-reads a setting whenever the menu changes one. */
export const useSetting = (key: string): boolean => {
  const [on, setOn] = useState(() => settingEnabled(key));
  useEffect(() => {
    const update = (): void => {
      setOn(settingEnabled(key));
    };
    window.addEventListener('tierra-austral:settings', update);
    return () => {
      window.removeEventListener('tierra-austral:settings', update);
    };
  }, [key]);
  return on;
};

export interface Segment<T extends string> {
  readonly value: T;
  readonly label: string;
  /** Shown as the control's tooltip and, by the caller, under it. */
  readonly hint?: string;
}

interface SegmentedControlProps<T extends string> {
  readonly label: string;
  readonly options: readonly Segment<T>[];
  readonly value: T;
  readonly onChange: (value: T) => void;
  readonly disabled?: boolean;
  readonly className?: string;
}

/**
 * One choice out of a few, as a single joined control.
 *
 * Joined rather than a row of separate buttons because the options are
 * exclusive and that is what the shape should say. It is a radio group under
 * the hood, so arrow keys move between the options and only the selected one
 * is a tab stop — which is how a native radio group behaves and what a
 * screen reader announces.
 *
 * Written generic because the restart vote and the end screen are going to
 * need the same control.
 */
export function SegmentedControl<T extends string>({
  label,
  options,
  value,
  onChange,
  disabled = false,
  className = '',
}: SegmentedControlProps<T>) {
  const move = (by: number): void => {
    if (disabled) return;
    const at = options.findIndex((option) => option.value === value);
    const next = options[(at + by + options.length) % options.length];
    if (next) onChange(next.value);
  };

  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={`inline-flex rounded-panel bg-chapa p-0.5 ${disabled ? 'opacity-50' : ''} ${className}`}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected ? 0 : -1}
            disabled={disabled}
            {...(option.hint === undefined ? {} : { title: option.hint })}
            onClick={() => {
              onChange(option.value);
            }}
            onKeyDown={(event) => {
              if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
                event.preventDefault();
                move(1);
              }
              if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
                event.preventDefault();
                move(-1);
              }
            }}
            className={`rounded-[4px] px-3 py-1.5 text-[13px] font-semibold transition-colors ${
              selected
                ? 'bg-estepa text-noche'
                : 'text-guanaco-apagado enabled:hover:bg-chapa-alta enabled:hover:text-guanaco'
            } ${disabled ? 'cursor-not-allowed' : ''}`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

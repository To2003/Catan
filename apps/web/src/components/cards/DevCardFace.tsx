import type { DevCard } from '@tierra-austral/engine';
import { DEV_CARD_LABELS } from '../../lib/eventText.js';

const FACE: Record<DevCard, { mark: string; tint: string }> = {
  knight: { mark: '🛡', tint: '#a63446' },
  roadBuilding: { mark: '🛤', tint: '#6c7c8b' },
  yearOfPlenty: { mark: '🌾', tint: '#cfa43a' },
  monopoly: { mark: '💰', tint: '#2b5138' },
  vp: { mark: '🏆', tint: '#6fa8b6' },
};

interface DevCardFaceProps {
  readonly card: DevCard;
  readonly count: number;
  readonly disabled: boolean;
  readonly reason?: string | undefined;
  readonly onPlay?: (() => void) | undefined;
}

/** A development card, face up: yours are the only ones anybody sees. */
export function DevCardFace({ card, count, disabled, reason, onPlay }: DevCardFaceProps) {
  const face = FACE[card];

  return (
    <button
      type="button"
      disabled={disabled}
      title={reason ?? DEV_CARD_LABELS[card]}
      onClick={onPlay}
      className={`relative h-[86px] w-[62px] shrink-0 rounded-carta border-2 bg-[#efe6d3] p-1 text-left shadow-md transition-transform ${
        disabled ? 'cursor-default opacity-60' : 'cursor-pointer hover:-translate-y-2'
      }`}
      style={{ borderColor: face.tint }}
    >
      <span className="block text-center text-xl leading-tight">{face.mark}</span>
      <span
        className="mt-0.5 block text-center text-[9px] leading-tight font-semibold"
        style={{ color: face.tint }}
      >
        {DEV_CARD_LABELS[card]}
      </span>
      {count > 1 ? (
        <span className="font-display absolute -top-2 -right-2 rounded-full bg-noche px-1.5 text-[11px] font-bold text-guanaco ring-1 ring-guanaco/40">
          {count}
        </span>
      ) : null}
      {!disabled ? (
        <span className="absolute inset-x-1 bottom-0.5 rounded bg-estepa/90 text-center text-[9px] font-bold text-noche">
          jugar
        </span>
      ) : null}
    </button>
  );
}

/** The back of a card: what everybody else sees of a hand. */
export function DevCardBack({ count }: { readonly count: number }) {
  if (count <= 0) return null;
  return (
    <span
      title={`${count} carta${count === 1 ? '' : 's'} de desarrollo`}
      className="relative inline-flex h-5 w-4 items-center justify-center rounded-[3px] border border-guanaco/30 bg-gradient-to-br from-chapa-alta to-chapa text-[8px] text-guanaco/70"
    >
      {count > 1 ? count : ''}
    </span>
  );
}

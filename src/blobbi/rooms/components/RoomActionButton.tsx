/**
 * RoomActionButton — Unified circular action button for room bottom bars.
 *
 * Sized in em from the room's ROOM_UI_SCALE, so it grows with the room; the
 * icon is sized by the button.
 * Hover: soft glow (brightness + drop-shadow), no scale/translate.
 */

import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ROOM_ACTION_SLOT, ROOM_GUIDE_HIGHLIGHT } from '../lib/room-layout';

interface RoomActionButtonProps {
  icon: React.ReactNode;
  label: string;
  color: string;
  glowHex: string;
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
  /** When true, the button pulses with a guide-glow animation. */
  glow?: boolean;
  className?: string;
  /** For dragging out of the button (the shovel). */
  onPointerDown?: React.PointerEventHandler<HTMLButtonElement>;
}

export function RoomActionButton({
  icon,
  label,
  color,
  glowHex,
  onClick,
  disabled,
  loading,
  glow,
  className,
  onPointerDown,
}: RoomActionButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      onPointerDown={onPointerDown}
      className={cn(
        'flex flex-col items-center gap-[0.3em] transition-all duration-300 ease-out rounded-2xl',
        ROOM_ACTION_SLOT,
        'active:scale-95 motion-reduce:active:scale-100',
        'focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring',
        disabled && 'opacity-50 pointer-events-none',
        className,
      )}
    >
      <div
        className={cn(
          'size-[3.6em] rounded-full flex items-center justify-center',
          'bg-background/70 backdrop-blur-xs border border-border/30 shadow-xs transition-shadow duration-200',
          'hover:shadow-[0_0_12px_var(--glow)]',
          color,
          glow && ROOM_GUIDE_HIGHLIGHT,
        )}
        style={{
          '--glow': `color-mix(in srgb, ${glowHex} 50%, transparent)`,
          backgroundImage: `radial-gradient(circle at 40% 35%, color-mix(in srgb, ${glowHex} 14%, transparent), color-mix(in srgb, ${glowHex} 4%, transparent) 70%)`,
        } as React.CSSProperties}
      >
        {loading ? <Loader2 className="size-[1.5em] animate-spin" /> : <span className="[&>svg]:size-[1.5em]">{icon}</span>}
      </div>
      <span className="text-[0.8em] font-medium text-foreground/80 whitespace-nowrap">{label}</span>
    </button>
  );
}

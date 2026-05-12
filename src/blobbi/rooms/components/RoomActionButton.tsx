/**
 * RoomActionButton — Unified circular action button for room bottom bars.
 *
 * Responsive: size-10/size-14 circle, size-5/size-6 icons.
 * Hover: soft glow (brightness + drop-shadow), no scale/translate.
 */

import { forwardRef } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ROOM_CONTROL_SURFACE_SUBTLE, ROOM_GUIDE_HIGHLIGHT } from '../lib/room-layout';

interface RoomActionButtonProps {
  icon: React.ReactNode;
  label: string;
  color: string;
  glowHex: string;
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
  badge?: React.ReactNode;
  /** When true, the button pulses with a guide-glow animation. */
  glow?: boolean;
  className?: string;
  /** Pointer/touch event passthrough for drag interactions. */
  onMouseDown?: React.MouseEventHandler<HTMLButtonElement>;
  onTouchStart?: React.TouchEventHandler<HTMLButtonElement>;
  onTouchMove?: React.TouchEventHandler<HTMLButtonElement>;
  onTouchEnd?: React.TouchEventHandler<HTMLButtonElement>;
}

export const RoomActionButton = forwardRef<HTMLButtonElement, RoomActionButtonProps>(function RoomActionButton({
  icon,
  label,
  color,
  glowHex,
  onClick,
  disabled,
  loading,
  badge,
  glow,
  className,
  onMouseDown,
  onTouchStart,
  onTouchMove,
  onTouchEnd,
}, ref) {
  return (
    <button
      ref={ref}
      onClick={onClick}
      disabled={disabled}
      onMouseDown={onMouseDown}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      className={cn(
        'flex flex-col items-center gap-1 transition-all duration-300 ease-out shrink-0 translate-y-1',
        'active:scale-95',
        disabled && 'opacity-50 pointer-events-none',
        className,
      )}
    >
      <div className="relative">
        <div
          className={cn(
            'size-14 sm:size-20 rounded-full flex items-center justify-center',
            ROOM_CONTROL_SURFACE_SUBTLE, 'border border-border/20 shadow-sm',
            color,
            glow && ROOM_GUIDE_HIGHLIGHT,
          )}
          style={{
            backgroundImage: `radial-gradient(circle at 40% 35%, color-mix(in srgb, ${glowHex} 14%, transparent), color-mix(in srgb, ${glowHex} 4%, transparent) 70%)`,
          }}
        >
          {loading ? <Loader2 className="size-5 sm:size-6 animate-spin" /> : <span className="[&>svg]:size-5 sm:[&>svg]:size-6">{icon}</span>}
        </div>
        {badge && <div className="absolute -top-0.5 -right-0.5">{badge}</div>}
      </div>
      <span className={cn('text-[10px] sm:text-xs font-medium text-muted-foreground rounded-full px-1.5 py-px', ROOM_CONTROL_SURFACE_SUBTLE)}>{label}</span>
    </button>
  );
});

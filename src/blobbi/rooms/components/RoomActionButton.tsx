// src/blobbi/rooms/components/RoomActionButton.tsx

/**
 * RoomActionButton — Unified circular action button for all rooms.
 *
 * Responsive sizing:
 * - Mobile: size-14 circle, size-7 icons
 * - Desktop (sm+): size-20 circle, size-9 icons
 *
 * Matches the soft radial glow of the original Photo / Companion buttons
 * but at a smaller scale so the bottom bar feels proportional on mobile.
 */

import { Loader2 } from 'lucide-react';

import { cn } from '@/lib/utils';

interface RoomActionButtonProps {
  /** Lucide icon or emoji element rendered inside the circle */
  icon: React.ReactNode;
  /** Small text label below the circle */
  label: string;
  /** CSS colour class applied to the icon (e.g. 'text-pink-500') */
  color: string;
  /** Hex colour used for the radial glow background */
  glowHex: string;
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
  /** Optional badge content rendered at top-right of the circle */
  badge?: React.ReactNode;
  className?: string;
}

export function RoomActionButton({
  icon,
  label,
  color,
  glowHex,
  onClick,
  disabled,
  loading,
  badge,
  className,
}: RoomActionButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'flex flex-col items-center gap-1 transition-all duration-300 ease-out shrink-0',
        'hover:-translate-y-1 hover:scale-110 active:scale-95',
        disabled && 'opacity-50 pointer-events-none',
        className,
      )}
    >
      <div className="relative">
        <div
          className={cn('size-14 sm:size-20 rounded-full flex items-center justify-center', color)}
          style={{
            background: `radial-gradient(circle at 40% 35%, color-mix(in srgb, ${glowHex} 14%, transparent), color-mix(in srgb, ${glowHex} 4%, transparent) 70%)`,
          }}
        >
          {loading ? (
            <Loader2 className="size-7 sm:size-9 animate-spin" />
          ) : (
            icon
          )}
        </div>
        {badge && (
          <div className="absolute -top-0.5 -right-0.5">
            {badge}
          </div>
        )}
      </div>
      <span className="text-[10px] sm:text-xs font-medium text-muted-foreground">{label}</span>
    </button>
  );
}

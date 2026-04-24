/**
 * RoomActionButton — Unified circular action button for room bottom bars.
 *
 * Responsive: size-14/size-20 circle, size-7/size-9 icons.
 */

import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

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
  glow,
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
          className={cn(
            'size-14 sm:size-20 rounded-full flex items-center justify-center',
            color,
            glow && 'animate-[guide-glow_4s_ease-in-out_infinite]',
          )}
          style={{
            background: `radial-gradient(circle at 40% 35%, color-mix(in srgb, ${glowHex} 14%, transparent), color-mix(in srgb, ${glowHex} 4%, transparent) 70%)`,
          }}
        >
          {loading ? <Loader2 className="size-7 sm:size-9 animate-spin" /> : icon}
        </div>
        {badge && <div className="absolute -top-0.5 -right-0.5">{badge}</div>}
      </div>
      <span className="text-[10px] sm:text-xs font-medium text-muted-foreground">{label}</span>
    </button>
  );
}

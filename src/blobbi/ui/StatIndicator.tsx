import { AlertTriangle, Utensils, Gamepad2, Heart, Droplets, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';

// ── Constants ─────────────────────────────────────────────────────────────────

const STAT_COLORS: Record<string, string> = {
  orange: 'text-orange-500',
  yellow: 'text-yellow-500',
  green: 'text-green-500',
  blue: 'text-blue-500',
  violet: 'text-violet-500',
};

const STAT_BG_COLORS: Record<string, string> = {
  orange: 'bg-orange-500/10',
  yellow: 'bg-yellow-500/10',
  green: 'bg-green-500/10',
  blue: 'bg-blue-500/10',
  violet: 'bg-violet-500/10',
};

const STAT_RING_HEX: Record<string, string> = {
  orange: '#f97316',
  yellow: '#eab308',
  green: '#22c55e',
  blue: '#3b82f6',
  violet: '#8b5cf6',
};

/** Lucide icon component for each stat. */
const STAT_ICON_MAP: Record<string, React.ComponentType<{ className?: string; strokeWidth?: number }>> = {
  hunger: Utensils,
  happiness: Gamepad2,
  health: Heart,
  hygiene: Droplets,
  energy: Zap,
};

// ── Size presets ──────────────────────────────────────────────────────────────

const SIZE_PRESETS = {
  sm: {
    container: 'size-9',
    icon: 'size-3.5',
    strokeWidth: 3,
    alertSize: 'size-2.5',
    alertPos: '-top-1 -right-1.5',
  },
  md: {
    container: 'size-[4.5rem] sm:size-20',
    icon: 'size-6 sm:size-7',
    strokeWidth: 2.5,
    alertSize: 'size-3.5',
    alertPos: '-top-1.5 -right-2',
  },
} as const;

// ── Component ─────────────────────────────────────────────────────────────────

export interface StatIndicatorProps {
  stat: string;
  value: number | undefined;
  color: 'orange' | 'yellow' | 'green' | 'blue' | 'violet';
  status?: 'normal' | 'warning' | 'critical';
  /** Visual size preset. Default: 'md'. */
  size?: 'sm' | 'md';
  /** When provided, renders as a clickable button. */
  onClick?: () => void;
  /** Disable the button (only relevant when onClick is set). */
  disabled?: boolean;
}

export function StatIndicator({
  stat,
  value,
  color,
  status = 'normal',
  size = 'md',
  onClick,
  disabled,
}: StatIndicatorProps) {
  const displayValue = value ?? 0;
  const isLow = status === 'warning' || status === 'critical';
  const ringHex = STAT_RING_HEX[color];
  const IconComponent = STAT_ICON_MAP[stat];
  const preset = SIZE_PRESETS[size];

  const inner = (
    <>
      {/* Progress ring */}
      <svg className="absolute inset-0 -rotate-90" viewBox="0 0 36 36">
        <circle cx="18" cy="18" r="15" fill="none" stroke="currentColor" strokeWidth={preset.strokeWidth} className="text-muted/15" />
        <circle
          cx="18" cy="18" r="15" fill="none" strokeWidth={preset.strokeWidth} strokeLinecap="round"
          stroke={ringHex}
          strokeDasharray={`${displayValue * 0.94} 100`}
          className="transition-all duration-500"
        />
      </svg>
      {/* Icon with warning badge */}
      <div className="relative">
        {IconComponent && <IconComponent className={cn(preset.icon, STAT_COLORS[color])} strokeWidth={2.5} />}
        {isLow && (
          <AlertTriangle
            className={cn('absolute', preset.alertPos, preset.alertSize, status === 'critical' ? 'text-red-500' : 'text-amber-500')}
            strokeWidth={3}
          />
        )}
      </div>
    </>
  );

  const baseClass = cn(
    'relative rounded-full flex items-center justify-center',
    preset.container,
    STAT_BG_COLORS[color],
    status === 'critical' && 'animate-pulse',
  );

  if (onClick) {
    return (
      <button
        onClick={onClick}
        disabled={disabled}
        className={cn(
          baseClass,
          'transition-transform hover:scale-110 active:scale-95',
          disabled && 'opacity-40 pointer-events-none',
        )}
        aria-label={`${stat} ${displayValue}%`}
      >
        {inner}
      </button>
    );
  }

  return <div className={baseClass}>{inner}</div>;
}

/**
 * BlobbiRoomStatusHud — Compact horizontal stat indicators for the room HUD.
 *
 * Renders as a row of segmented ring stat icons near the top of the room,
 * absolutely positioned so it does not affect the Blobbi stage layout.
 * Keeps stat guide click behavior, glow animations, and care-state badges.
 */

import { useMemo, type CSSProperties } from 'react';
import {
  Utensils, Gamepad2, Heart, Droplets, Zap, AlertTriangle,
} from 'lucide-react';

import { SegmentedRing } from '@/blobbi/ui/StatIndicator';
import { getVisibleStats } from '@/blobbi/core/lib/blobbi-decay';
import { getBlobbiStatDisplayState } from '@/blobbi/core/lib/blobbi-segments';
import { cn } from '@/lib/utils';
import { ROOM_CONTROL_SURFACE_SUBTLE } from '../lib/room-layout';

import type { CareState } from '@/blobbi/core/lib/blobbi-segments';
import type { BlobbiCompanion, BlobbiStats } from '@/blobbi/core/lib/blobbi';

// ─── Colour maps ──────────────────────────────────────────────────────────────

const STAT_COLOR_MAP: Record<string, 'orange' | 'yellow' | 'green' | 'blue' | 'violet'> = {
  hunger: 'orange',
  happiness: 'yellow',
  health: 'green',
  hygiene: 'blue',
  energy: 'violet',
};

const STAT_COLORS: Record<string, string> = {
  orange: 'text-orange-500', yellow: 'text-yellow-500', green: 'text-green-500',
  blue: 'text-blue-500', violet: 'text-violet-500',
};

const STAT_BG_COLORS: Record<string, string> = {
  orange: 'bg-orange-500/10', yellow: 'bg-yellow-500/10', green: 'bg-green-500/10',
  blue: 'bg-blue-500/10', violet: 'bg-violet-500/10',
};

const STAT_RING_HEX: Record<string, string> = {
  orange: '#f97316', yellow: '#eab308', green: '#22c55e',
  blue: '#3b82f6', violet: '#8b5cf6',
};

const STAT_ICON_MAP: Record<string, React.ComponentType<{ className?: string; strokeWidth?: number }>> = {
  hunger: Utensils, happiness: Gamepad2, health: Heart, hygiene: Droplets, energy: Zap,
};

// ─── Props ────────────────────────────────────────────────────────────────────

export interface BlobbiRoomStatusHudProps {
  companion: BlobbiCompanion;
  currentStats: {
    hunger: number;
    happiness: number;
    health: number;
    hygiene: number;
    energy: number;
  };
  /** Called when the user taps any stat icon to start the guide. */
  onGuide?: (stat: keyof BlobbiStats) => void;
}

// ─── Arc offset helper ────────────────────────────────────────────────────────

/** Compute a downward arc offset (px) for stat icons. Center = lowest, edges = highest. */
function getArcOffset(index: number, count: number): number {
  if (count <= 1) return 0;
  const center = (count - 1) / 2;
  const maxDistance = Math.max(center, count - 1 - center);
  const distance = Math.abs(index - center);
  const normalized = maxDistance === 0 ? 0 : 1 - distance / maxDistance;
  return Math.round(normalized * 10); // max 10px arc depth
}

// ─── Component ────────────────────────────────────────────────────────────────

export function BlobbiRoomStatusHud({
  companion,
  currentStats,
  onGuide,
}: BlobbiRoomStatusHudProps) {
  const allStats = useMemo(() =>
    getVisibleStats(companion.stage).map(stat => {
      const value = currentStats[stat] ?? 100;
      const display = getBlobbiStatDisplayState({ stage: companion.stage, stat: stat as keyof BlobbiStats, value });
      return {
        stat,
        value,
        careState: display.careState,
        filled: display.filled,
        max: display.max,
        color: STAT_COLOR_MAP[stat],
      };
    }),
  [companion.stage, currentStats]);

  if (allStats.length === 0) return null;

  const count = allStats.length;

  return (
    <div
      className="flex items-start justify-center gap-2 sm:gap-3"
      style={{ animation: 'stat-glow-clock 2s linear infinite' } as CSSProperties}
    >
      {allStats.map((s, i) => (
        <div key={s.stat} style={{ transform: `translateY(${getArcOffset(i, count)}px)` }}>
          <button
            type="button"
            className={cn('transition-transform duration-200 active:scale-90', onGuide && 'cursor-pointer')}
            onClick={onGuide ? () => onGuide(s.stat as keyof BlobbiStats) : undefined}
          >
            <StatIndicator
              stat={s.stat}
              value={s.value}
              color={s.color}
              careState={s.careState}
              filled={s.filled}
              max={s.max}
            />
          </button>
        </div>
      ))}
    </div>
  );
}

// ─── Stat Indicator ───────────────────────────────────────────────────────────

function StatIndicator({
  stat,
  value,
  color,
  careState = 'good',
  filled,
  max,
}: {
  stat: string;
  value: number | undefined;
  color: 'orange' | 'yellow' | 'green' | 'blue' | 'violet';
  careState?: CareState;
  filled?: number;
  max?: number;
}) {
  const displayValue = value ?? 0;
  const showBadge = careState === 'attention' || careState === 'urgent';
  const showPulse = careState === 'urgent';
  const badgeColor = careState === 'urgent' ? 'text-red-500' : 'text-amber-500';
  const ringHex = STAT_RING_HEX[color];
  const IconComponent = STAT_ICON_MAP[stat];

  const hasSegments = filled !== undefined && max !== undefined;
  const isLow = careState === 'attention' || careState === 'urgent';

  const glowStyle: CSSProperties | undefined =
    careState === 'attention'
      ? { boxShadow: '0 0 calc(var(--stat-glow-intensity) * 6px) calc(var(--stat-glow-intensity) * 2px) currentColor' }
      : careState === 'urgent'
        ? { boxShadow: '0 0 calc(var(--stat-glow-intensity) * 10px) calc(var(--stat-glow-intensity) * 3px) currentColor' }
        : undefined;

  return (
    <div
      className={cn(
        'relative size-10 sm:size-12 rounded-full flex items-center justify-center',
        ROOM_CONTROL_SURFACE_SUBTLE, 'border border-border/20 shadow-sm',
        STAT_BG_COLORS[color],
        isLow && STAT_COLORS[color],
        showPulse && 'animate-pulse',
      )}
      style={glowStyle}
    >
      <svg className="absolute inset-0 -rotate-90" viewBox="0 0 36 36">
        {hasSegments ? (
          <SegmentedRing
            filled={filled}
            max={max}
            fillHex={ringHex}
            strokeWidth={2.5}
            gapDeg={16}
          />
        ) : (
          <>
            <circle cx="18" cy="18" r="15" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-muted/15" />
            <circle
              cx="18" cy="18" r="15" fill="none" strokeWidth="2.5" strokeLinecap="round"
              stroke={ringHex}
              strokeDasharray={`${displayValue * 0.94} 100`}
              className="transition-all duration-500"
            />
          </>
        )}
      </svg>
      <div className="relative">
        {IconComponent && <IconComponent className={cn('size-4 sm:size-5', STAT_COLORS[color])} strokeWidth={2.5} />}
        {showBadge && (
          <AlertTriangle
            className={cn('absolute -top-1 -right-1.5 size-2.5', badgeColor)}
            strokeWidth={3}
          />
        )}
      </div>
    </div>
  );
}

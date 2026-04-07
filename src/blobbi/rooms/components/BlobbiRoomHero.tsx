// src/blobbi/rooms/components/BlobbiRoomHero.tsx

/**
 * BlobbiRoomHero — Shared Blobbi visual display used in every room.
 *
 * This component does NOT clip or constrain the visual — it simply fills
 * available flex space and centers the Blobbi + stats within it.
 * The room owns the full-height surface; this just provides content.
 *
 * Top padding accounts for the floating room header overlay (~40px).
 */

import { useMemo } from 'react';
import {
  Utensils, Gamepad2, Heart, Droplets, Zap, AlertTriangle,
  Footprints, Loader2,
} from 'lucide-react';

import { BlobbiStageVisual } from '@/blobbi/ui/BlobbiStageVisual';
import { getVisibleStats, getStatStatus } from '@/blobbi/core/lib/blobbi-decay';
import { cn } from '@/lib/utils';
import type { BlobbiRoomContext } from '../lib/room-types';

// ─── Stat colour maps ─────────────────────────────────────────────────────────

const STAT_COLOR_MAP: Record<string, 'orange' | 'yellow' | 'green' | 'blue' | 'violet'> = {
  hunger: 'orange',
  happiness: 'yellow',
  health: 'green',
  hygiene: 'blue',
  energy: 'violet',
};

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

const STAT_ICON_MAP: Record<string, React.ComponentType<{ className?: string; strokeWidth?: number }>> = {
  hunger: Utensils,
  happiness: Gamepad2,
  health: Heart,
  hygiene: Droplets,
  energy: Zap,
};

// ─── Props ────────────────────────────────────────────────────────────────────

interface BlobbiRoomHeroProps {
  ctx: BlobbiRoomContext;
  className?: string;
  hideStats?: boolean;
  hideName?: boolean;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function BlobbiRoomHero({ ctx, className, hideStats, hideName }: BlobbiRoomHeroProps) {
  const {
    companion,
    currentStats,
    isSleeping,
    isEgg,
    statusRecipe,
    statusRecipeLabel,
    effectiveEmotion,
    hasDevOverride,
    blobbiReaction,
    isActiveFloatingCompanion,
    isUpdatingCompanion,
    handleSetAsCompanion,
    heroRef,
    heroWidth,
  } = ctx;

  if (isActiveFloatingCompanion) {
    return (
      <div className={cn('flex flex-col items-center justify-center gap-4 text-center flex-1 px-4', className)}>
        <Footprints className="size-12 text-muted-foreground/30" />
        <p className="text-muted-foreground text-sm">
          {companion.name} is out exploring right now.
        </p>
        <button
          onClick={handleSetAsCompanion}
          disabled={isUpdatingCompanion}
          className={cn(
            'flex items-center justify-center gap-2 px-6 py-3 rounded-full text-white font-semibold transition-all duration-300 ease-out text-sm',
            'hover:-translate-y-0.5 hover:scale-105 hover:brightness-110 active:scale-95',
            isUpdatingCompanion && 'opacity-50 pointer-events-none',
          )}
          style={{ background: 'linear-gradient(135deg, #8b5cf6, #ec4899, #f59e0b)' }}
        >
          {isUpdatingCompanion ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Footprints className="size-4" />
          )}
          <span>Bring {companion.name} home</span>
        </button>
      </div>
    );
  }

  return (
    <div
      ref={heroRef}
      className={cn(
        // No overflow-hidden — let the room own the visual surface.
        // Weighted flex layout: top spacer grows more than bottom spacer
        // so Blobbi is pushed downward toward the floor plane. This
        // produces consistent grounding across mobile and desktop.
        'relative flex flex-col items-center pt-10 px-4 sm:px-6 flex-1 min-h-0',
        className,
      )}
    >
      {/* Top spacer — grows 3x to push content toward the floor */}
      <div className="flex-[3_3_0%] min-h-0" />

      <div className="relative flex flex-col items-center">
        {/* Stats crown */}
        {!hideStats && <StatsCrown companion={companion} currentStats={currentStats} heroWidth={heroWidth} />}

        {/* Blobbi visual */}
        <div
          className="relative transition-all duration-500"
          style={!isSleeping ? {
            animation: `blobbi-bob ${4 - (currentStats.happiness / 100) * 1.5}s ease-in-out infinite, blobbi-sway ${6 - (currentStats.happiness / 100) * 2}s ease-in-out infinite`,
          } : undefined}
        >
          <div className="absolute inset-0 -m-16 sm:-m-20 bg-primary/5 rounded-full blur-3xl pointer-events-none" />
          <BlobbiStageVisual
            companion={companion}
            size="lg"
            animated={!isSleeping}
            reaction={blobbiReaction}
            recipe={hasDevOverride ? undefined : statusRecipe}
            recipeLabel={hasDevOverride ? undefined : statusRecipeLabel}
            emotion={effectiveEmotion}
            className={isEgg
              ? 'size-36 min-[400px]:size-44 sm:size-56 md:size-64 lg:size-72'
              : 'size-48 min-[400px]:size-60 sm:size-72 md:size-80 lg:size-96'
            }
          />
        </div>

        {/* Blobbi Name */}
        {!hideName && !isEgg && (
          <h2
            className="text-xl sm:text-2xl md:text-3xl font-bold text-center mt-1"
            style={{ color: companion.visualTraits.baseColor }}
          >
            {companion.name}
          </h2>
        )}
      </div>

      {/* Bottom spacer — grows 2x; keeps Blobbi off the very bottom edge */}
      <div className="flex-[2_2_0%] min-h-0" />
    </div>
  );
}

// ─── Stats Crown ──────────────────────────────────────────────────────────────

function StatsCrown({
  companion,
  currentStats,
  heroWidth,
}: {
  companion: BlobbiRoomContext['companion'];
  currentStats: BlobbiRoomContext['currentStats'];
  heroWidth: number;
}) {
  const allStats = useMemo(() =>
    getVisibleStats(companion.stage).map(stat => ({
      stat,
      value: currentStats[stat] ?? 100,
      status: getStatStatus(companion.stage, stat, currentStats[stat] ?? 100),
      color: STAT_COLOR_MAP[stat],
    })),
  [companion.stage, currentStats]);

  if (allStats.length === 0) return null;

  const count = allStats.length;
  const isSmall = heroWidth < 400;

  // Balanced arc: mobile is compact, desktop has moderate breathing room.
  // These values produce a stable crown with no dramatic changes between
  // 375px (mobile) and 640px+ (desktop) — a smooth interpolation.
  const arcSpread = isSmall
    ? (count <= 2 ? 80 : count <= 3 ? 110 : 140)
    : (count <= 2 ? 90 : count <= 3 ? 130 : 160);
  const arcHalf = arcSpread / 2;
  const angles = count === 1
    ? [0]
    : allStats.map((_, i) => -arcHalf + (arcSpread / (count - 1)) * i);

  return (
    <div className="relative flex items-end justify-center w-full mb-4 sm:mb-8" style={{ height: 40 }}>
      {allStats.map((s, i) => {
        const angleDeg = angles[i];
        const angleRad = (angleDeg * Math.PI) / 180;
        // Smooth interpolation: 110px at 340px width → 200px at 640px+ width
        const radius = Math.min(200, Math.max(110, (heroWidth - 340) / (640 - 340) * (200 - 110) + 110));
        const x = Math.sin(angleRad) * radius;
        const y = Math.cos(angleRad) * radius - radius;

        return (
          <div
            key={s.stat}
            className="absolute transition-all duration-500"
            style={{
              transform: `translate(-50%, 0)`,
              left: `calc(50% + ${x.toFixed(1)}px)`,
              bottom: `${y.toFixed(1)}px`,
            }}
          >
            <StatIndicator
              stat={s.stat}
              value={s.value}
              color={s.color}
              status={s.status}
            />
          </div>
        );
      })}
    </div>
  );
}

// ─── Stat Indicator ───────────────────────────────────────────────────────────

interface StatIndicatorProps {
  stat: string;
  value: number | undefined;
  color: 'orange' | 'yellow' | 'green' | 'blue' | 'violet';
  status?: 'normal' | 'warning' | 'critical';
}

function StatIndicator({ stat, value, color, status = 'normal' }: StatIndicatorProps) {
  const displayValue = value ?? 0;
  const isLow = status === 'warning' || status === 'critical';
  const ringHex = STAT_RING_HEX[color];
  const IconComponent = STAT_ICON_MAP[stat];

  return (
    <div className={cn(
      'relative size-14 sm:size-[4.5rem] rounded-full flex items-center justify-center',
      STAT_BG_COLORS[color],
      status === 'critical' && 'animate-pulse',
    )}>
      <svg className="absolute inset-0 -rotate-90" viewBox="0 0 36 36">
        <circle cx="18" cy="18" r="15" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-muted/15" />
        <circle
          cx="18" cy="18" r="15" fill="none" strokeWidth="2.5" strokeLinecap="round"
          stroke={ringHex}
          strokeDasharray={`${displayValue * 0.94} 100`}
          className="transition-all duration-500"
        />
      </svg>
      <div className="relative">
        {IconComponent && <IconComponent className={cn('size-5 sm:size-6', STAT_COLORS[color])} strokeWidth={2.5} />}
        {isLow && (
          <AlertTriangle
            className={cn('absolute -top-1.5 -right-2 size-3', status === 'critical' ? 'text-red-500' : 'text-amber-500')}
            strokeWidth={3}
          />
        )}
      </div>
    </div>
  );
}

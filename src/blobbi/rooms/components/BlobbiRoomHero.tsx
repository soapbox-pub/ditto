/**
 * BlobbiRoomHero — Shared Blobbi visual display used in every room.
 *
 * Renders: stats crown (arced) + Blobbi visual + name.
 * Does NOT clip or constrain — fills available flex space.
 * Top padding accounts for the floating room header overlay.
 */

import { useMemo } from 'react';
import {
  Utensils, Gamepad2, Heart, Droplets, Zap, AlertTriangle,
  Footprints, Loader2,
} from 'lucide-react';

import { BlobbiStageVisual } from '@/blobbi/ui/BlobbiStageVisual';
import { getVisibleStats } from '@/blobbi/core/lib/blobbi-decay';
import { getBlobbiStatDisplayState } from '@/blobbi/core/lib/blobbi-segments';
import type { CareState } from '@/blobbi/core/lib/blobbi-segments';
import type { BlobbiCompanion, BlobbiStats } from '@/blobbi/core/lib/blobbi';
import type { BlobbiEmotion } from '@/blobbi/ui/lib/emotion-types';
import type { BlobbiVisualRecipe } from '@/blobbi/ui/lib/recipe';
import type { BlobbiReactionState } from '@/blobbi/actions';
import type { BlobbiRoomId } from '../lib/room-config';
import { ROOM_META, DEFAULT_ROOM_ORDER, getRoomIndex } from '../lib/room-config';
import { cn } from '@/lib/utils';

// ─── Stat colour maps ─────────────────────────────────────────────────────────

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

export interface BlobbiRoomHeroProps {
  companion: BlobbiCompanion;
  currentStats: {
    hunger: number;
    happiness: number;
    health: number;
    hygiene: number;
    energy: number;
  };
  isSleeping: boolean;
  isEgg: boolean;
  statusRecipe: BlobbiVisualRecipe | undefined;
  statusRecipeLabel: string | undefined;
  effectiveEmotion: BlobbiEmotion;
  hasDevOverride: boolean;
  blobbiReaction: BlobbiReactionState;
  isActiveFloatingCompanion: boolean;
  isUpdatingCompanion: boolean;
  handleSetAsCompanion: () => Promise<void>;
  heroRef: React.RefObject<HTMLDivElement | null>;
  heroWidth: number;
  /** Current room (for indicator below name) */
  roomId: BlobbiRoomId;
  /** Room order for dot indicators */
  roomOrder?: BlobbiRoomId[];
  className?: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function BlobbiRoomHero({
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
  roomId,
  roomOrder = DEFAULT_ROOM_ORDER,
  className,
}: BlobbiRoomHeroProps) {
  const roomMeta = ROOM_META[roomId];
  const roomIndex = getRoomIndex(roomId, roomOrder);
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
          {isUpdatingCompanion ? <Loader2 className="size-4 animate-spin" /> : <Footprints className="size-4" />}
          <span>Bring {companion.name} home</span>
        </button>
      </div>
    );
  }

  return (
    <div
      ref={heroRef}
      className={cn(
        'relative flex flex-col items-center justify-center pt-10 px-4 sm:px-6 flex-1 min-h-0',
        className,
      )}
    >
      <div className="relative flex flex-col items-center">
        <StatsCrown companion={companion} currentStats={currentStats} heroWidth={heroWidth} />

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

        {!isEgg && (
          <h2
            className="text-xl sm:text-2xl md:text-3xl font-bold text-center mt-1"
            style={{ color: companion.visualTraits.baseColor }}
          >
            {companion.name}
          </h2>
        )}

        {/* Room indicator */}
        <div className="flex flex-col items-center mt-2">
          <div className="flex items-center gap-1.5">
            <roomMeta.icon className="size-3.5 sm:size-4 text-foreground/50" />
            <span className="text-xs sm:text-sm font-semibold text-foreground/60">{roomMeta.label}</span>
          </div>
          <div className="flex items-center gap-1.5 mt-1">
            {roomOrder.map((id, i) => (
              <div
                key={id}
                className={cn(
                  'rounded-full transition-all duration-300',
                  i === roomIndex ? 'w-4 h-1 bg-primary' : 'w-1 h-1 bg-muted-foreground/20',
                )}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Stats Crown ──────────────────────────────────────────────────────────────

function StatsCrown({
  companion,
  currentStats,
  heroWidth,
}: {
  companion: BlobbiCompanion;
  currentStats: BlobbiRoomHeroProps['currentStats'];
  heroWidth: number;
}) {
  const allStats = useMemo(() =>
    getVisibleStats(companion.stage).map(stat => {
      const value = currentStats[stat] ?? 100;
      const display = getBlobbiStatDisplayState({ stage: companion.stage, stat: stat as keyof BlobbiStats, value });
      return {
        stat,
        value,
        careState: display.careState,
        color: STAT_COLOR_MAP[stat],
      };
    }),
  [companion.stage, currentStats]);

  if (allStats.length === 0) return null;

  const count = allStats.length;
  const isSmall = heroWidth < 400;
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
        const radius = Math.min(200, Math.max(110, (heroWidth - 340) / (640 - 340) * (200 - 110) + 110));
        const x = Math.sin(angleRad) * radius;
        const y = Math.cos(angleRad) * radius - radius;

        return (
          <div
            key={s.stat}
            className="absolute transition-all duration-500"
            style={{
              transform: 'translate(-50%, 0)',
              left: `calc(50% + ${x.toFixed(1)}px)`,
              bottom: `${y.toFixed(1)}px`,
            }}
          >
            <StatIndicator stat={s.stat} value={s.value} color={s.color} careState={s.careState} />
          </div>
        );
      })}
    </div>
  );
}

// ─── Stat Indicator ───────────────────────────────────────────────────────────

function StatIndicator({
  stat,
  value,
  color,
  careState = 'good',
}: {
  stat: string;
  value: number | undefined;
  color: 'orange' | 'yellow' | 'green' | 'blue' | 'violet';
  careState?: CareState;
}) {
  const displayValue = value ?? 0;
  const showBadge = careState === 'attention' || careState === 'urgent';
  const showPulse = careState === 'urgent';
  const badgeColor = careState === 'urgent' ? 'text-red-500' : 'text-amber-500';
  const ringHex = STAT_RING_HEX[color];
  const IconComponent = STAT_ICON_MAP[stat];

  return (
    <div className={cn(
      'relative size-14 sm:size-[4.5rem] rounded-full flex items-center justify-center',
      STAT_BG_COLORS[color],
      showPulse && 'animate-pulse',
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
        {showBadge && (
          <AlertTriangle
            className={cn('absolute -top-1.5 -right-2 size-3', badgeColor)}
            strokeWidth={3}
          />
        )}
      </div>
    </div>
  );
}

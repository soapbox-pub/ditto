/**
 * BlobbiRoomStatusHud — Compact horizontal stat indicators for the room HUD.
 *
 * A gently arced row of segmented ring stat icons in the room's HUD. Tapping
 * one starts the stat guide; low stats glow and get a warning badge.
 */

import { useLayoutEffect, useMemo, useRef } from 'react';
import { defineMessages, useIntl } from 'react-intl';
import {
  Utensils, Gamepad2, Heart, Droplets, Zap, AlertTriangle,
} from 'lucide-react';

import { SegmentedRing } from '@/blobbi/ui/StatIndicator';
import { getVisibleStats } from '@blobbi-kit/core/blobbi-decay';
import { getBlobbiStatDisplayState } from '@blobbi-kit/core/blobbi-segments';
import { cn } from '@/lib/utils';
import { ROOM_META } from '../lib/room-config';
import { ROOM_CONTROL_SURFACE_SUBTLE } from '../lib/room-layout';
import { STAT_ROOM_MAP } from '../lib/stat-guide-config';

import type { CareState } from '@blobbi-kit/core/blobbi-segments';
import type { BlobbiCompanion, BlobbiStats } from '@blobbi-kit/core/blobbi';

// ─── Stat styles ──────────────────────────────────────────────────────────────

const STAT_STYLE: Record<string, { text: string; bg: string; hex: string; icon: React.ComponentType<{ className?: string; strokeWidth?: number }> }> = {
  hunger: { text: 'text-orange-500', bg: 'bg-orange-500/10', hex: '#f97316', icon: Utensils },
  happiness: { text: 'text-yellow-500', bg: 'bg-yellow-500/10', hex: '#eab308', icon: Gamepad2 },
  health: { text: 'text-green-500', bg: 'bg-green-500/10', hex: '#22c55e', icon: Heart },
  hygiene: { text: 'text-blue-500', bg: 'bg-blue-500/10', hex: '#3b82f6', icon: Droplets },
  energy: { text: 'text-violet-500', bg: 'bg-violet-500/10', hex: '#8b5cf6', icon: Zap },
};

const STAT_LABELS = defineMessages({
  hunger: { id: 'blobbiRoom.stat.hunger', defaultMessage: 'Hunger' },
  happiness: { id: 'blobbiRoom.stat.happiness', defaultMessage: 'Happiness' },
  health: { id: 'blobbiRoom.stat.health', defaultMessage: 'Health' },
  hygiene: { id: 'blobbiRoom.stat.hygiene', defaultMessage: 'Hygiene' },
  energy: { id: 'blobbiRoom.stat.energy', defaultMessage: 'Energy' },
});

// ─── Props ────────────────────────────────────────────────────────────────────

interface BlobbiRoomStatusHudProps {
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
  const intl = useIntl();
  const allStats = useMemo(() =>
    getVisibleStats(companion.stage).map(stat => {
      const value = currentStats[stat] ?? 100;
      const display = getBlobbiStatDisplayState({ stage: companion.stage, stat: stat as keyof BlobbiStats, value });
      return { stat, value, careState: display.careState, filled: display.filled, max: display.max };
    }),
  [companion.stage, currentStats]);

  if (allStats.length === 0) return null;

  const count = allStats.length;

  return (
    <div className="flex items-start justify-center gap-[0.6em]">
      {allStats.map((s, i) => {
        const stat = s.stat as keyof BlobbiStats;
        const name = STAT_LABELS[stat] ? intl.formatMessage(STAT_LABELS[stat]) : s.stat;
        const percent = Math.round(s.value);
        // Tapping takes you to the room that restores the stat (see BlobbiPage handleGuide)
        const room = STAT_ROOM_MAP[stat];
        const label = onGuide && room
          ? intl.formatMessage(
            { id: 'blobbiRoom.hud.statGuide', defaultMessage: '{stat} {percent}%, go to the {room}' },
            { stat: name, percent, room: intl.formatMessage(ROOM_META[room].label) },
          )
          : intl.formatMessage(
            { id: 'blobbiRoom.hud.stat', defaultMessage: '{stat} {percent}%' },
            { stat: name, percent },
          );
        return (
          <div key={s.stat} style={{ transform: `translateY(${getArcOffset(i, count) / 16}em)` }}>
            <button
              type="button"
              className={cn(
                'rounded-full transition-transform duration-200 active:scale-90 motion-reduce:active:scale-100',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                onGuide && 'cursor-pointer',
              )}
              aria-label={label}
              title={name}
              onClick={onGuide ? () => onGuide(stat) : undefined}
            >
              <StatIndicator stat={s.stat} careState={s.careState} filled={s.filled} max={s.max} />
            </button>
          </div>
        );
      })}
    </div>
  );
}

// ─── Stat Indicator ───────────────────────────────────────────────────────────

/** Keeps every glowing indicator in phase, however late it starts glowing. */
function usePhaseLockedGlow(careState: CareState) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el?.getAnimations) return;
    for (const animation of el.getAnimations()) {
      if (animation instanceof CSSAnimation && animation.animationName.startsWith('stat-glow-pulse')) {
        animation.startTime = 0;
      }
    }
  }, [careState]);
  return ref;
}

function StatIndicator({ stat, careState, filled, max }: { stat: string; careState: CareState; filled: number; max: number }) {
  const style = STAT_STYLE[stat];
  const isLow = careState === 'attention' || careState === 'urgent';
  const Icon = style?.icon;
  const glowRef = usePhaseLockedGlow(careState);

  return (
    <div
      ref={glowRef}
      className={cn(
        'relative size-[2.75em] rounded-full flex items-center justify-center',
        ROOM_CONTROL_SURFACE_SUBTLE, 'border border-border/20 shadow-sm',
        style?.bg,
        isLow && style?.text,
        careState === 'attention' && 'stat-glow-attention',
        careState === 'urgent' && 'stat-glow-urgent',
      )}
    >
      <svg className="absolute inset-0 -rotate-90" viewBox="0 0 36 36">
        <SegmentedRing filled={filled} max={max} fillHex={style?.hex ?? 'currentColor'} strokeWidth={2.5} gapDeg={16} />
      </svg>
      <div className="relative">
        {Icon && <Icon className={cn('size-[1.15em]', style.text)} strokeWidth={2.5} />}
        {isLow && (
          <AlertTriangle
            className={cn('absolute -top-[0.3em] -right-[0.4em] size-[0.65em]', careState === 'urgent' ? 'text-red-500' : 'text-amber-500')}
            strokeWidth={3}
          />
        )}
      </div>
    </div>
  );
}

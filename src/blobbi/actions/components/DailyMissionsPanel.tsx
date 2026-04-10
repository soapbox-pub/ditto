/**
 * DailyMissionsPanel — card-grid layout for daily bounties.
 *
 * Each mission is a compact card in a 2-col grid.
 * Tapping a card expands it to show progress and reroll.
 * Only one card expanded at a time.
 * Completion is implicit (derived from progress vs target).
 */

import { useState } from 'react';
import {
  Check,
  Sparkles,
  Gift,
  Egg,
  Trophy,
  RefreshCw,
  Heart,
  Utensils,
  Droplets,
  Moon,
  Camera,
  Mic,
  Music,
  Pill,
  CircleDot,
  Zap,
} from 'lucide-react';

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn, formatCompactNumber } from '@/lib/utils';
import type { DailyMissionAction } from '../lib/daily-missions';
import type { DailyMissionView } from '../hooks/useDailyMissions';
import {
  ExpandableMissionCard,
  MissionDescription,
  MissionProgress,
} from './ExpandableMissionCard';

// ─── Types ────────────────────────────────────────────────────────────────────

interface DailyMissionsPanelProps {
  missions: DailyMissionView[];
  onRerollMission?: (missionId: string) => void;
  todayXp: number;
  disabled?: boolean;
  bonusUnlocked?: boolean;
  bonusXp?: number;
  noMissionsAvailable?: boolean;
  rerollsRemaining?: number;
  isRerolling?: boolean;
}

// ─── Daily Mission Icon Mapping ───────────────────────────────────────────────

function DailyMissionIcon({ action }: { action: DailyMissionAction }) {
  const cls = 'size-5';
  switch (action) {
    case 'interact':
      return <Heart className={cls} />;
    case 'feed':
      return <Utensils className={cls} />;
    case 'clean':
      return <Droplets className={cls} />;
    case 'sleep':
      return <Moon className={cls} />;
    case 'take_photo':
      return <Camera className={cls} />;
    case 'sing':
      return <Mic className={cls} />;
    case 'play_music':
      return <Music className={cls} />;
    case 'medicine':
      return <Pill className={cls} />;
    default:
      return <CircleDot className={cls} />;
  }
}

// ─── Bonus Card ───────────────────────────────────────────────────────────────

interface BonusCardProps {
  isUnlocked: boolean;
  xp: number;
  isExpanded: boolean;
  onToggle: (id: string) => void;
}

function BonusCard({ isUnlocked, xp, isExpanded, onToggle }: BonusCardProps) {
  return (
    <ExpandableMissionCard
      id="bonus"
      category="daily"
      icon={<Trophy className="size-5" />}
      title="Daily Champion"
      completed={isUnlocked}
      progress={isUnlocked ? 1 : 0}
      isExpanded={isExpanded}
      onToggle={onToggle}
    >
      <MissionDescription>
        {isUnlocked
          ? 'Bonus XP for completing all daily missions!'
          : 'Complete all missions to unlock this bonus'}
      </MissionDescription>

      <div className="flex items-center gap-1 text-xs font-medium text-violet-600 dark:text-violet-400">
        <Zap className="size-3" />
        +{formatCompactNumber(xp)} XP
      </div>
    </ExpandableMissionCard>
  );
}

// ─── Empty / Done States ──────────────────────────────────────────────────────

function NoMissionsState() {
  return (
    <div className="flex flex-col items-center gap-2 py-6 text-center">
      <Egg className="size-5 text-muted-foreground/50" />
      <div>
        <p className="text-sm font-medium">Hatch your Blobbi first</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          Daily missions unlock after hatching
        </p>
      </div>
    </div>
  );
}

function AllCompleteState({ todayXp }: { todayXp: number }) {
  return (
    <div className="flex flex-col items-center gap-2 py-6 text-center">
      <Sparkles className="size-5 text-primary/60" />
      <div>
        <p className="text-sm font-medium">All done for today</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          Earned{' '}
          <span className="font-medium text-violet-600 dark:text-violet-400">
            {formatCompactNumber(todayXp)} XP
          </span>{' '}
          — come back tomorrow!
        </p>
      </div>
    </div>
  );
}

// ─── Reroll Counter ───────────────────────────────────────────────────────────

function RerollCounter({ remaining }: { remaining: number }) {
  const text =
    remaining === 0
      ? 'No rerolls left'
      : remaining === 1
        ? '1 reroll left'
        : `${remaining} rerolls left`;

  return (
    <div className="flex items-center justify-end gap-1 text-[11px] text-muted-foreground col-span-full">
      <RefreshCw className="size-2.5" />
      <span>{text}</span>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function DailyMissionsPanel({
  missions,
  onRerollMission,
  todayXp,
  disabled,
  bonusUnlocked = false,
  bonusXp = 50,
  noMissionsAvailable = false,
  rerollsRemaining = 0,
  isRerolling = false,
}: DailyMissionsPanelProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (noMissionsAvailable) return <NoMissionsState />;

  const allComplete = missions.every((m) => m.complete);
  if (allComplete && bonusUnlocked) return <AllCompleteState todayXp={todayXp} />;

  const canReroll = rerollsRemaining > 0 && !!onRerollMission;

  const handleToggle = (id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
      {/* Reroll counter */}
      {onRerollMission && <RerollCounter remaining={rerollsRemaining} />}

      {/* Regular mission cards */}
      {missions.map((mission) => {
        const progressFrac = mission.target > 0 ? mission.progress / mission.target : 0;
        const showReroll = onRerollMission && !mission.complete && canReroll;

        return (
          <ExpandableMissionCard
            key={mission.id}
            id={mission.id}
            category="daily"
            icon={<DailyMissionIcon action={mission.action} />}
            title={mission.title}
            completed={mission.complete}
            progress={Math.min(progressFrac, 1)}
            isExpanded={expandedId === mission.id}
            onToggle={handleToggle}
          >
            {/* Description */}
            <MissionDescription>{mission.description}</MissionDescription>

            {/* Progress */}
            {!mission.complete && (
              <MissionProgress
                current={mission.progress}
                required={mission.target}
                completed={mission.complete}
              />
            )}

            {/* XP + reroll row */}
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-0.5 text-xs font-medium text-violet-600 dark:text-violet-400">
                <Zap className="size-3" />
                {formatCompactNumber(mission.xp)} XP
              </span>

              {showReroll && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onRerollMission(mission.id);
                        }}
                        disabled={disabled || isRerolling}
                        className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-40"
                      >
                        <RefreshCw className={cn('size-3', isRerolling && 'animate-spin')} />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="left">
                      <p>Replace mission</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}

              {mission.complete && (
                <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-primary">
                  <Check className="size-2.5" />
                  Done
                </span>
              )}
            </div>

            {/* Complete indicator */}
            {mission.complete && (
              <div className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
                <Gift className="size-3.5" />
                +{formatCompactNumber(mission.xp)} XP earned
              </div>
            )}
          </ExpandableMissionCard>
        );
      })}

      {/* Bonus card */}
      <BonusCard
        isUnlocked={bonusUnlocked}
        xp={bonusXp}
        isExpanded={expandedId === 'bonus'}
        onToggle={handleToggle}
      />
    </div>
  );
}

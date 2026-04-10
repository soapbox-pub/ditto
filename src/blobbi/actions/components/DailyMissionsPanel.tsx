/**
 * DailyMissionsPanel — card-grid layout for daily bounties.
 *
 * Each mission is a compact card in a 2-col grid.
 * Tapping a card expands it to show progress, claim button, and reroll.
 * Only one card expanded at a time.
 */

import { useState } from 'react';
import {
  Check,
  Zap,
  Gift,
  Sparkles,
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
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn, formatCompactNumber } from '@/lib/utils';
import type { DailyMission, DailyMissionAction } from '../lib/daily-missions';
import { BONUS_MISSION_ID } from '../hooks/useClaimMissionReward';
import {
  ExpandableMissionCard,
  MissionDescription,
  MissionProgress,
} from './ExpandableMissionCard';

// ─── Types ────────────────────────────────────────────────────────────────────

interface DailyMissionsPanelProps {
  missions: DailyMission[];
  onClaimReward: (missionId: string) => void;
  onRerollMission?: (missionId: string) => void;
  todayXp: number;
  disabled?: boolean;
  bonusAvailable?: boolean;
  bonusClaimed?: boolean;
  bonusReward?: number;
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
  isAvailable: boolean;
  isClaimed: boolean;
  reward: number;
  onClaim: () => void;
  disabled?: boolean;
  isExpanded: boolean;
  onToggle: (id: string) => void;
}

function BonusCard({ isAvailable, isClaimed, reward, onClaim, disabled, isExpanded, onToggle }: BonusCardProps) {
  const progress = isClaimed ? 1 : isAvailable ? 1 : 0;

  return (
    <ExpandableMissionCard
      id="bonus"
      category="daily"
      icon={<Trophy className="size-5" />}
      title="Daily Champion"
      completed={isClaimed}
      progress={progress}
      isExpanded={isExpanded}
      onToggle={onToggle}
    >
      <MissionDescription>
        {isAvailable || isClaimed
          ? 'Bonus reward for completing all daily missions!'
          : 'Complete all missions to unlock this bonus'}
      </MissionDescription>

      <div className="flex items-center gap-1 text-xs font-medium text-amber-600 dark:text-amber-400">
        <Zap className="size-3" />
        +{formatCompactNumber(reward)}
      </div>

      {isAvailable && !isClaimed && (
        <Button
          size="sm"
          onClick={onClaim}
          disabled={disabled}
          className="w-full bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white h-8 text-xs"
        >
          <Trophy className="size-3.5 mr-1.5" />
          Claim +{formatCompactNumber(reward)} XP
        </Button>
      )}
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

function AllClaimedState({ todayXp }: { todayXp: number }) {
  return (
    <div className="flex flex-col items-center gap-2 py-6 text-center">
      <Sparkles className="size-5 text-primary/60" />
      <div>
        <p className="text-sm font-medium">All done for today</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          Earned{' '}
          <span className="font-medium text-amber-600 dark:text-amber-400">
            {formatCompactNumber(todayXp)} XP earned
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
  onClaimReward,
  onRerollMission,
  todayXp,
  disabled,
  bonusAvailable = false,
  bonusClaimed = false,
  bonusReward = 50,
  noMissionsAvailable = false,
  rerollsRemaining = 0,
  isRerolling = false,
}: DailyMissionsPanelProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (noMissionsAvailable) return <NoMissionsState />;

  const allRegularClaimed = missions.every((m) => m.claimed);
  const allDone = allRegularClaimed && bonusClaimed;

  if (allDone) return <AllClaimedState todayXp={todayXp} />;

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
        const progress = mission.requiredCount > 0 ? mission.currentCount / mission.requiredCount : 0;
        const canClaim = mission.completed && !mission.claimed;
        const showReroll = onRerollMission && !mission.completed && !mission.claimed && canReroll;

        return (
          <ExpandableMissionCard
            key={mission.id}
            id={mission.id}
            category="daily"
            icon={<DailyMissionIcon action={mission.action} />}
            title={mission.title}
            completed={mission.claimed}
            progress={Math.min(progress, 1)}
            isExpanded={expandedId === mission.id}
            onToggle={handleToggle}
          >
            {/* Description */}
            <MissionDescription>{mission.description}</MissionDescription>

            {/* Progress */}
            {!mission.claimed && (
              <MissionProgress
                current={mission.currentCount}
                required={mission.requiredCount}
                completed={mission.completed}
              />
            )}

            {/* Reward + reroll row */}
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-0.5 text-xs font-medium text-amber-600 dark:text-amber-400">
                <Zap className="size-3" />
                {formatCompactNumber(mission.reward)}
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

              {mission.claimed && (
                <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-primary">
                  <Check className="size-2.5" />
                  Done
                </span>
              )}
            </div>

            {/* Claim button */}
            {canClaim && (
              <Button
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  onClaimReward(mission.id);
                }}
                disabled={disabled}
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white h-8 text-xs"
              >
                <Gift className="size-3.5 mr-1.5" />
                Claim +{formatCompactNumber(mission.reward)} XP
              </Button>
            )}
          </ExpandableMissionCard>
        );
      })}

      {/* Bonus card */}
      <BonusCard
        isAvailable={bonusAvailable}
        isClaimed={bonusClaimed}
        reward={bonusReward}
        onClaim={() => onClaimReward(BONUS_MISSION_ID)}
        disabled={disabled}
        isExpanded={expandedId === 'bonus'}
        onToggle={handleToggle}
      />
    </div>
  );
}

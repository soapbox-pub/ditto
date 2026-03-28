/**
 * DailyMissionsPanel - UI component for displaying daily missions
 * 
 * Shows:
 * - Daily mission list with progress bars
 * - Completion state
 * - Claim buttons for completed missions
 * - Coin rewards
 * - Bonus mission after completing all regular missions
 * - Empty state when no missions available (egg-only users)
 */

import { Check, Coins, Gift, Sparkles, Egg, Trophy } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { cn, formatCompactNumber } from '@/lib/utils';
import type { DailyMission } from '../lib/daily-missions';
import { BONUS_MISSION_ID } from '../hooks/useClaimMissionReward';

// ─── Types ────────────────────────────────────────────────────────────────────

interface DailyMissionsPanelProps {
  /** The daily missions to display */
  missions: DailyMission[];
  /** Callback when claiming a mission reward */
  onClaimReward: (missionId: string) => void;
  /** Total coins earned today */
  todayCoins: number;
  /** Whether claiming is disabled (e.g., during another operation) */
  disabled?: boolean;
  /** Whether the bonus mission is available */
  bonusAvailable?: boolean;
  /** Whether the bonus mission has been claimed */
  bonusClaimed?: boolean;
  /** Bonus mission reward amount */
  bonusReward?: number;
  /** Whether user has no eligible missions (e.g., only eggs) */
  noMissionsAvailable?: boolean;
}

// ─── Mission Item ─────────────────────────────────────────────────────────────

interface MissionItemProps {
  mission: DailyMission;
  onClaim: () => void;
  disabled?: boolean;
}

function MissionItem({ mission, onClaim, disabled }: MissionItemProps) {
  const progressPercent = (mission.currentCount / mission.requiredCount) * 100;
  const canClaim = mission.completed && !mission.claimed;

  return (
    <div
      className={cn(
        'relative p-3 sm:p-4 rounded-lg border transition-colors overflow-hidden',
        mission.claimed
          ? 'bg-primary/5 border-primary/20'
          : mission.completed
            ? 'bg-green-500/5 border-green-500/30'
            : 'bg-card border-border'
      )}
    >
      {/* Claimed badge */}
      {mission.claimed && (
        <div className="absolute top-2 right-2">
          <div className="flex items-center gap-1 text-xs text-primary font-medium">
            <Check className="size-3" />
            Claimed
          </div>
        </div>
      )}

      {/* Mission content */}
      <div className="space-y-2 sm:space-y-3">
        {/* Title and description */}
        <div className="pr-14 sm:pr-16">
          <h4 className="font-medium text-sm break-words">{mission.title}</h4>
          <p className="text-xs text-muted-foreground mt-0.5 break-words">
            {mission.description}
          </p>
        </div>

        {/* Progress bar */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs gap-2">
            <span className="text-muted-foreground whitespace-nowrap">
              {mission.currentCount} / {mission.requiredCount}
            </span>
            <span className="flex items-center gap-1 font-medium text-amber-600 dark:text-amber-400 whitespace-nowrap">
              <Coins className="size-3 shrink-0" />
              {formatCompactNumber(mission.reward)}
            </span>
          </div>
          <Progress
            value={progressPercent}
            className={cn(
              'h-2',
              mission.completed && '[&>div]:bg-green-500'
            )}
          />
        </div>

        {/* Claim button */}
        {canClaim && (
          <Button
            size="sm"
            onClick={onClaim}
            disabled={disabled}
            className="w-full bg-green-600 hover:bg-green-700 text-white"
          >
            <Gift className="size-4 mr-2 shrink-0" />
            <span className="truncate">Claim {formatCompactNumber(mission.reward)} Coins</span>
          </Button>
        )}
      </div>
    </div>
  );
}

// ─── Bonus Mission Item ───────────────────────────────────────────────────────

interface BonusMissionItemProps {
  isAvailable: boolean;
  isClaimed: boolean;
  reward: number;
  onClaim: () => void;
  disabled?: boolean;
}

function BonusMissionItem({ isAvailable, isClaimed, reward, onClaim, disabled }: BonusMissionItemProps) {
  return (
    <div
      className={cn(
        'relative p-3 sm:p-4 rounded-lg border-2 transition-colors overflow-hidden',
        isClaimed
          ? 'bg-amber-500/10 border-amber-500/30'
          : isAvailable
            ? 'bg-gradient-to-br from-amber-500/10 to-orange-500/10 border-amber-500/40 animate-pulse'
            : 'bg-muted/30 border-dashed border-muted-foreground/20'
      )}
    >
      {/* Claimed badge */}
      {isClaimed && (
        <div className="absolute top-2 right-2">
          <div className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400 font-medium">
            <Check className="size-3" />
            Claimed
          </div>
        </div>
      )}

      {/* Mission content */}
      <div className="space-y-2 sm:space-y-3">
        {/* Title and description */}
        <div className={cn("pr-14 sm:pr-16", !isAvailable && !isClaimed && "opacity-50")}>
          <div className="flex items-center gap-2">
            <Trophy className={cn(
              "size-4 shrink-0",
              isClaimed 
                ? "text-amber-600 dark:text-amber-400"
                : isAvailable 
                  ? "text-amber-500" 
                  : "text-muted-foreground"
            )} />
            <h4 className="font-medium text-sm">Daily Champion</h4>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {isAvailable || isClaimed 
              ? 'Bonus reward for completing all daily missions!'
              : 'Complete all missions above to unlock this bonus'}
          </p>
        </div>

        {/* Reward display */}
        <div className="flex items-center justify-between text-xs gap-2">
          <span className={cn(
            "text-muted-foreground",
            !isAvailable && !isClaimed && "opacity-50"
          )}>
            Bonus Reward
          </span>
          <span className={cn(
            "flex items-center gap-1 font-medium",
            isClaimed || isAvailable 
              ? "text-amber-600 dark:text-amber-400" 
              : "text-muted-foreground"
          )}>
            <Coins className="size-3 shrink-0" />
            +{formatCompactNumber(reward)}
          </span>
        </div>

        {/* Claim button */}
        {isAvailable && !isClaimed && (
          <Button
            size="sm"
            onClick={onClaim}
            disabled={disabled}
            className="w-full bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white"
          >
            <Trophy className="size-4 mr-2 shrink-0" />
            <span className="truncate">Claim Bonus {formatCompactNumber(reward)} Coins!</span>
          </Button>
        )}
      </div>
    </div>
  );
}

// ─── No Missions Available State ──────────────────────────────────────────────

function NoMissionsState() {
  return (
    <div className="flex flex-col items-center gap-3 py-6 text-center">
      <div className="size-12 rounded-full bg-muted flex items-center justify-center">
        <Egg className="size-6 text-muted-foreground" />
      </div>
      <div className="space-y-1">
        <h4 className="font-semibold text-sm">Hatch Your Blobbi First</h4>
        <p className="text-xs text-muted-foreground">
          Daily missions will be available once you have
          <br />
          a hatched Blobbi to interact with!
        </p>
      </div>
    </div>
  );
}

// ─── All Claimed State ────────────────────────────────────────────────────────

interface AllClaimedStateProps {
  todayCoins: number;
}

function AllClaimedState({ todayCoins }: AllClaimedStateProps) {
  return (
    <div className="flex flex-col items-center gap-3 py-6 text-center">
      <div className="size-12 rounded-full bg-primary/10 flex items-center justify-center">
        <Sparkles className="size-6 text-primary" />
      </div>
      <div className="space-y-1">
        <h4 className="font-semibold text-sm">All Done for Today!</h4>
        <p className="text-xs text-muted-foreground">
          You earned <span className="font-medium text-amber-600 dark:text-amber-400">{formatCompactNumber(todayCoins)} coins</span> today.
          <br />
          Come back tomorrow for new missions!
        </p>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function DailyMissionsPanel({
  missions,
  onClaimReward,
  todayCoins,
  disabled,
  bonusAvailable = false,
  bonusClaimed = false,
  bonusReward = 50,
  noMissionsAvailable = false,
}: DailyMissionsPanelProps) {
  // Show empty state if user has no eligible missions (e.g., only eggs)
  if (noMissionsAvailable) {
    return <NoMissionsState />;
  }

  const allRegularClaimed = missions.every((m) => m.claimed);
  const allDone = allRegularClaimed && bonusClaimed;

  // Show "all done" state only when everything including bonus is claimed
  if (allDone) {
    return <AllClaimedState todayCoins={todayCoins} />;
  }

  return (
    <div className="space-y-3">
      {/* Regular missions */}
      {missions.map((mission) => (
        <MissionItem
          key={mission.id}
          mission={mission}
          onClaim={() => onClaimReward(mission.id)}
          disabled={disabled}
        />
      ))}
      
      {/* Bonus mission - always visible */}
      <BonusMissionItem
        isAvailable={bonusAvailable}
        isClaimed={bonusClaimed}
        reward={bonusReward}
        onClaim={() => onClaimReward(BONUS_MISSION_ID)}
        disabled={disabled}
      />
    </div>
  );
}

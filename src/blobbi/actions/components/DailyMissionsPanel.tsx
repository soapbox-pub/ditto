/**
 * DailyMissionsPanel - UI component for displaying daily missions
 * 
 * Shows:
 * - Daily mission list with progress bars
 * - Completion state
 * - Claim buttons for completed missions
 * - Coin rewards
 */

import { Check, Coins, Gift, Sparkles } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { cn, formatCompactNumber } from '@/lib/utils';
import type { DailyMission } from '../lib/daily-missions';

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
}: DailyMissionsPanelProps) {
  const allClaimed = missions.every((m) => m.claimed);

  if (allClaimed) {
    return <AllClaimedState todayCoins={todayCoins} />;
  }

  return (
    <div className="space-y-3">
      {missions.map((mission) => (
        <MissionItem
          key={mission.id}
          mission={mission}
          onClaim={() => onClaimReward(mission.id)}
          disabled={disabled}
        />
      ))}
    </div>
  );
}

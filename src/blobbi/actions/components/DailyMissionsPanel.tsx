/**
 * DailyMissionsPanel — lightweight bounty-board–style daily missions.
 *
 * Each mission is a flat, compact row. Claimed missions fade to a muted state.
 * The bonus mission is visually distinct but stays light.
 */

import { Check, Coins, Gift, Sparkles, Egg, Trophy, RefreshCw } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn, formatCompactNumber } from '@/lib/utils';
import type { DailyMission } from '../lib/daily-missions';
import { BONUS_MISSION_ID } from '../hooks/useClaimMissionReward';

// ─── Types ────────────────────────────────────────────────────────────────────

interface DailyMissionsPanelProps {
  missions: DailyMission[];
  onClaimReward: (missionId: string) => void;
  onRerollMission?: (missionId: string) => void;
  todayCoins: number;
  disabled?: boolean;
  bonusAvailable?: boolean;
  bonusClaimed?: boolean;
  bonusReward?: number;
  noMissionsAvailable?: boolean;
  rerollsRemaining?: number;
  isRerolling?: boolean;
}

// ─── Mission Item ─────────────────────────────────────────────────────────────

interface MissionItemProps {
  mission: DailyMission;
  onClaim: () => void;
  onReroll?: () => void;
  disabled?: boolean;
  canReroll?: boolean;
  isRerolling?: boolean;
}

function MissionItem({ mission, onClaim, onReroll, disabled, canReroll = false, isRerolling = false }: MissionItemProps) {
  const progressPercent = (mission.currentCount / mission.requiredCount) * 100;
  const canClaim = mission.completed && !mission.claimed;
  const showRerollButton = onReroll && !mission.completed && !mission.claimed && canReroll;

  return (
    <div
      className={cn(
        'rounded-xl p-3 transition-colors',
        mission.claimed
          ? 'bg-primary/5 opacity-60'
          : mission.completed
            ? 'bg-emerald-500/5'
            : 'bg-muted/40',
      )}
    >
      {/* Header row: title + reward + reroll/claimed badge */}
      <div className="flex items-start justify-between gap-2 mb-1">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-medium leading-tight truncate">{mission.title}</span>
            {mission.claimed && (
              <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-primary shrink-0">
                <Check className="size-2.5" />
                Done
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground leading-snug mt-0.5 line-clamp-1">
            {mission.description}
          </p>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {/* Coin reward badge */}
          <span className="inline-flex items-center gap-0.5 text-xs font-medium text-amber-600 dark:text-amber-400">
            <Coins className="size-3" />
            {formatCompactNumber(mission.reward)}
          </span>

          {/* Reroll button */}
          {showRerollButton && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={onReroll}
                    disabled={disabled || isRerolling}
                    className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-40"
                  >
                    <RefreshCw className={cn('size-3', isRerolling && 'animate-spin')} />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="left">
                  <p>Replace this mission</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
      </div>

      {/* Progress row */}
      {!mission.claimed && (
        <div className="mt-2">
          <div className="flex items-center justify-between text-[11px] text-muted-foreground mb-1">
            <span className="tabular-nums">
              {mission.currentCount} / {mission.requiredCount}
            </span>
          </div>
          <Progress
            value={progressPercent}
            className={cn('h-1.5', mission.completed && '[&>div]:bg-emerald-500')}
          />
        </div>
      )}

      {/* Claim button */}
      {canClaim && (
        <Button
          size="sm"
          onClick={onClaim}
          disabled={disabled}
          className="w-full mt-2.5 bg-emerald-600 hover:bg-emerald-700 text-white h-8 text-xs"
        >
          <Gift className="size-3.5 mr-1.5" />
          Claim {formatCompactNumber(mission.reward)} Coins
        </Button>
      )}
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
        'rounded-xl p-3 transition-colors',
        isClaimed
          ? 'bg-amber-500/5 opacity-60'
          : isAvailable
            ? 'bg-gradient-to-br from-amber-500/10 to-orange-500/10'
            : 'bg-muted/25 opacity-50',
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Trophy
            className={cn(
              'size-4 shrink-0',
              isClaimed || isAvailable
                ? 'text-amber-500 dark:text-amber-400'
                : 'text-muted-foreground',
            )}
          />
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-medium">Daily Champion</span>
              {isClaimed && (
                <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400 shrink-0">
                  <Check className="size-2.5" />
                  Done
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground leading-snug">
              {isAvailable || isClaimed
                ? 'Bonus for completing all daily missions'
                : 'Complete all missions to unlock'}
            </p>
          </div>
        </div>

        <span
          className={cn(
            'text-xs font-medium shrink-0',
            isClaimed || isAvailable
              ? 'text-amber-600 dark:text-amber-400'
              : 'text-muted-foreground',
          )}
        >
          <span className="inline-flex items-center gap-0.5">
            <Coins className="size-3" />
            +{formatCompactNumber(reward)}
          </span>
        </span>
      </div>

      {/* Claim button */}
      {isAvailable && !isClaimed && (
        <Button
          size="sm"
          onClick={onClaim}
          disabled={disabled}
          className="w-full mt-2.5 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white h-8 text-xs"
        >
          <Trophy className="size-3.5 mr-1.5" />
          Claim Bonus {formatCompactNumber(reward)} Coins
        </Button>
      )}
    </div>
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

function AllClaimedState({ todayCoins }: { todayCoins: number }) {
  return (
    <div className="flex flex-col items-center gap-2 py-6 text-center">
      <Sparkles className="size-5 text-primary/60" />
      <div>
        <p className="text-sm font-medium">All done for today</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          Earned{' '}
          <span className="font-medium text-amber-600 dark:text-amber-400">
            {formatCompactNumber(todayCoins)} coins
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
    <div className="flex items-center justify-end gap-1 text-[11px] text-muted-foreground">
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
  todayCoins,
  disabled,
  bonusAvailable = false,
  bonusClaimed = false,
  bonusReward = 50,
  noMissionsAvailable = false,
  rerollsRemaining = 0,
  isRerolling = false,
}: DailyMissionsPanelProps) {
  if (noMissionsAvailable) {
    return <NoMissionsState />;
  }

  const allRegularClaimed = missions.every((m) => m.claimed);
  const allDone = allRegularClaimed && bonusClaimed;

  if (allDone) {
    return <AllClaimedState todayCoins={todayCoins} />;
  }

  const canReroll = rerollsRemaining > 0 && !!onRerollMission;

  return (
    <div className="space-y-2">
      {/* Reroll counter */}
      {onRerollMission && <RerollCounter remaining={rerollsRemaining} />}

      {/* Regular missions */}
      {missions.map((mission) => (
        <MissionItem
          key={mission.id}
          mission={mission}
          onClaim={() => onClaimReward(mission.id)}
          onReroll={onRerollMission ? () => onRerollMission(mission.id) : undefined}
          disabled={disabled}
          canReroll={canReroll}
          isRerolling={isRerolling}
        />
      ))}

      {/* Bonus mission */}
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

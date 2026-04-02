// src/blobbi/actions/components/BlobbiMissionsModal.tsx

/**
 * Missions modal for Blobbi — "Guild Quest Board" redesign.
 *
 * Layout:
 * 1. Sticky header with title + subtitle
 * 2. Current Focus section (hatch / evolve tasks) — primary visual focus
 * 3. Daily Missions section — secondary bounties
 * 4. Settings row — low emphasis toggle at footer
 */

import { Loader2, XCircle, AlertTriangle, Coins, X, Eye, Scroll, Compass } from 'lucide-react';
import { formatCompactNumber, cn } from '@/lib/utils';

import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogClose } from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useState } from 'react';

import type { BlobbiCompanion, BlobbonautProfile } from '@/blobbi/core/lib/blobbi';
import type { NostrEvent } from '@nostrify/nostrify';
import type { HatchTasksResult } from '../hooks/useHatchTasks';
import type { EvolveTasksResult } from '../hooks/useEvolveTasks';
import { TasksPanel } from './TasksPanel';
import { DailyMissionsPanel } from './DailyMissionsPanel';
import { useDailyMissions } from '../hooks/useDailyMissions';
import { useClaimMissionReward } from '../hooks/useClaimMissionReward';
import { useRerollMission } from '../hooks/useRerollMission';

// ─── Types ────────────────────────────────────────────────────────────────────

interface BlobbiMissionsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Current companion being viewed */
  companion: BlobbiCompanion;
  /** Current Blobbonaut profile (required for coin updates) */
  profile: BlobbonautProfile | null;
  /** Callback to update profile in query cache after claiming */
  updateProfileEvent: (event: NostrEvent) => void;
  /** Hatch tasks result from useHatchTasks */
  hatchTasks: HatchTasksResult;
  /** Evolve tasks result from useEvolveTasks */
  evolveTasks: EvolveTasksResult;
  /** Called when user clicks "Create Post" action in tasks */
  onOpenPostModal: () => void;
  /** Called when all hatch tasks are complete and user clicks "Hatch" */
  onHatch: () => void;
  /** Whether hatching is in progress */
  isHatching: boolean;
  /** Called when all evolve tasks are complete and user clicks "Evolve" */
  onEvolve: () => void;
  /** Whether evolving is in progress */
  isEvolving: boolean;
  /** Called when user confirms stopping incubation */
  onStopIncubation: () => Promise<void>;
  /** Whether stop incubation is in progress */
  isStoppingIncubation: boolean;
  /** Called when user confirms stopping evolution */
  onStopEvolution: () => Promise<void>;
  /** Whether stop evolution is in progress */
  isStoppingEvolution: boolean;
  /** Available Blobbi stages across all user's companions (for mission filtering) */
  availableStages?: ('egg' | 'baby' | 'adult')[];
  /** Whether the inline mission surface card on the main page is visible */
  showMissionCard?: boolean;
  /** Toggle the inline mission surface card visibility */
  onToggleMissionCard?: (visible: boolean) => void;
}

// ─── Daily Missions Section ───────────────────────────────────────────────────

interface DailyMissionsSectionProps {
  profile: BlobbonautProfile | null;
  updateProfileEvent: (event: NostrEvent) => void;
  availableStages?: ('egg' | 'baby' | 'adult')[];
  disabled?: boolean;
}

function DailyMissionsSection({ profile, updateProfileEvent, availableStages, disabled }: DailyMissionsSectionProps) {
  const {
    missions,
    todayClaimedReward,
    totalPotentialReward,
    bonusAvailable,
    bonusClaimed,
    bonusReward,
    noMissionsAvailable,
    rerollsRemaining,
  } = useDailyMissions({ availableStages });

  const { mutate: claimReward, isPending: isClaiming } = useClaimMissionReward(
    profile,
    updateProfileEvent,
  );

  const { mutate: rerollMission, isPending: isRerolling } = useRerollMission();

  return (
    <section>
      {/* Section header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Scroll className="size-4 text-amber-500 dark:text-amber-400" />
          <h3 className="font-semibold text-sm">Daily Bounties</h3>
        </div>
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <Coins className="size-3 shrink-0 text-amber-500 dark:text-amber-400" />
          <span>
            {formatCompactNumber(todayClaimedReward)} / {formatCompactNumber(totalPotentialReward)}
          </span>
        </div>
      </div>

      {/* Mission list */}
      <DailyMissionsPanel
        missions={missions}
        onClaimReward={(id) => claimReward({ missionId: id })}
        onRerollMission={(id) => rerollMission({ missionId: id, availableStages })}
        todayCoins={todayClaimedReward}
        disabled={disabled || isClaiming || isRerolling}
        bonusAvailable={bonusAvailable}
        bonusClaimed={bonusClaimed}
        bonusReward={bonusReward}
        noMissionsAvailable={noMissionsAvailable}
        rerollsRemaining={rerollsRemaining}
        isRerolling={isRerolling}
      />
    </section>
  );
}

// ─── Stop Process Confirmation Dialog ─────────────────────────────────────────

interface StopConfirmationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companionName: string;
  processType: 'incubation' | 'evolution';
  onConfirm: () => Promise<void>;
  isPending: boolean;
}

function StopConfirmationDialog({
  open,
  onOpenChange,
  companionName,
  processType,
  onConfirm,
  isPending,
}: StopConfirmationDialogProps) {
  const handleConfirm = async () => {
    await onConfirm();
    onOpenChange(false);
  };

  const label = processType === 'incubation' ? 'Incubation' : 'Evolution';

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle className="size-5 text-amber-500" />
            Stop {label}?
          </AlertDialogTitle>
          <AlertDialogDescription className="space-y-2">
            <p>
              Are you sure you want to stop {processType === 'incubation' ? 'incubating' : 'evolving'}{' '}
              <strong>{companionName}</strong>?
            </p>
            <p>
              This will interrupt the {processType} process and clear all task progress.
              You can restart {processType} later, but you'll need to complete the tasks again.
            </p>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            disabled={isPending}
            className="bg-destructive hover:bg-destructive/90"
          >
            {isPending ? (
              <>
                <Loader2 className="size-4 mr-2 animate-spin" />
                Stopping...
              </>
            ) : (
              `Stop ${label}`
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ─── Current Focus Section (Hatch / Evolve) ──────────────────────────────────

interface CurrentFocusSectionProps {
  companion: BlobbiCompanion;
  tasks: HatchTasksResult | EvolveTasksResult;
  processType: 'incubation' | 'evolution';
  onOpenPostModal: () => void;
  onComplete: () => void;
  isCompleting: boolean;
  onStop: () => Promise<void>;
  isStopping: boolean;
}

function CurrentFocusSection({
  companion,
  tasks,
  processType,
  onOpenPostModal,
  onComplete,
  isCompleting,
  onStop,
  isStopping,
}: CurrentFocusSectionProps) {
  const [showStopConfirmation, setShowStopConfirmation] = useState(false);

  const isIncubation = processType === 'incubation';
  const emoji = isIncubation ? '🥚' : '🐣';
  const title = isIncubation ? 'Hatch Tasks' : 'Evolve Tasks';
  const description = isIncubation
    ? 'Complete these tasks to hatch your Blobbi'
    : 'Complete these tasks to evolve your Blobbi';
  const completeLabel = isIncubation ? 'Hatch Your Blobbi!' : 'Evolve Your Blobbi!';
  const completingLabel = isIncubation ? 'Hatching...' : 'Evolving...';
  const completeEmoji = isIncubation ? '🐣' : '✨';
  const stopLabel = isIncubation ? 'Stop Incubation' : 'Stop Evolution';
  const badgeLabel = isIncubation ? 'Hatch' : 'Evolve';

  const completedCount = tasks.tasks.filter((t) => t.completed).length;
  const totalTasks = tasks.tasks.length;

  return (
    <section>
      {/* Section header with badge + progress counter */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className={cn(
            'text-xs font-semibold px-2 py-0.5',
            isIncubation
              ? 'bg-sky-500/15 text-sky-600 dark:text-sky-400'
              : 'bg-violet-500/15 text-violet-600 dark:text-violet-400',
          )}>
            {badgeLabel}
          </Badge>
          <span className="text-sm font-semibold">{title}</span>
        </div>
        <span className={cn(
          'text-xs font-medium tabular-nums',
          tasks.allCompleted
            ? 'text-emerald-600 dark:text-emerald-400'
            : 'text-muted-foreground',
        )}>
          {completedCount} / {totalTasks}
        </span>
      </div>

      {/* Task list */}
      <TasksPanel
        tasks={tasks.tasks}
        allCompleted={tasks.allCompleted}
        isLoading={tasks.isLoading}
        onOpenPostModal={onOpenPostModal}
        onComplete={onComplete}
        isCompleting={isCompleting}
        emoji={emoji}
        title={title}
        description={description}
        completeLabel={completeLabel}
        completingLabel={completingLabel}
        completeEmoji={completeEmoji}
      />

      {/* Stop process — low-emphasis */}
      <div className="mt-3 flex justify-center">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowStopConfirmation(true)}
          disabled={isStopping || isCompleting}
          className="text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/10 h-8 px-3"
        >
          {isStopping ? (
            <>
              <Loader2 className="size-3.5 mr-1.5 animate-spin" />
              Stopping...
            </>
          ) : (
            <>
              <XCircle className="size-3.5 mr-1.5" />
              {stopLabel}
            </>
          )}
        </Button>
      </div>

      <StopConfirmationDialog
        open={showStopConfirmation}
        onOpenChange={setShowStopConfirmation}
        companionName={companion.name}
        processType={processType}
        onConfirm={onStop}
        isPending={isStopping}
      />
    </section>
  );
}

// ─── Empty Focus State ────────────────────────────────────────────────────────

function EmptyFocusState() {
  return (
    <div className="py-6 text-center">
      <Compass className="size-5 text-muted-foreground/50 mx-auto mb-2" />
      <p className="text-sm text-muted-foreground">
        No active progression right now
      </p>
    </div>
  );
}

// ─── Main Modal ───────────────────────────────────────────────────────────────

export function BlobbiMissionsModal({
  open,
  onOpenChange,
  companion,
  profile,
  updateProfileEvent,
  hatchTasks,
  evolveTasks,
  onOpenPostModal,
  onHatch,
  isHatching,
  onEvolve,
  isEvolving,
  onStopIncubation,
  isStoppingIncubation,
  onStopEvolution,
  isStoppingEvolution,
  availableStages,
  showMissionCard,
  onToggleMissionCard,
}: BlobbiMissionsModalProps) {
  const isIncubating = companion.state === 'incubating';
  const isEvolvingState = companion.state === 'evolving';
  const isEgg = companion.stage === 'egg';
  const isBaby = companion.stage === 'baby';

  const hasActiveProcess = (isIncubating && isEgg) || (isEvolvingState && isBaby);
  const isProcessBusy = isHatching || isEvolving || isStoppingIncubation || isStoppingEvolution;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg w-[calc(100%-2rem)] max-h-[85vh] flex flex-col p-0 gap-0 overflow-hidden [&>button:last-child]:hidden">
        {/* ── Sticky Header ── */}
        <div className="sticky top-0 z-10 bg-background px-4 sm:px-5 pt-4 pb-3 border-b border-border/60">
          <div className="flex items-center justify-between">
            <div className="min-w-0">
              <h2 className="text-base font-bold tracking-tight">Missions</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Quests & bounties for {companion.name}
              </p>
            </div>
            <DialogClose className="rounded-full p-1.5 -mr-1.5 opacity-60 hover:opacity-100 hover:bg-muted transition-all shrink-0">
              <X className="size-4" />
              <span className="sr-only">Close</span>
            </DialogClose>
          </div>
        </div>

        {/* ── Scrollable Content ── */}
        <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-4 sm:px-5 py-4 space-y-6">
          {/* 1. Current Focus — primary section */}
          {hasActiveProcess ? (
            <>
              {isIncubating && isEgg ? (
                <CurrentFocusSection
                  companion={companion}
                  tasks={hatchTasks}
                  processType="incubation"
                  onOpenPostModal={onOpenPostModal}
                  onComplete={onHatch}
                  isCompleting={isHatching}
                  onStop={onStopIncubation}
                  isStopping={isStoppingIncubation}
                />
              ) : isEvolvingState && isBaby ? (
                <CurrentFocusSection
                  companion={companion}
                  tasks={evolveTasks}
                  processType="evolution"
                  onOpenPostModal={onOpenPostModal}
                  onComplete={onEvolve}
                  isCompleting={isEvolving}
                  onStop={onStopEvolution}
                  isStopping={isStoppingEvolution}
                />
              ) : null}
            </>
          ) : (
            <EmptyFocusState />
          )}

          {/* Divider */}
          <div className="h-px bg-border/60" />

          {/* 2. Daily Missions — secondary section */}
          <DailyMissionsSection
            profile={profile}
            updateProfileEvent={updateProfileEvent}
            availableStages={availableStages}
            disabled={isProcessBusy}
          />

          {/* 3. Settings row — low emphasis footer toggle */}
          {onToggleMissionCard !== undefined && showMissionCard !== undefined && (
            <>
              <div className="h-px bg-border/40" />
              <div className="flex items-center justify-between py-1">
                <Label htmlFor="mission-card-toggle" className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
                  <Eye className="size-3.5" />
                  Show mission card on main page
                </Label>
                <Switch
                  id="mission-card-toggle"
                  checked={showMissionCard}
                  onCheckedChange={onToggleMissionCard}
                />
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

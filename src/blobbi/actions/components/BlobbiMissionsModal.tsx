// src/blobbi/actions/components/BlobbiMissionsModal.tsx

/**
 * Missions modal for Blobbi.
 * 
 * Shows:
 * - Daily missions (always visible, separate reward system)
 * - Incubation tasks when the current Blobbi is incubating (egg stage)
 * - Evolve tasks when evolving (baby stage)
 */

import { Target, Loader2, XCircle, AlertTriangle, Calendar, Coins, X, ChevronDown, Eye } from 'lucide-react';
import { formatCompactNumber, cn } from '@/lib/utils';

import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogClose } from '@/components/ui/dialog';
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
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
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
  /** Available Blobbi stages the user has */
  availableStages?: ('egg' | 'baby' | 'adult')[];
  disabled?: boolean;
  defaultOpen?: boolean;
}

function DailyMissionsSection({ profile, updateProfileEvent, availableStages, disabled, defaultOpen = true }: DailyMissionsSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
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
    updateProfileEvent
  );

  const { mutate: rerollMission, isPending: isRerolling } = useRerollMission();

  const handleClaimReward = (missionId: string) => {
    claimReward({ missionId });
  };

  const handleRerollMission = (missionId: string) => {
    rerollMission({ missionId, availableStages });
  };

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} className="overflow-hidden">
      {/* Section header - Clickable */}
      <CollapsibleTrigger className="w-full">
        <div className="flex items-center justify-between gap-2 p-3 rounded-lg bg-muted/50 hover:bg-muted/70 transition-colors">
          <div className="flex items-center gap-2">
            <Calendar className="size-4 text-primary shrink-0" />
            <h3 className="font-semibold text-sm">Daily Missions</h3>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Coins className="size-3 shrink-0" />
              <span className="whitespace-nowrap">
                {formatCompactNumber(todayClaimedReward)} / {formatCompactNumber(totalPotentialReward)}
              </span>
            </div>
            <ChevronDown className={cn(
              "size-4 text-muted-foreground transition-transform duration-200",
              isOpen && "rotate-180"
            )} />
          </div>
        </div>
      </CollapsibleTrigger>

      {/* Mission list */}
      <CollapsibleContent className="pt-3">
        <DailyMissionsPanel
          missions={missions}
          onClaimReward={handleClaimReward}
          onRerollMission={handleRerollMission}
          todayCoins={todayClaimedReward}
          disabled={disabled || isClaiming || isRerolling}
          bonusAvailable={bonusAvailable}
          bonusClaimed={bonusClaimed}
          bonusReward={bonusReward}
          noMissionsAvailable={noMissionsAvailable}
          rerollsRemaining={rerollsRemaining}
          isRerolling={isRerolling}
        />
      </CollapsibleContent>
    </Collapsible>
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

// ─── Process Content (Incubation or Evolution) ────────────────────────────────

interface ProcessContentProps {
  companion: BlobbiCompanion;
  tasks: HatchTasksResult | EvolveTasksResult;
  processType: 'incubation' | 'evolution';
  onOpenPostModal: () => void;
  onComplete: () => void;
  isCompleting: boolean;
  onStop: () => Promise<void>;
  isStopping: boolean;
  defaultOpen?: boolean;
}

function ProcessContent({
  companion,
  tasks,
  processType,
  onOpenPostModal,
  onComplete,
  isCompleting,
  onStop,
  isStopping,
  defaultOpen = true,
}: ProcessContentProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
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

  const completedCount = tasks.tasks.filter(t => t.completed).length;
  const totalTasks = tasks.tasks.length;

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} className="overflow-hidden">
      {/* Section header - Clickable */}
      <CollapsibleTrigger className="w-full">
        <div className="flex items-center justify-between gap-2 p-3 rounded-lg bg-muted/50 hover:bg-muted/70 transition-colors">
          <div className="flex items-center gap-2">
            <span className="text-lg">{emoji}</span>
            <h3 className="font-semibold text-sm">{title}</h3>
          </div>
          <div className="flex items-center gap-2">
            <span className={cn(
              "text-xs font-medium px-2 py-0.5 rounded-full",
              tasks.allCompleted 
                ? "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400"
                : "bg-muted text-muted-foreground"
            )}>
              {completedCount}/{totalTasks}
            </span>
            <ChevronDown className={cn(
              "size-4 text-muted-foreground transition-transform duration-200",
              isOpen && "rotate-180"
            )} />
          </div>
        </div>
      </CollapsibleTrigger>

      {/* Tasks content */}
      <CollapsibleContent className="pt-3">
        {/* Tasks Panel */}
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

        {/* Stop Process Button */}
        <div className="mt-6 pt-4 border-t border-border">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowStopConfirmation(true)}
            disabled={isStopping || isCompleting}
            className="w-full text-muted-foreground hover:text-destructive hover:bg-destructive/10"
          >
            {isStopping ? (
              <>
                <Loader2 className="size-4 mr-2 animate-spin" />
                Stopping...
              </>
            ) : (
              <>
                <XCircle className="size-4 mr-2" />
                {stopLabel}
              </>
            )}
          </Button>
        </div>
      </CollapsibleContent>

      {/* Stop Confirmation Dialog */}
      <StopConfirmationDialog
        open={showStopConfirmation}
        onOpenChange={setShowStopConfirmation}
        companionName={companion.name}
        processType={processType}
        onConfirm={onStop}
        isPending={isStopping}
      />
    </Collapsible>
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

  // Check if there's an active hatch/evolve process
  const hasActiveProcess = (isIncubating && isEgg) || (isEvolvingState && isBaby);
  const isProcessBusy = isHatching || isEvolving || isStoppingIncubation || isStoppingEvolution;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg w-[calc(100%-2rem)] max-h-[85vh] flex flex-col p-0 gap-0 overflow-hidden [&>button:last-child]:hidden">
        {/* Header - Sticky */}
        <DialogHeader className="sticky top-0 z-10 bg-background px-4 sm:px-6 pt-4 sm:pt-6 pb-3 sm:pb-4 border-b">
          <div className="flex items-start justify-between gap-4">
            <div>
              <DialogTitle className="flex items-center gap-2">
                <Target className="size-5 shrink-0" />
                Missions
              </DialogTitle>
              <DialogDescription className="break-words">
                Complete missions to earn rewards for {companion.name}
              </DialogDescription>
            </div>
            <DialogClose className="rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 shrink-0">
              <X className="size-5" />
              <span className="sr-only">Close</span>
            </DialogClose>
          </div>
        </DialogHeader>

        {/* Content - Scrollable */}
        <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-4 sm:px-6 py-3 sm:py-4 space-y-4">
          {/* Daily Missions Section - Always visible, expanded by default */}
          <DailyMissionsSection 
            profile={profile}
            updateProfileEvent={updateProfileEvent}
            availableStages={availableStages}
            disabled={isProcessBusy}
            defaultOpen={true}
          />

          {/* Hatch/Evolve Process Section - Only when active, expanded by default */}
          {hasActiveProcess && (
            <>
              {isIncubating && isEgg ? (
                <ProcessContent
                  companion={companion}
                  tasks={hatchTasks}
                  processType="incubation"
                  onOpenPostModal={onOpenPostModal}
                  onComplete={onHatch}
                  isCompleting={isHatching}
                  onStop={onStopIncubation}
                  isStopping={isStoppingIncubation}
                  defaultOpen={true}
                />
              ) : isEvolvingState && isBaby ? (
                <ProcessContent
                  companion={companion}
                  tasks={evolveTasks}
                  processType="evolution"
                  onOpenPostModal={onOpenPostModal}
                  onComplete={onEvolve}
                  isCompleting={isEvolving}
                  onStop={onStopEvolution}
                  isStopping={isStoppingEvolution}
                  defaultOpen={true}
                />
              ) : null}
            </>
          )}

          {/* Mission Card Visibility Toggle */}
          {onToggleMissionCard !== undefined && showMissionCard !== undefined && (
            <div className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-2.5">
              <Label htmlFor="mission-card-toggle" className="flex items-center gap-2 text-sm cursor-pointer">
                <Eye className="size-4 text-muted-foreground" />
                Show mission card on main page
              </Label>
              <Switch
                id="mission-card-toggle"
                checked={showMissionCard}
                onCheckedChange={onToggleMissionCard}
              />
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

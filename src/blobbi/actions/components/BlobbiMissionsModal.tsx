// src/blobbi/actions/components/BlobbiMissionsModal.tsx

/**
 * Missions modal for Blobbi — card-grid quest board.
 *
 * Layout:
 * 1. Sticky header with title, subtitle, legend help button, close
 * 2. Current Focus section (hatch / evolve) — collapsible, default open
 * 3. Daily Bounties section — collapsible, default open
 * 4. Settings row — low emphasis toggle (not collapsible)
 *
 * Both main sections use lightweight Radix Collapsible wrappers.
 * Collapsed headers still show summary info (progress / coins).
 */

import {
  Loader2,
  XCircle,
  AlertTriangle,
  X,
  Eye,
  Scroll,
  Compass,
  HelpCircle,
  ChevronDown,
} from 'lucide-react';
import { cn } from '@/lib/utils';

import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogClose } from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
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

import type { BlobbiCompanion } from '@/blobbi/core/lib/blobbi';
import type { HatchTasksResult } from '../hooks/useHatchTasks';
import type { EvolveTasksResult } from '../hooks/useEvolveTasks';
import { TasksPanel } from './TasksPanel';
import { DailyMissionsPanel } from './DailyMissionsPanel';
import { useDailyMissions } from '../hooks/useDailyMissions';
import { useRerollMission } from '../hooks/useRerollMission';

// ─── Types ────────────────────────────────────────────────────────────────────

interface BlobbiMissionsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companion: BlobbiCompanion;
  hatchTasks: HatchTasksResult;
  evolveTasks: EvolveTasksResult;
  onHatch: () => void;
  isHatching: boolean;
  onEvolve: () => void;
  isEvolving: boolean;
  onStopIncubation: () => Promise<void>;
  isStoppingIncubation: boolean;
  onStopEvolution: () => Promise<void>;
  isStoppingEvolution: boolean;
  availableStages?: ('egg' | 'baby' | 'adult')[];
  showMissionCard?: boolean;
  onToggleMissionCard?: (visible: boolean) => void;
}

// ─── Section Chevron ─────────────────────────────────────────────────────────

function SectionChevron({ open }: { open: boolean }) {
  return (
    <ChevronDown
      className={cn(
        'size-4 text-muted-foreground/60 transition-transform duration-200',
        open && 'rotate-180',
      )}
    />
  );
}

// ─── Mission Type Legend ──────────────────────────────────────────────────────

function MissionTypeLegend() {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="rounded-full p-1.5 opacity-50 hover:opacity-100 hover:bg-muted transition-all"
          aria-label="Mission types legend"
        >
          <HelpCircle className="size-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent side="bottom" align="end" className="w-56 p-3">
        <p className="text-xs font-semibold mb-2">Mission Types</p>
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <div className="size-5 rounded-full bg-amber-500/15 flex items-center justify-center shrink-0">
              <Scroll className="size-3 text-amber-500" />
            </div>
            <div>
              <p className="text-xs font-medium">Daily Bounty</p>
              <p className="text-[10px] text-muted-foreground">Resets every day</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="size-5 rounded-full bg-sky-500/15 flex items-center justify-center shrink-0">
              <span className="text-xs">🥚</span>
            </div>
            <div>
              <p className="text-xs font-medium">Hatch Task</p>
              <p className="text-[10px] text-muted-foreground">Egg progression</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="size-5 rounded-full bg-violet-500/15 flex items-center justify-center shrink-0">
              <span className="text-xs">🐣</span>
            </div>
            <div>
              <p className="text-xs font-medium">Evolve Task</p>
              <p className="text-[10px] text-muted-foreground">Baby progression</p>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ─── Daily Missions Section ───────────────────────────────────────────────────

interface DailyMissionsSectionProps {
  availableStages?: ('egg' | 'baby' | 'adult')[];
  disabled?: boolean;
  defaultOpen?: boolean;
}

function DailyMissionsSection({
  availableStages,
  disabled,
  defaultOpen = true,
}: DailyMissionsSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  const {
    missions,
    todayXp,
    allComplete,
    bonusUnlocked,
    bonusXp,
    noMissionsAvailable,
    rerollsRemaining,
  } = useDailyMissions({ availableStages });

  const { mutate: rerollMission, isPending: isRerolling } = useRerollMission();

  const completedCount = missions.filter((m) => m.complete).length;

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      {/* Section header — tappable */}
      <CollapsibleTrigger className="w-full">
        <div className="flex items-center justify-between py-1 group">
          <div className="flex items-center gap-2">
            <Scroll className="size-4 text-amber-500 dark:text-amber-400 shrink-0" />
            <h3 className="font-semibold text-sm">Daily Bounties</h3>
          </div>
          <div className="flex items-center gap-2">
            {/* Summary pill — always visible */}
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="tabular-nums">
                {completedCount} / {missions.length}
              </span>
              {allComplete && (
                <span className="size-4 rounded-full bg-emerald-500 text-white text-[10px] font-bold flex items-center justify-center shrink-0">
                  ✓
                </span>
              )}
            </div>
            <SectionChevron open={isOpen} />
          </div>
        </div>
      </CollapsibleTrigger>

      <CollapsibleContent className="overflow-hidden data-[state=open]:animate-collapsible-down data-[state=closed]:animate-collapsible-up">
        <div className="pt-3">
          <DailyMissionsPanel
            missions={missions}
            onRerollMission={(id) => rerollMission({ missionId: id, availableStages })}
            todayXp={todayXp}
            disabled={disabled || isRerolling}
            bonusUnlocked={bonusUnlocked}
            bonusXp={bonusXp}
            noMissionsAvailable={noMissionsAvailable}
            rerollsRemaining={rerollsRemaining}
            isRerolling={isRerolling}
          />
        </div>
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

// ─── Current Focus Section (Hatch / Evolve) ──────────────────────────────────

interface CurrentFocusSectionProps {
  companion: BlobbiCompanion;
  tasks: HatchTasksResult | EvolveTasksResult;
  processType: 'incubation' | 'evolution';
  onComplete: () => void;
  isCompleting: boolean;
  onStop: () => Promise<void>;
  isStopping: boolean;
  defaultOpen?: boolean;
}

function CurrentFocusSection({
  companion,
  tasks,
  processType,
  onComplete,
  isCompleting,
  onStop,
  isStopping,
  defaultOpen = true,
}: CurrentFocusSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [showStopConfirmation, setShowStopConfirmation] = useState(false);

  const isIncubation = processType === 'incubation';
  const title = isIncubation ? 'Hatch Tasks' : 'Evolve Tasks';
  const completeLabel = isIncubation ? 'Hatch Your Blobbi!' : 'Evolve Your Blobbi!';
  const completingLabel = isIncubation ? 'Hatching...' : 'Evolving...';
  const completeEmoji = isIncubation ? '🐣' : '✨';
  const stopLabel = isIncubation ? 'Stop Incubation' : 'Stop Evolution';
  const badgeLabel = isIncubation ? 'Hatch' : 'Evolve';
  const category = isIncubation ? ('hatch' as const) : ('evolve' as const);

  const completedCount = tasks.tasks.filter((t) => t.completed).length;
  const totalTasks = tasks.tasks.length;

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      {/* Section header — tappable */}
      <CollapsibleTrigger className="w-full">
        <div className="flex items-center justify-between py-1 group">
          <div className="flex items-center gap-2">
            <Badge
              variant="secondary"
              className={cn(
                'text-xs font-semibold px-2 py-0.5',
                isIncubation
                  ? 'bg-sky-500/15 text-sky-600 dark:text-sky-400'
                  : 'bg-violet-500/15 text-violet-600 dark:text-violet-400',
              )}
            >
              {badgeLabel}
            </Badge>
            <span className="text-sm font-semibold">{title}</span>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={cn(
                'text-xs font-medium tabular-nums',
                tasks.allCompleted
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-muted-foreground',
              )}
            >
              {completedCount} / {totalTasks}
            </span>
            <SectionChevron open={isOpen} />
          </div>
        </div>
      </CollapsibleTrigger>

      <CollapsibleContent className="overflow-hidden data-[state=open]:animate-collapsible-down data-[state=closed]:animate-collapsible-up">
        <div className="pt-3">
          {/* Task card grid */}
          <TasksPanel
            tasks={tasks.tasks}
            allCompleted={tasks.allCompleted}
            isLoading={tasks.isLoading}
            onComplete={onComplete}
            isCompleting={isCompleting}
            completeLabel={completeLabel}
            completingLabel={completingLabel}
            completeEmoji={completeEmoji}
            category={category}
          />

          {/* Stop process — low emphasis */}
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
        </div>
      </CollapsibleContent>

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

// ─── Empty Focus State ────────────────────────────────────────────────────────

function EmptyFocusState() {
  return (
    <div className="py-6 text-center">
      <Compass className="size-5 text-muted-foreground/50 mx-auto mb-2" />
      <p className="text-sm text-muted-foreground">No active progression right now</p>
    </div>
  );
}

// ─── Main Modal ───────────────────────────────────────────────────────────────

export function BlobbiMissionsModal({
  open,
  onOpenChange,
  companion,
  hatchTasks,
  evolveTasks,
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
            <div className="flex items-center gap-0.5 shrink-0">
              <MissionTypeLegend />
              <DialogClose className="rounded-full p-1.5 opacity-60 hover:opacity-100 hover:bg-muted transition-all">
                <X className="size-4" />
                <span className="sr-only">Close</span>
              </DialogClose>
            </div>
          </div>
        </div>

        {/* ── Scrollable Content ── */}
        <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-4 sm:px-5 py-4 space-y-5">
          {/* 1. Current Focus */}
          {hasActiveProcess ? (
            <>
              {isIncubating && isEgg ? (
                <CurrentFocusSection
                  companion={companion}
                  tasks={hatchTasks}
                  processType="incubation"
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

          {/* 2. Daily Bounties */}
          <DailyMissionsSection
            availableStages={availableStages}
            disabled={isProcessBusy}
          />

          {/* 3. Settings */}
          {onToggleMissionCard !== undefined && showMissionCard !== undefined && (
            <>
              <div className="h-px bg-border/40" />
              <div className="flex items-center justify-between py-1">
                <Label
                  htmlFor="mission-card-toggle"
                  className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer"
                >
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

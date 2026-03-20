// src/blobbi/actions/components/BlobbiMissionsModal.tsx

/**
 * Missions modal for Blobbi.
 * 
 * Shows incubation tasks when the current Blobbi is incubating (egg stage),
 * evolve tasks when evolving (baby stage), or an empty state otherwise.
 */

import { Target, Loader2, XCircle, AlertTriangle } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
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

import type { BlobbiCompanion } from '@/lib/blobbi';
import type { HatchTasksResult } from '../hooks/useHatchTasks';
import type { EvolveTasksResult } from '../hooks/useEvolveTasks';
import { TasksPanel } from './TasksPanel';

// ─── Types ────────────────────────────────────────────────────────────────────

interface BlobbiMissionsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Current companion being viewed */
  companion: BlobbiCompanion;
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
}

// ─── Empty State ──────────────────────────────────────────────────────────────

function MissionsEmptyState() {
  return (
    <div className="flex flex-col items-center gap-4 py-12 text-center">
      <div className="size-16 rounded-2xl bg-primary/10 flex items-center justify-center">
        <Target className="size-8 text-primary" />
      </div>
      <div className="space-y-2">
        <h3 className="font-semibold text-lg">No Active Missions</h3>
        <p className="text-muted-foreground max-w-xs">
          Start incubating an egg to unlock hatch tasks, or check back later for new missions!
        </p>
      </div>
    </div>
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
}: ProcessContentProps) {
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

  return (
    <>
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

      {/* Stop Confirmation Dialog */}
      <StopConfirmationDialog
        open={showStopConfirmation}
        onOpenChange={setShowStopConfirmation}
        companionName={companion.name}
        processType={processType}
        onConfirm={onStop}
        isPending={isStopping}
      />
    </>
  );
}

// ─── Main Modal ───────────────────────────────────────────────────────────────

export function BlobbiMissionsModal({
  open,
  onOpenChange,
  companion,
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
}: BlobbiMissionsModalProps) {
  const isIncubating = companion.state === 'incubating';
  const isEvolvingState = companion.state === 'evolving';
  const isEgg = companion.stage === 'egg';
  const isBaby = companion.stage === 'baby';

  // Determine description text
  const getDescription = () => {
    if (isIncubating && isEgg) {
      return `Complete tasks to hatch ${companion.name}`;
    }
    if (isEvolvingState && isBaby) {
      return `Complete tasks to evolve ${companion.name}`;
    }
    return 'Complete missions to earn rewards';
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Target className="size-5" />
            Missions
          </DialogTitle>
          <DialogDescription>
            {getDescription()}
          </DialogDescription>
        </DialogHeader>

        <div className="pt-2">
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
            />
          ) : (
            <MissionsEmptyState />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

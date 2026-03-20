// src/blobbi/actions/components/BlobbiMissionsModal.tsx

/**
 * Missions modal for Blobbi.
 * 
 * Shows incubation tasks when the current Blobbi is incubating,
 * otherwise shows an empty state with placeholder content.
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
import { HatchTasksPanel } from './HatchTasksPanel';

// ─── Types ────────────────────────────────────────────────────────────────────

interface BlobbiMissionsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Current companion being viewed */
  companion: BlobbiCompanion;
  /** Hatch tasks result from useHatchTasks */
  hatchTasks: HatchTasksResult;
  /** Called when user clicks "Create Post" action in tasks */
  onOpenPostModal: () => void;
  /** Called when all tasks are complete and user clicks "Hatch" */
  onHatch: () => void;
  /** Whether hatching is in progress */
  isHatching: boolean;
  /** Called when user confirms stopping incubation */
  onStopIncubation: () => Promise<void>;
  /** Whether stop incubation is in progress */
  isStoppingIncubation: boolean;
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

// ─── Incubation Content ───────────────────────────────────────────────────────

interface IncubationContentProps {
  companion: BlobbiCompanion;
  hatchTasks: HatchTasksResult;
  onOpenPostModal: () => void;
  onHatch: () => void;
  isHatching: boolean;
  onStopIncubation: () => Promise<void>;
  isStoppingIncubation: boolean;
}

function IncubationContent({
  companion,
  hatchTasks,
  onOpenPostModal,
  onHatch,
  isHatching,
  onStopIncubation,
  isStoppingIncubation,
}: IncubationContentProps) {
  const [showStopConfirmation, setShowStopConfirmation] = useState(false);

  const handleStopConfirm = async () => {
    await onStopIncubation();
    setShowStopConfirmation(false);
  };

  return (
    <>
      {/* Hatch Tasks Panel */}
      <HatchTasksPanel
        tasks={hatchTasks.tasks}
        allCompleted={hatchTasks.allCompleted}
        isLoading={hatchTasks.isLoading}
        onOpenPostModal={onOpenPostModal}
        onHatch={onHatch}
        isHatching={isHatching}
      />

      {/* Stop Incubation Button */}
      <div className="mt-6 pt-4 border-t border-border">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowStopConfirmation(true)}
          disabled={isStoppingIncubation || isHatching}
          className="w-full text-muted-foreground hover:text-destructive hover:bg-destructive/10"
        >
          {isStoppingIncubation ? (
            <>
              <Loader2 className="size-4 mr-2 animate-spin" />
              Stopping...
            </>
          ) : (
            <>
              <XCircle className="size-4 mr-2" />
              Stop Incubation
            </>
          )}
        </Button>
      </div>

      {/* Stop Incubation Confirmation Dialog */}
      <AlertDialog open={showStopConfirmation} onOpenChange={setShowStopConfirmation}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="size-5 text-amber-500" />
              Stop Incubation?
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>
                Are you sure you want to stop incubating <strong>{companion.name}</strong>?
              </p>
              <p>
                This will interrupt the incubation process and clear all task progress.
                You can restart incubation later, but you'll need to complete the tasks again.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isStoppingIncubation}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleStopConfirm}
              disabled={isStoppingIncubation}
              className="bg-destructive hover:bg-destructive/90"
            >
              {isStoppingIncubation ? (
                <>
                  <Loader2 className="size-4 mr-2 animate-spin" />
                  Stopping...
                </>
              ) : (
                'Stop Incubation'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ─── Main Modal ───────────────────────────────────────────────────────────────

export function BlobbiMissionsModal({
  open,
  onOpenChange,
  companion,
  hatchTasks,
  onOpenPostModal,
  onHatch,
  isHatching,
  onStopIncubation,
  isStoppingIncubation,
}: BlobbiMissionsModalProps) {
  const isIncubating = companion.state === 'incubating';
  const isEgg = companion.stage === 'egg';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Target className="size-5" />
            Missions
          </DialogTitle>
          <DialogDescription>
            {isIncubating && isEgg
              ? `Complete tasks to hatch ${companion.name}`
              : 'Complete missions to earn rewards'}
          </DialogDescription>
        </DialogHeader>

        <div className="pt-2">
          {isIncubating && isEgg ? (
            <IncubationContent
              companion={companion}
              hatchTasks={hatchTasks}
              onOpenPostModal={onOpenPostModal}
              onHatch={onHatch}
              isHatching={isHatching}
              onStopIncubation={onStopIncubation}
              isStoppingIncubation={isStoppingIncubation}
            />
          ) : (
            <MissionsEmptyState />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

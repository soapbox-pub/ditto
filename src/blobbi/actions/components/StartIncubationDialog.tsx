// src/blobbi/actions/components/StartIncubationDialog.tsx

/**
 * Dialog for confirming start of incubation.
 * Shows warning if Blobbi is already incubating/evolving.
 */

import { Loader2, AlertTriangle } from 'lucide-react';

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

import type { BlobbiCompanion } from '@/lib/blobbi';

// ─── Types ────────────────────────────────────────────────────────────────────

interface StartIncubationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companion: BlobbiCompanion | null;
  onConfirm: () => void;
  isPending: boolean;
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function StartIncubationDialog({
  open,
  onOpenChange,
  companion,
  onConfirm,
  isPending,
}: StartIncubationDialogProps) {
  const isAlreadyInTaskState = companion?.state === 'incubating' || companion?.state === 'evolving';
  
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            {isAlreadyInTaskState && (
              <AlertTriangle className="size-5 text-amber-500" />
            )}
            {isAlreadyInTaskState ? 'Restart Incubation?' : 'Start Incubation'}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {isAlreadyInTaskState ? (
              <>
                Your Blobbi is already {companion?.state}. Starting over will{' '}
                <strong>reset all task progress</strong> and begin from the beginning.
                <br /><br />
                Are you sure you want to restart?
              </>
            ) : (
              <>
                Starting incubation begins your Blobbi's hatching journey. 
                Complete all the tasks to hatch your egg into a baby Blobbi!
                <br /><br />
                Ready to begin?
              </>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              onConfirm();
            }}
            disabled={isPending}
            className={isAlreadyInTaskState 
              ? "bg-amber-500 hover:bg-amber-600 text-white"
              : undefined
            }
          >
            {isPending ? (
              <>
                <Loader2 className="size-4 mr-2 animate-spin" />
                Starting...
              </>
            ) : isAlreadyInTaskState ? (
              'Restart Incubation'
            ) : (
              'Start Incubation'
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

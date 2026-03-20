// src/blobbi/actions/components/StartIncubationDialog.tsx

/**
 * Dialog for confirming start of incubation.
 * Shows warning if:
 * - Current Blobbi is already incubating/evolving (restart warning)
 * - Another Blobbi in the collection is incubating (switch warning)
 * 
 * Only one Blobbi can incubate at a time - switching will stop the other's incubation.
 */

import { useMemo } from 'react';
import { Loader2, AlertTriangle, ArrowRightLeft } from 'lucide-react';

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
  /** The companion to start incubating */
  companion: BlobbiCompanion | null;
  /** All companions in the collection (to check for other incubating Blobbis) */
  companions?: BlobbiCompanion[];
  onConfirm: () => void;
  isPending: boolean;
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function StartIncubationDialog({
  open,
  onOpenChange,
  companion,
  companions = [],
  onConfirm,
  isPending,
}: StartIncubationDialogProps) {
  // Check if the current Blobbi is already in a task state
  const isAlreadyInTaskState = companion?.state === 'incubating' || companion?.state === 'evolving';
  
  // Check if another Blobbi (not this one) is currently incubating
  const otherIncubatingBlobbi = useMemo(() => {
    if (!companion) return null;
    return companions.find(c => 
      c.d !== companion.d && 
      c.state === 'incubating' &&
      c.stage === 'egg'
    ) ?? null;
  }, [companion, companions]);
  
  // Determine dialog state
  const hasOtherIncubating = otherIncubatingBlobbi !== null;
  
  // Determine title and description based on state
  const getDialogContent = () => {
    if (isAlreadyInTaskState) {
      return {
        title: 'Restart Incubation?',
        icon: <AlertTriangle className="size-5 text-amber-500" />,
        description: (
          <>
            Your Blobbi is already {companion?.state}. Starting over will{' '}
            <strong>reset all task progress</strong> and begin from the beginning.
            <br /><br />
            Are you sure you want to restart?
          </>
        ),
        buttonText: 'Restart Incubation',
        buttonClass: 'bg-amber-500 hover:bg-amber-600 text-white',
      };
    }
    
    if (hasOtherIncubating) {
      return {
        title: 'Switch Incubation?',
        icon: <ArrowRightLeft className="size-5 text-amber-500" />,
        description: (
          <>
            <strong>{otherIncubatingBlobbi?.name}</strong> is currently incubating.
            Only one Blobbi can incubate at a time.
            <br /><br />
            Starting incubation for <strong>{companion?.name}</strong> will{' '}
            <strong>stop {otherIncubatingBlobbi?.name}'s incubation</strong> and{' '}
            reset their task progress.
            <br /><br />
            Do you want to switch?
          </>
        ),
        buttonText: 'Switch & Start',
        buttonClass: 'bg-amber-500 hover:bg-amber-600 text-white',
      };
    }
    
    return {
      title: 'Start Incubation',
      icon: null,
      description: (
        <>
          Starting incubation begins your Blobbi's hatching journey. 
          Complete all the tasks to hatch your egg into a baby Blobbi!
          <br /><br />
          Ready to begin?
        </>
      ),
      buttonText: 'Start Incubation',
      buttonClass: undefined,
    };
  };
  
  const content = getDialogContent();
  
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            {content.icon}
            {content.title}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {content.description}
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
            className={content.buttonClass}
          >
            {isPending ? (
              <>
                <Loader2 className="size-4 mr-2 animate-spin" />
                Starting...
              </>
            ) : (
              content.buttonText
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// src/blobbi/actions/components/StartIncubationDialog.tsx

/**
 * Dialog for confirming start of incubation.
 * 
 * Determines the mode and passes it explicitly to the confirm callback:
 * - 'start': Normal start, no other Blobbi incubating
 * - 'restart': Restart same Blobbi (already incubating)
 * - 'switch': Stop another Blobbi first, then start this one
 * 
 * The mode is determined by UI state, NOT auto-detected by the hook.
 * This makes the flow explicit and predictable.
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

import type { BlobbiCompanion } from '@/blobbi/core/lib/blobbi';
import type { StartIncubationMode } from '../hooks/useBlobbiIncubation';

// ─── Types ────────────────────────────────────────────────────────────────────

interface StartIncubationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The companion to start incubating */
  companion: BlobbiCompanion | null;
  /** All companions in the collection (to check for other incubating Blobbis) */
  companions?: BlobbiCompanion[];
  /** Called with explicit mode and optional stopOtherD when confirmed */
  onConfirm: (mode: StartIncubationMode, stopOtherD?: string) => void;
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
  
  // Determine the mode based on current state
  const mode: StartIncubationMode = useMemo(() => {
    if (isAlreadyInTaskState) return 'restart';
    if (otherIncubatingBlobbi) return 'switch';
    return 'start';
  }, [isAlreadyInTaskState, otherIncubatingBlobbi]);
  
  // Handle confirm with explicit mode
  const handleConfirm = () => {
    if (mode === 'switch' && otherIncubatingBlobbi) {
      onConfirm(mode, otherIncubatingBlobbi.d);
    } else {
      onConfirm(mode);
    }
  };
  
  // Determine title and description based on mode
  const getDialogContent = () => {
    if (mode === 'restart') {
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
    
    if (mode === 'switch') {
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
              handleConfirm();
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

// src/blobbi/actions/components/StartEvolutionDialog.tsx

/**
 * Dialog for confirming start of evolution.
 * 
 * Evolution is simpler than incubation:
 * - Only baby Blobbis can evolve
 * - Shows restart confirmation if already evolving
 * - Otherwise shows normal start confirmation
 */

import { Loader2, AlertTriangle, Sparkles } from 'lucide-react';

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

// ─── Types ────────────────────────────────────────────────────────────────────

interface StartEvolutionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The companion to start evolving */
  companion: BlobbiCompanion | null;
  /** Called when confirmed */
  onConfirm: () => void;
  isPending: boolean;
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function StartEvolutionDialog({
  open,
  onOpenChange,
  companion,
  onConfirm,
  isPending,
}: StartEvolutionDialogProps) {
  // Check if the current Blobbi is already evolving
  const isAlreadyEvolving = companion?.state === 'evolving';
  
  // Determine title and description based on state
  const getDialogContent = () => {
    if (isAlreadyEvolving) {
      return {
        title: 'Restart Evolution?',
        icon: <AlertTriangle className="size-5 text-amber-500" />,
        description: (
          <>
            <strong>{companion?.name}</strong> is already evolving. Starting over will{' '}
            <strong>reset all task progress</strong> and begin from the beginning.
            <br /><br />
            Are you sure you want to restart?
          </>
        ),
        buttonText: 'Restart Evolution',
        buttonClass: 'bg-amber-500 hover:bg-amber-600 text-white',
      };
    }
    
    return {
      title: 'Start Evolution',
      icon: <Sparkles className="size-5 text-primary" />,
      description: (
        <>
          Starting evolution begins <strong>{companion?.name}</strong>'s transformation journey.
          Complete all the tasks to evolve your baby Blobbi into an adult!
          <br /><br />
          Ready to begin?
        </>
      ),
      buttonText: 'Start Evolution',
      buttonClass: 'bg-gradient-to-r from-violet-500 to-purple-500 hover:from-violet-600 hover:to-purple-600 text-white',
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

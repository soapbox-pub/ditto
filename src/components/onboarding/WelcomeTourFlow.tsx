/**
 * WelcomeTourFlow — globally-mounted overlay that renders the welcome tour.
 *
 * Three views:
 *   - `closed`     — render nothing
 *   - `expanded`   — full-screen / centered modal with the current card
 *   - `minimized`  — small persistent "Resume tour" pill (set by clicking
 *                    "Try it" on a card so users can deep-link into a feature
 *                    and resume where they left off)
 *
 * State transitions:
 *   closed   ──useTourIntent()──▶ expanded (step 0)
 *   minimized ──useTourIntent()──▶ expanded (preserves stepIndex; this means
 *                                  Settings → "Take the tour" while minimized
 *                                  acts as Resume)
 *   expanded ──Skip / Finish / Esc / overlay-click──▶ closed (markSeen)
 *   expanded ──Try it──▶ minimized (preserves stepIndex, NO markSeen)
 *   minimized ──Resume (click pill body)──▶ expanded
 *   minimized ──Dismiss (pill X)──▶ closed (markSeen)
 *
 * Mounted once near the BlobbiCompanionLayer in AppRouter.
 */

import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import * as DialogPrimitive from '@radix-ui/react-dialog';

import { setTourIntent, useTourIntent, useWelcomeTour } from '@/hooks/useWelcomeTour';
import { cn } from '@/lib/utils';

import { WelcomeTourCard } from './WelcomeTourCard';
import { WelcomeTourPill } from './WelcomeTourPill';
import { WELCOME_TOUR_STEPS } from './welcome-tour-steps';

type TourView = 'closed' | 'expanded' | 'minimized';

export function WelcomeTourFlow() {
  const [view, setView] = useState<TourView>('closed');
  const [stepIndex, setStepIndex] = useState(0);
  const { markSeen } = useWelcomeTour();
  const navigate = useNavigate();
  const wantsToOpen = useTourIntent();

  // Consume the module-scoped intent flag whenever it flips on. From `closed`,
  // reset to step 0; from `minimized`, preserve the current step (Resume
  // behavior). From `expanded`, just clear the flag (already open).
  useEffect(() => {
    if (!wantsToOpen) return;
    setView((current) => {
      if (current === 'closed') {
        setStepIndex(0);
      }
      return current === 'expanded' ? current : 'expanded';
    });
    setTourIntent(false);
  }, [wantsToOpen]);

  const finishAndClose = useCallback(() => {
    markSeen();
    setView('closed');
  }, [markSeen]);

  const handleNext = useCallback(() => {
    setStepIndex((idx) => {
      if (idx >= WELCOME_TOUR_STEPS.length - 1) {
        // Last step's "Finish" — mark seen and close.
        finishAndClose();
        return idx;
      }
      return idx + 1;
    });
  }, [finishAndClose]);

  const handleBack = useCallback(() => {
    setStepIndex((idx) => Math.max(0, idx - 1));
  }, []);

  const handleSkip = useCallback(() => {
    finishAndClose();
  }, [finishAndClose]);

  // "Try it": minimize instead of closing so users can poke at the feature
  // and come back. Preserves stepIndex; does NOT mark seen.
  const handleTryIt = useCallback(
    (route: string) => {
      setView('minimized');
      navigate(route);
    },
    [navigate],
  );

  const handleResume = useCallback(() => {
    setView('expanded');
  }, []);

  const handleDismissMinimized = useCallback(() => {
    finishAndClose();
  }, [finishAndClose]);

  // Radix Dialog onOpenChange: treat external close (Esc key, overlay click)
  // as an explicit Skip — the user dismissed, so mark seen.
  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next) {
        finishAndClose();
      }
    },
    [finishAndClose],
  );

  if (view === 'closed') return null;

  if (view === 'minimized') {
    return (
      <WelcomeTourPill
        stepIndex={stepIndex}
        totalSteps={WELCOME_TOUR_STEPS.length}
        emotion={WELCOME_TOUR_STEPS[stepIndex]?.emotion}
        onResume={handleResume}
        onDismiss={handleDismissMinimized}
      />
    );
  }

  const step = WELCOME_TOUR_STEPS[stepIndex];

  return (
    <DialogPrimitive.Root open onOpenChange={handleOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className={cn(
            'fixed inset-0 z-[300] bg-black/60 backdrop-blur-sm',
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0',
          )}
        />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className={cn(
            'fixed z-[301] inset-0 sm:inset-auto sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2',
            'sm:w-[calc(100%-2rem)] sm:max-w-md sm:max-h-[90dvh]',
            'bg-background sm:rounded-3xl shadow-2xl overflow-hidden',
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0',
            'data-[state=open]:zoom-in-95 data-[state=closed]:zoom-out-95',
            'flex flex-col safe-area-top safe-area-bottom',
          )}
        >
          <DialogPrimitive.Title className="sr-only">{step.title}</DialogPrimitive.Title>
          <WelcomeTourCard
            step={step}
            stepIndex={stepIndex}
            totalSteps={WELCOME_TOUR_STEPS.length}
            onNext={handleNext}
            onBack={handleBack}
            onSkip={handleSkip}
            onTryIt={handleTryIt}
          />
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

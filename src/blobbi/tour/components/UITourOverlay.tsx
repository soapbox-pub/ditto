/**
 * UITourOverlay - Orchestrator for the Blobbi UI walkthrough tour.
 *
 * Manages:
 * - Dark backdrop behind tour modals
 * - Positioning the MiniBlobbiGuide on the correct surface
 * - Rendering the GuidedModal at the correct placement
 * - Highlighting the active anchor element
 * - Transitions between steps (fall off modal → rise at bar)
 *
 * This component reads the current step from useUITour and positions
 * everything accordingly. It does not own the step logic.
 */

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';

import { cn } from '@/lib/utils';
import { useTourAnchors } from '../lib/TourAnchorContext';
import { GuidedModal } from './GuidedModal';
import { MiniBlobbiGuide } from './MiniBlobbiGuide';

import type { BlobbiCompanion } from '@/blobbi/core/lib/blobbi';
import type { GuideMovement } from '../lib/ui-tour-types';
import type { UITourState, UITourActions } from '../hooks/useUITour';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface UITourOverlayProps {
  /** The tour state from useUITour */
  tourState: UITourState;
  /** The tour actions from useUITour */
  tourActions: UITourActions;
  /** The companion to render as the mini guide */
  companion: BlobbiCompanion;
  /** Called when the tour is completed or skipped */
  onComplete: () => void;
}

// ─── Transition phases between steps ──────────────────────────────────────────

type TransitionPhase =
  | 'none'       // Stable on current step
  | 'falling'    // Guide falling off current surface
  | 'rising';    // Guide rising at new surface

// ─── Component ────────────────────────────────────────────────────────────────

export function UITourOverlay({
  tourState,
  tourActions,
  companion,
  onComplete,
}: UITourOverlayProps) {
  const { getAnchorRect } = useTourAnchors();

  const [transition, setTransition] = useState<TransitionPhase>('none');
  const [isVisible, setIsVisible] = useState(false);
  const [highlightRect, setHighlightRect] = useState<DOMRect | null>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  const step = tourState.currentStep;

  // Fade in on mount
  useEffect(() => {
    if (tourState.isActive) {
      const timer = setTimeout(() => setIsVisible(true), 50);
      return () => clearTimeout(timer);
    } else {
      setIsVisible(false);
    }
  }, [tourState.isActive]);

  // Update highlight rect when step changes
  useEffect(() => {
    if (!step?.highlightAnchor) {
      setHighlightRect(null);
      return;
    }

    const update = () => {
      const rect = getAnchorRect(step.highlightAnchor!);
      setHighlightRect(rect);
    };

    update();
    // Re-measure on scroll/resize
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [step, getAnchorRect]);

  // ─── Guide positioning ──────────────────────────────────────────────────

  const guideMovement: GuideMovement = useMemo(() => {
    if (transition === 'falling') return 'falling';
    if (transition === 'rising') return 'rising';
    if (!step) return 'hidden';
    if (step.guideTarget.type === 'offscreen') return 'hidden';
    if (step.guideTarget.type === 'modal') return 'walking';
    if (step.guideTarget.type === 'element') return 'looking_down';
    return 'idle';
  }, [step, transition]);

  // Calculate the surface the guide walks on
  const guideSurface = useMemo(() => {
    if (!step) return { left: 0, right: 0, y: 0 };

    if (step.guideTarget.type === 'modal' && modalRef.current) {
      const rect = modalRef.current.getBoundingClientRect();
      return {
        left: rect.left + 16,
        right: rect.right - 16,
        y: rect.top,
      };
    }

    if (step.guideTarget.type === 'element') {
      const rect = getAnchorRect(step.guideTarget.anchorId);
      if (rect) {
        return {
          left: rect.left,
          right: rect.right,
          y: rect.top,
        };
      }
    }

    // Fallback: center of screen
    return {
      left: window.innerWidth / 2 - 100,
      right: window.innerWidth / 2 + 100,
      y: window.innerHeight / 2,
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, transition, getAnchorRect]);

  // ─── Navigation handlers ────────────────────────────────────────────────

  const handleNext = useCallback(() => {
    if (!step) return;

    // If moving from a center-modal step to a bottom step, the guide
    // needs to fall off the modal and rise at the bar. Otherwise, just advance.
    if (step.modalPlacement === 'center') {
      setTransition('falling');
    } else {
      tourActions.next();
    }
  }, [step, tourActions]);

  const handleFallComplete = useCallback(() => {
    setTransition('rising');
    tourActions.next();
  }, [tourActions]);

  const handleRiseComplete = useCallback(() => {
    setTransition('none');
  }, []);

  const handlePrev = useCallback(() => {
    // If going back to a center-modal step from a bottom step, just go back
    setTransition('none');
    tourActions.prev();
  }, [tourActions]);

  const handleSkip = useCallback(() => {
    onComplete();
  }, [onComplete]);

  // ─── Render ─────────────────────────────────────────────────────────────

  if (!tourState.isActive || !step) return null;

  const isCentered = step.modalPlacement === 'center';

  return (
    <div
      className={cn(
        'fixed inset-0 z-50',
        'transition-opacity duration-400',
        isVisible ? 'opacity-100' : 'opacity-0',
      )}
    >
      {/* Dark backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-[2px]" />

      {/* Highlight cutout for the active anchor */}
      {highlightRect && (
        <div
          className="fixed rounded-xl animate-tour-highlight-pulse pointer-events-none z-[51]"
          style={{
            left: highlightRect.left - 4,
            top: highlightRect.top - 4,
            width: highlightRect.width + 8,
            height: highlightRect.height + 8,
          }}
        />
      )}

      {/* Guided modal */}
      <div
        className={cn(
          'fixed z-[52] flex justify-center px-4',
          isCentered
            ? 'inset-0 items-center'
            : 'bottom-28 left-0 right-0',
        )}
      >
        <div ref={modalRef}>
          <GuidedModal
            title={step.title}
            body={step.body}
            showPrev={!tourState.isFirstStep}
            showNext={true}
            nextLabel={tourState.isLastContentStep ? 'Got it' : 'Next'}
            onPrev={handlePrev}
            onNext={tourState.isLastContentStep ? onComplete : handleNext}
            onSkip={handleSkip}
            visible={isVisible && transition !== 'falling'}
          />
        </div>
      </div>

      {/* Mini Blobbi guide */}
      <MiniBlobbiGuide
        companion={companion}
        movement={guideMovement}
        surfaceLeft={guideSurface.left}
        surfaceRight={guideSurface.right}
        surfaceY={guideSurface.y}
        onFallComplete={handleFallComplete}
        onRiseComplete={handleRiseComplete}
      />
    </div>
  );
}

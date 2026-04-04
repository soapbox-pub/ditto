/**
 * UITourOverlay - Orchestrator for the Blobbi UI walkthrough tour.
 *
 * Manages:
 * - Dark backdrop (welcome step only)
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
  tourState: UITourState;
  tourActions: UITourActions;
  companion: BlobbiCompanion;
  onComplete: () => void;
}

type TransitionPhase =
  | 'none'
  | 'falling'
  | 'rising';

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

  // Measured modal rect for guide surface calculation (updated after layout)
  const [modalRect, setModalRect] = useState<DOMRect | null>(null);

  const step = tourState.currentStep;
  const isWelcome = step?.id === 'welcome';

  // Fade in on mount
  useEffect(() => {
    if (tourState.isActive) {
      const timer = setTimeout(() => setIsVisible(true), 50);
      return () => clearTimeout(timer);
    } else {
      setIsVisible(false);
    }
  }, [tourState.isActive]);

  // Measure modal rect after it renders (for guide surface)
  useEffect(() => {
    if (!modalRef.current) {
      setModalRect(null);
      return;
    }

    // Use ResizeObserver to get accurate rect after layout
    const observer = new ResizeObserver(() => {
      if (modalRef.current) {
        setModalRect(modalRef.current.getBoundingClientRect());
      }
    });
    observer.observe(modalRef.current);

    // Also measure immediately
    setModalRect(modalRef.current.getBoundingClientRect());

    return () => observer.disconnect();
  }, [step]);

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
    // For element-based steps, walk across the bar then look down
    if (step.guideTarget.type === 'element') return 'walking';
    return 'idle';
  }, [step, transition]);

  // Calculate guide surface.
  // For modal steps: walk across the modal top edge.
  // For bar_item steps: walk across the entire bottom bar (not just one item).
  // The bar surface uses bar-item-0 left edge to the rightmost bar item right edge.
  const guideSurface = useMemo(() => {
    if (!step) return { left: 0, right: 0, y: 0 };

    if (step.guideTarget.type === 'modal' && modalRect) {
      return {
        left: modalRect.left + 12,
        right: modalRect.right - 12,
        y: modalRect.top,
      };
    }

    if (step.guideTarget.type === 'element') {
      // Use the full bar width: from bar-item-0 to the last registered bar item
      const firstRect = getAnchorRect('bar-item-0');
      if (firstRect) {
        // Try to find the rightmost bar item for a wider surface
        let rightEdge = firstRect.right;
        for (let i = 1; i <= 5; i++) {
          const r = getAnchorRect(`bar-item-${i}`);
          if (r) {
            rightEdge = Math.max(rightEdge, r.right);
          } else {
            break;
          }
        }

        return {
          left: firstRect.left,
          right: rightEdge,
          y: firstRect.top,
        };
      }
    }

    // Fallback
    return {
      left: window.innerWidth / 2 - 100,
      right: window.innerWidth / 2 + 100,
      y: window.innerHeight / 2,
    };
  }, [step, modalRect, getAnchorRect]);

  // ─── Navigation handlers ────────────────────────────────────────────────

  const handleNext = useCallback(() => {
    if (!step) return;

    // Moving from the centered welcome modal to a bottom step:
    // guide falls off modal, then rises at the bar.
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
    <>
      {/* Full-screen overlay container — only captures events on welcome step */}
      {isWelcome && (
        <div
          className={cn(
            'fixed inset-0 z-50',
            'transition-opacity duration-400',
            isVisible ? 'opacity-100' : 'opacity-0',
          )}
        >
          {/* Dark backdrop — welcome step only */}
          <div className="absolute inset-0 bg-black/60 backdrop-blur-[2px]" />
        </div>
      )}

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
          'fixed z-[52] flex justify-center px-4 pointer-events-none',
          isCentered
            ? 'inset-0 items-center'
            : 'bottom-28 left-0 right-0',
        )}
      >
        <div ref={modalRef} className="pointer-events-auto">
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
    </>
  );
}

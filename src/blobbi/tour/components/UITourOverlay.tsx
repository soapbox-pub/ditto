/**
 * UITourOverlay - Orchestrator for the Blobbi UI walkthrough tour.
 *
 * This component translates the current tour step into choreography
 * intents for the MiniBlobbiGuide and positions all UI elements.
 *
 * Step → Intent mapping:
 *   welcome (first render)  → emerge_onto_modal → pace_on_modal
 *   welcome → Next click    → fall_from_surface → emerge_onto_bar → walk_to_target → inspect_target
 *   bar_item_N → Next       → walk_to_target (next item) → inspect_target
 *   bar_item_N → Back       → walk_to_target (prev item) → inspect_target
 *   bar_item_N → Back to welcome → emerge_onto_modal → pace_on_modal
 */

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';

import { cn } from '@/lib/utils';
import { useTourAnchors } from '../lib/TourAnchorContext';
import { GuidedModal } from './GuidedModal';
import { MiniBlobbiGuide } from './MiniBlobbiGuide';

import type { BlobbiCompanion } from '@/blobbi/core/lib/blobbi';
import type { GuideIntent } from '../lib/ui-tour-types';
import type { UITourState, UITourActions } from '../hooks/useUITour';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface UITourOverlayProps {
  tourState: UITourState;
  tourActions: UITourActions;
  companion: BlobbiCompanion;
  onComplete: () => void;
}

/**
 * Transition phases between steps.
 * 'none' = stable on current step, 'falling' = guide falling off surface,
 * 'emerging_bar' = guide emerging onto bar after fall.
 */
type TransitionPhase =
  | 'none'
  | 'falling'
  | 'emerging_bar';

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
  const [modalRect, setModalRect] = useState<DOMRect | null>(null);
  const [emergeComplete, setEmergeComplete] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);

  const step = tourState.currentStep;
  const isWelcome = step?.id === 'welcome';
  const isBarStep = step?.id.startsWith('bar_item_') ?? false;

  // ─── Fade in ──────────────────────────────────────────────────────────

  useEffect(() => {
    if (tourState.isActive) {
      const timer = setTimeout(() => setIsVisible(true), 50);
      return () => clearTimeout(timer);
    } else {
      setIsVisible(false);
    }
  }, [tourState.isActive]);

  // ─── Measure modal rect ───────────────────────────────────────────────

  useEffect(() => {
    if (!modalRef.current) { setModalRect(null); return; }
    const observer = new ResizeObserver(() => {
      if (modalRef.current) setModalRect(modalRef.current.getBoundingClientRect());
    });
    observer.observe(modalRef.current);
    setModalRect(modalRef.current.getBoundingClientRect());
    return () => observer.disconnect();
  }, [step]);

  // ─── Highlight rect ──────────────────────────────────────────────────

  useEffect(() => {
    if (!step?.highlightAnchor) { setHighlightRect(null); return; }
    const update = () => setHighlightRect(getAnchorRect(step.highlightAnchor!) ?? null);
    update();
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [step, getAnchorRect]);

  // Reset emergeComplete when step changes
  useEffect(() => {
    setEmergeComplete(false);
  }, [step?.id]);

  // ─── Guide intent derivation ──────────────────────────────────────────

  const guideIntent: GuideIntent = useMemo(() => {
    // Transition overrides
    if (transition === 'falling') return 'fall_from_surface';
    if (transition === 'emerging_bar') return 'emerge_onto_bar';

    if (!step) return 'hidden';
    if (step.guideTarget.type === 'offscreen') return 'hidden';

    // Welcome step: emerge then pace
    if (isWelcome) {
      return emergeComplete ? 'pace_on_modal' : 'emerge_onto_modal';
    }

    // Bar item steps: after emerging, walk to target then inspect
    if (isBarStep) {
      return emergeComplete ? 'walk_to_target' : 'walk_to_target';
    }

    return 'hidden';
  }, [step, isWelcome, isBarStep, transition, emergeComplete]);

  // ─── Surface calculation ──────────────────────────────────────────────

  // Modal surface: guide walks on modal top edge
  const modalSurface = useMemo(() => {
    if (!modalRect) return { left: 0, right: 0, y: 0 };
    return {
      left: modalRect.left + 12,
      right: modalRect.right - 12,
      y: modalRect.top,
    };
  }, [modalRect]);

  // Bar surface: full width of the bottom bar items
  const barSurface = useMemo(() => {
    const firstRect = getAnchorRect('bar-item-0');
    if (!firstRect) return { left: 0, right: 0, y: 0 };
    let rightEdge = firstRect.right;
    for (let i = 1; i <= 5; i++) {
      const r = getAnchorRect(`bar-item-${i}`);
      if (r) rightEdge = Math.max(rightEdge, r.right);
      else break;
    }
    return { left: firstRect.left, right: rightEdge, y: firstRect.top };
  }, [getAnchorRect, step]); // eslint-disable-line react-hooks/exhaustive-deps

  // Active surface depends on current context
  const activeSurface = useMemo(() => {
    if (transition === 'falling') return modalSurface; // Falling from modal
    if (transition === 'emerging_bar') return barSurface;
    if (isWelcome) return modalSurface;
    if (isBarStep) return barSurface;
    return modalSurface;
  }, [isWelcome, isBarStep, transition, modalSurface, barSurface]);

  // Target X for bar steps: center of the highlighted anchor item
  const barTargetX = useMemo((): number | undefined => {
    if (!step?.highlightAnchor) return undefined;
    const rect = getAnchorRect(step.highlightAnchor);
    if (!rect) return undefined;
    return rect.left + rect.width / 2;
  }, [step, getAnchorRect]);

  // ─── Guide callbacks ──────────────────────────────────────────────────

  const handleEmergeComplete = useCallback(() => {
    setEmergeComplete(true);
  }, []);

  const handleFallComplete = useCallback(() => {
    // After falling from modal, start emerging onto bar and advance step
    setTransition('emerging_bar');
    tourActions.next();
  }, [tourActions]);

  const handleBarEmergeComplete = useCallback(() => {
    setTransition('none');
    setEmergeComplete(true);
  }, []);

  // ─── Navigation ───────────────────────────────────────────────────────

  const handleNext = useCallback(() => {
    if (!step) return;

    if (step.modalPlacement === 'center') {
      // Welcome → first bar item: fall off modal
      setTransition('falling');
      setEmergeComplete(false);
    } else {
      // Bar item → next bar item: just advance, guide will walk to new target
      tourActions.next();
    }
  }, [step, tourActions]);

  const handlePrev = useCallback(() => {
    setTransition('none');
    tourActions.prev();
  }, [tourActions]);

  const handleSkip = useCallback(() => {
    onComplete();
  }, [onComplete]);

  // ─── Render ───────────────────────────────────────────────────────────

  if (!tourState.isActive || !step) return null;

  const isCentered = step.modalPlacement === 'center';

  return (
    <>
      {/* Dark backdrop — welcome step only */}
      {isWelcome && transition === 'none' && (
        <div
          className={cn(
            'fixed inset-0 z-50',
            'transition-opacity duration-400',
            isVisible ? 'opacity-100' : 'opacity-0',
          )}
        >
          <div className="absolute inset-0 bg-black/60 backdrop-blur-[2px]" />
        </div>
      )}

      {/* Highlight pulse on active anchor */}
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
          isCentered ? 'inset-0 items-center' : 'bottom-28 left-0 right-0',
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
        intent={guideIntent}
        surfaceLeft={activeSurface.left}
        surfaceRight={activeSurface.right}
        surfaceY={activeSurface.y}
        targetX={barTargetX}
        onEmergeComplete={
          transition === 'emerging_bar' ? handleBarEmergeComplete : handleEmergeComplete
        }
        onFallComplete={handleFallComplete}
      />
    </>
  );
}

/**
 * useFirstHatchTourActivation - Activation guard for the first-egg hatch tour.
 *
 * This hook checks all preconditions and calls `tour.actions.start()` when
 * the tour should activate. It is intentionally separated from the tour
 * state machine so that:
 * - The state machine stays generic and reusable.
 * - Activation rules are centralized in one place.
 * - The rules are easy to read and modify.
 *
 * ────────────────────────────────────────────────────────────────
 * Activation rules (ALL must be true):
 * ────────────────────────────────────────────────────────────────
 * 1. The companions list is loaded (not loading / error).
 * 2. The user has exactly 1 Blobbi.
 * 3. That Blobbi is in the egg stage.
 * 4. No Blobbi is in baby or adult stage.
 * 5. The `blobbi_first_hatch_tour_done` profile tag is NOT true.
 * 6. The tour is not already active or completed this session.
 *
 * Persistence: The Kind 11125 profile tag `blobbi_first_hatch_tour_done`
 * is the sole authoritative persisted signal. No localStorage is used.
 *
 * MIGRATION NOTE: `blobbi_onboarding_done` is intentionally ignored
 * when the user is in the single-egg state. This ensures old accounts
 * that were migrated before the hatch tour existed can still experience
 * it. The `blobbi_first_hatch_tour_done` tag is the dedicated signal.
 * ────────────────────────────────────────────────────────────────
 */

import { useEffect, useMemo } from 'react';

import type { BlobbiCompanion } from '@/blobbi/core/lib/blobbi';

import type { UseFirstHatchTourResult } from './useFirstHatchTour';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface FirstHatchTourActivationInput {
  /** The full list of the user's Blobbi companions */
  companions: BlobbiCompanion[];
  /**
   * Whether the companion data has been resolved at least once and is
   * ready for activation evaluation. When false, the hook defers all
   * evaluation. This should reflect initial data readiness, not
   * background refetch activity.
   */
  companionsReady: boolean;
  /** The tour hook result (in-memory state machine) */
  tour: UseFirstHatchTourResult;
  /**
   * Whether the first hatch tour is already marked complete in the
   * Blobbonaut profile event (`blobbi_first_hatch_tour_done` tag).
   * This is the sole authoritative persisted signal.
   */
  profileFirstHatchTourDone?: boolean;
}

export interface FirstHatchTourActivationResult {
  /**
   * Whether all preconditions for activating the tour are met right now.
   * This is a derived boolean -- it does NOT mean the tour IS active,
   * just that it SHOULD be activated. The tour may already be active
   * from a previous render.
   */
  shouldActivate: boolean;
  /**
   * Whether the tour is eligible (preconditions met and not yet completed).
   * Useful for hiding UI that should only appear during the tour window.
   */
  isEligible: boolean;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * Evaluates activation preconditions and auto-starts the tour when met.
 *
 * Usage:
 * ```ts
 * const tour = useFirstHatchTour();
 * const activation = useFirstHatchTourActivation({
 *   companions,
 *   companionsReady: !companionsLoading,
 *   tour,
 *   profileFirstHatchTourDone: profile?.firstHatchTourDone,
 * });
 * ```
 */
export function useFirstHatchTourActivation({
  companions,
  companionsReady,
  tour,
  profileFirstHatchTourDone = false,
}: FirstHatchTourActivationInput): FirstHatchTourActivationResult {
  // ── Precondition evaluation ──

  const { shouldActivate, isEligible } = useMemo(() => {
    // Defer until companion data has been resolved at least once
    if (!companionsReady) {
      return { shouldActivate: false, isEligible: false };
    }

    // Profile tag is the sole persisted completion signal
    if (profileFirstHatchTourDone) {
      return { shouldActivate: false, isEligible: false };
    }

    // Tour already completed or active this session — don't re-activate
    if (tour.state.isCompleted || tour.state.isActive) {
      return { shouldActivate: false, isEligible: false };
    }

    // Must have exactly 1 companion
    if (companions.length !== 1) {
      return { shouldActivate: false, isEligible: false };
    }

    const onlyBlobbi = companions[0];

    // That companion must be an egg
    if (onlyBlobbi.stage !== 'egg') {
      return { shouldActivate: false, isEligible: false };
    }

    // No baby or adult companions (redundant given length === 1 + stage === 'egg',
    // but kept explicit for clarity and future-proofing)
    const hasBabyOrAdult = companions.some(
      (c) => c.stage === 'baby' || c.stage === 'adult',
    );
    if (hasBabyOrAdult) {
      return { shouldActivate: false, isEligible: false };
    }

    // All preconditions met — activate
    return { shouldActivate: true, isEligible: true };
  }, [companionsReady, companions, tour.state.isCompleted, tour.state.isActive, profileFirstHatchTourDone]);

  // ── Auto-start effect ──
  useEffect(() => {
    if (shouldActivate) {
      tour.actions.start();
    }
  }, [shouldActivate, tour.actions]);

  return { shouldActivate, isEligible };
}

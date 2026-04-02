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
 * 5. The tour has not been completed yet (checked via profile tag
 *    AND localStorage fallback).
 *
 * Completion is authoritative from the Blobbonaut profile event
 * (`blobbi_onboarding_done` tag). localStorage (`blobbi:tour:first-hatch`)
 * is a secondary signal for in-progress UI state and as a fallback
 * when the profile hasn't been updated yet.
 * ────────────────────────────────────────────────────────────────
 */

import { useEffect, useMemo } from 'react';

import type { BlobbiCompanion } from '@/blobbi/core/lib/blobbi';

import type { UseFirstHatchTourResult } from './useFirstHatchTour';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface FirstHatchTourActivationInput {
  /** The full list of the user's Blobbi companions */
  companions: BlobbiCompanion[];
  /** Whether the companions list is still loading */
  isLoading: boolean;
  /** The tour hook result (localStorage-based state machine) */
  tour: UseFirstHatchTourResult;
  /**
   * Whether onboarding is already marked complete in the Blobbonaut profile
   * event (`blobbi_onboarding_done` tag). This is the authoritative source.
   * When true, the tour will not activate regardless of localStorage state.
   */
  profileOnboardingDone?: boolean;
}

export interface FirstHatchTourActivationResult {
  /**
   * Whether all preconditions for activating the tour are met right now.
   * This is a derived boolean -- it does NOT mean the tour IS active,
   * just that it SHOULD be activated. The tour may already be active
   * from a previous render or a persisted state.
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
 *   isLoading: companionsLoading,
 *   tour,
 *   profileOnboardingDone: profile?.onboardingDone,
 * });
 * ```
 */
export function useFirstHatchTourActivation({
  companions,
  isLoading,
  tour,
  profileOnboardingDone = false,
}: FirstHatchTourActivationInput): FirstHatchTourActivationResult {
  // ── Precondition evaluation ──

  const { shouldActivate, isEligible } = useMemo(() => {
    // Can't evaluate until data is loaded
    if (isLoading) {
      return { shouldActivate: false, isEligible: false };
    }

    // Already completed — profile tag is the authoritative source,
    // localStorage is a secondary fallback
    if (profileOnboardingDone || tour.state.isCompleted) {
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
    // but kept explicit for clarity and future-proofing if rules change)
    const hasBabyOrAdult = companions.some(
      (c) => c.stage === 'baby' || c.stage === 'adult',
    );
    if (hasBabyOrAdult) {
      return { shouldActivate: false, isEligible: false };
    }

    // All preconditions met
    const eligible = true;
    // Only activate if the tour is not already running
    const activate = !tour.state.isActive;

    return { shouldActivate: activate, isEligible: eligible };
  }, [isLoading, companions, tour.state.isCompleted, tour.state.isActive, profileOnboardingDone]);

  // ── Auto-start effect ──
  // When all preconditions are met and the tour hasn't started yet,
  // start it. This fires once and then `shouldActivate` flips to false
  // because `tour.state.isActive` becomes true.
  useEffect(() => {
    if (shouldActivate) {
      tour.actions.start();
    }
  }, [shouldActivate, tour.actions]);

  return { shouldActivate, isEligible };
}

import { useEffect, useState } from 'react';

import type { ArrivalPhase } from '@/hooks/useFirstArrivalExperience';

/**
 * The visual acts of the arrival, in order.
 *
 * These are *staging*, not lifecycle: the lifecycle machine
 * (`useFirstArrivalExperience`) owns whether an arrival is owed, when the
 * intent is consumed, and when the overlay is done. This owns only which act is
 * on screen — and, critically, **which layer owns the text right now**.
 *
 * Every act has exactly one text owner. The previous implementation crossfaded
 * a welcome and a card inside one container, which measured at ~400ms with both
 * at full opacity, stacked. Naming the acts makes that impossible to express.
 *
 * - `signal`      — background and points of light; no copy yet.
 * - `welcome`     — "Welcome to Ditto" reads, alone.
 * - `welcome-out` — the welcome leaves; nothing else has entered.
 * - `presenting`  — the Explorer introduction (heading, microcopy, card).
 * - `revealing`   — the backdrop dissolves; the application appears behind.
 * - `preparing`   — surrounding copy and card body fade; the card compacts.
 * - `travelling`  — the card flies to its destination.
 * - `done`        — nothing on screen.
 */
export type ArrivalStage =
  | 'signal'
  | 'welcome'
  | 'welcome-out'
  | 'presenting'
  | 'revealing'
  | 'preparing'
  | 'travelling'
  | 'done';

/**
 * Act boundaries, in ms from the start of the sequence.
 *
 * Tuned against browser recordings rather than picked on paper. The previous
 * pass left the welcome fully readable for only ~215ms before the card
 * appeared, and then left ~825ms of dead air after the application was already
 * visible. Both are gone: the welcome now holds for ~850ms, and the card starts
 * moving while the backdrop is still finishing its fade.
 */
export const STAGE_TIMINGS = {
  /** Points of light and the mark form. */
  signal: 600,
  /** The welcome is fully readable from here. */
  welcome: 1_400,
  /** The welcome fades; nothing else is entering yet. */
  welcomeOut: 1_750,
  /**
   * How long after `revealing` begins the handoff preparation starts. The
   * surrounding copy and the card's body fade here, so by the time the card
   * moves it is already the compact object it is about to become.
   */
  prepareAfterReveal: 400,
} as const;

/** Reduced motion keeps the same acts, just shorter — no travel, no movement. */
export const REDUCED_STAGE_TIMINGS = {
  signal: 0,
  welcome: 700,
  welcomeOut: 850,
  prepareAfterReveal: 0,
} as const;

/** Development harness entry points, mapped to the act they start on. */
export type ArrivalStageEntry = 'welcome' | 'presenting' | 'revealing' | 'handoff';

function entryStage(entry: ArrivalStageEntry | undefined): ArrivalStage | undefined {
  switch (entry) {
    case 'welcome':
      return 'welcome';
    case 'presenting':
      return 'presenting';
    case 'revealing':
      return 'revealing';
    case 'handoff':
      return 'travelling';
    default:
      return undefined;
  }
}

/**
 * Derive the current visual act from the lifecycle phase.
 *
 * Acts inside `playing` advance on their own timers; everything from the reveal
 * onwards is driven by the lifecycle, so the two can never disagree about
 * whether the arrival is still running.
 */
export function useArrivalStage({
  phase,
  reducedMotion,
  entry,
}: {
  phase: ArrivalPhase;
  reducedMotion: boolean;
  entry?: ArrivalStageEntry;
}): ArrivalStage {
  const timings = reducedMotion ? REDUCED_STAGE_TIMINGS : STAGE_TIMINGS;
  const forced = entryStage(entry);

  const [playStage, setPlayStage] = useState<ArrivalStage>(
    () => forced ?? (reducedMotion ? 'welcome' : 'signal'),
  );
  const [prepared, setPrepared] = useState(false);

  // Acts within `playing`. Absolute timers from the start of the phase rather
  // than a chain of relative ones, so a slow frame can't let the acts drift
  // apart from the lifecycle's own `PLAY_MS`.
  useEffect(() => {
    if (phase !== 'playing') return;
    if (forced) return;

    const timers = [
      setTimeout(() => setPlayStage('welcome'), timings.signal),
      setTimeout(() => setPlayStage('welcome-out'), timings.welcome),
      setTimeout(() => setPlayStage('presenting'), timings.welcomeOut),
    ];
    return () => timers.forEach(clearTimeout);
  }, [phase, forced, timings]);

  // Handoff preparation, a beat before the travel starts.
  useEffect(() => {
    if (phase !== 'revealing') {
      setPrepared(false);
      return;
    }
    const timer = setTimeout(() => setPrepared(true), timings.prepareAfterReveal);
    return () => clearTimeout(timer);
  }, [phase, timings]);

  switch (phase) {
    case 'playing':
      return forced ?? playStage;
    case 'revealing':
      return prepared ? 'preparing' : 'revealing';
    case 'travelling':
      return 'travelling';
    default:
      return 'done';
  }
}

/** Whether the welcome layer should be mounted at all. */
export function isWelcomeStage(stage: ArrivalStage): boolean {
  return stage === 'welcome' || stage === 'welcome-out' || stage === 'signal';
}

/** Whether the Explorer presentation (heading + card) should be mounted. */
export function isPresentationStage(stage: ArrivalStage): boolean {
  return (
    stage === 'presenting' ||
    stage === 'revealing' ||
    stage === 'preparing' ||
    stage === 'travelling'
  );
}

/**
 * Whether the transient surrounding copy — the heading and microcopy that
 * frame the card — should still be readable.
 *
 * It belongs to the central presentation only. It never travels, and it is
 * gone before the card starts moving.
 */
export function isIntroCopyVisible(stage: ArrivalStage): boolean {
  return stage === 'presenting' || stage === 'revealing';
}

/** Whether the card should be showing its compact, travel-ready form. */
export function isCardSimplified(stage: ArrivalStage): boolean {
  return stage === 'preparing' || stage === 'travelling';
}

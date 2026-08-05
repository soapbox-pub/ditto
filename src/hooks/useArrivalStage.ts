import { useEffect, useState } from 'react';

import type { ArrivalPhase } from '@/hooks/useFirstArrivalExperience';

/**
 * The visual acts of the arrival, in order.
 *
 * These are *staging*, not lifecycle: the lifecycle machine
 * (`useFirstArrivalExperience`) owns whether an arrival is owed, when the intent
 * is consumed, and when the overlay is done. This owns only which act is on
 * screen — and, critically, **which layer owns the text right now**.
 *
 * Every act has exactly one text owner, and each of the two things worth
 * reading gets its own entrance, its own completely still hold, and its own
 * exit. An earlier version crossfaded the welcome and the card inside one
 * container, which measured at ~400ms with both at full opacity, stacked;
 * naming the acts makes that impossible to express.
 *
 * - `signal`      — background and points of light; no copy yet.
 * - `welcome`     — "Welcome to Ditto" enters, then holds, alone.
 * - `welcome-out` — the welcome leaves; nothing else has entered.
 * - `gap`         — a clean beat with no copy at all. Punctuation between two
 *                   chapters, so the second doesn't read as a continuation.
 * - `presenting`  — the Explorer introduction enters (heading, microcopy, card).
 * - `reading`     — the composition is settled and still; the beat where the
 *                   user actually reads it.
 * - `copy-out`    — the framing copy and the reassurance leave, and the card is
 *                   left alone on the still-opaque backdrop for a moment. The
 *                   application is not revealed yet: the presentation finishes
 *                   before the handoff starts.
 * - `revealing`   — the backdrop dissolves; the application appears behind.
 * - `content-out` — framing copy leaves and the card's full presentation content
 *                   wipes away, bottom to top.
 * - `content-in`  — the compact destination content rises into the emptied card.
 * - `travelling`  — the card, already destination-shaped, flies to its place.
 * - `done`        — nothing on screen.
 */
export type ArrivalStage =
  | 'signal'
  | 'welcome'
  | 'welcome-out'
  | 'gap'
  | 'presenting'
  | 'reading'
  | 'copy-out'
  | 'revealing'
  | 'content-out'
  | 'content-in'
  | 'travelling'
  | 'done';

/**
 * Act boundaries, in ms from the start of the sequence.
 *
 * Tuned against browser recordings, not picked on paper. The two reading holds
 * measured at 553ms and 1017ms before this pass — technically windows, but both
 * read as rushed. They are now 1550ms and 1800ms, and neither counts its own
 * entrance animation as reading time.
 *
 * This sequence is shown once per account, during account creation, with Skip
 * always available. It is deliberately not optimised for brevity.
 */
export const STAGE_TIMINGS = {
  /**
   * Points of light and the mark form. No copy yet.
   *
   * Matches the copy's own 500ms CSS delay, so the boundary is where the welcome
   * actually starts entering rather than an independent number that has to be
   * kept in sync by hand.
   */
  signal: 500,
  /**
   * The welcome leaves. Its copy enters over 450ms after a 500ms delay, so it is
   * fully still and readable from ~950ms — giving a 1550ms stable hold, none of
   * which is spent watching it arrive.
   */
  welcome: 2_500,
  /** The welcome has finished leaving; the clean gap begins. */
  welcomeOut: 3_000,
  /**
   * The Explorer presentation begins entering. The gap before it is short but
   * deliberate: long enough to read as punctuation, too short to read as
   * loading.
   */
  gap: 3_220,
  /**
   * The Explorer composition has finished entering and is completely still.
   *
   * The entrance is staged rather than simultaneous, and the hold starts only
   * once the last of it has landed: framing copy over 0–600ms, the card 160ms
   * behind it and settled by ~780ms, the reassurance below the card last of all
   * at 650–1100ms. Nothing is still arriving after this point.
   */
  presentationSettled: 4_320,
  /**
   * The framing copy and the reassurance begin leaving, ending the reading hold.
   *
   * Six full seconds after the composition settles. The Explorer presentation is
   * the one moment carrying real information — what Ditto Explorer is, that it
   * holds 4 short missions, and that finishing them leads somewhere — and it
   * previously gave the user about two seconds to take all of that in.
   */
  presentationOut: 10_320,
  /** How long after `revealing` begins the full card content starts wiping. */
  contentOutAfterReveal: 80,
  /** How long after `revealing` begins the compact content starts entering. */
  contentInAfterReveal: 380,
} as const;

/** The shortest hold worth calling a reading moment, for each act. */
export const MIN_WELCOME_HOLD_MS = 1_500;
export const MIN_READING_HOLD_MS = 5_800;

/** When the welcome has finished entering and is stable. */
export const WELCOME_ENTERED_AT_MS = 950;

/**
 * Reduced motion keeps every act and both holds — it means no travel and no
 * movement, not "skip the explanation". Only the entrances and exits are
 * shortened, because a crossfade needs less time than a movement.
 */
export const REDUCED_STAGE_TIMINGS = {
  signal: 0,
  welcome: 1_700,
  welcomeOut: 1_950,
  gap: 2_150,
  presentationSettled: 2_450,
  // The same six seconds. Reduced motion shortens entrances and removes
  // movement; it does not decide the user reads faster.
  presentationOut: 8_450,
  contentOutAfterReveal: 0,
  contentInAfterReveal: 220,
} as const;

/** When the welcome is stable under reduced motion. */
export const REDUCED_WELCOME_ENTERED_AT_MS = 200;

/** Development harness entry points, mapped to the act they start on. */
export type ArrivalStageEntry =
  | 'welcome'
  | 'welcome-reading'
  | 'presenting'
  | 'reading'
  | 'copy-out'
  | 'revealing'
  | 'content-out'
  | 'content-in'
  | 'handoff';

function entryStage(entry: ArrivalStageEntry | undefined): ArrivalStage | undefined {
  switch (entry) {
    case 'welcome':
    case 'welcome-reading':
      return 'welcome';
    case 'presenting':
      return 'presenting';
    case 'reading':
      return 'reading';
    case 'copy-out':
      return 'copy-out';
    case 'revealing':
      return 'revealing';
    case 'content-out':
      return 'content-out';
    case 'content-in':
      return 'content-in';
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
  const [revealStage, setRevealStage] = useState<ArrivalStage>('revealing');

  // Acts within `playing`. Absolute timers from the start of the phase rather
  // than a chain of relative ones, so a slow frame can't let the acts drift
  // apart from the lifecycle's own `PLAY_MS`.
  useEffect(() => {
    if (phase !== 'playing') return;
    if (forced) return;

    const timers = [
      setTimeout(() => setPlayStage('welcome'), timings.signal),
      setTimeout(() => setPlayStage('welcome-out'), timings.welcome),
      setTimeout(() => setPlayStage('gap'), timings.welcomeOut),
      setTimeout(() => setPlayStage('presenting'), timings.gap),
      setTimeout(() => setPlayStage('reading'), timings.presentationSettled),
      setTimeout(() => setPlayStage('copy-out'), timings.presentationOut),
    ];
    return () => timers.forEach(clearTimeout);
  }, [phase, forced, timings]);

  // The content transformation, inside the reveal window. The card empties and
  // refills *before* it moves, so the travel carries an object that already
  // looks like its destination.
  useEffect(() => {
    if (phase !== 'revealing') {
      setRevealStage('revealing');
      return;
    }
    if (forced) return;
    const timers = [
      setTimeout(() => setRevealStage('content-out'), timings.contentOutAfterReveal),
      setTimeout(() => setRevealStage('content-in'), timings.contentInAfterReveal),
    ];
    return () => timers.forEach(clearTimeout);
  }, [phase, forced, timings]);

  switch (phase) {
    case 'playing':
      return forced ?? playStage;
    case 'revealing':
      return forced ?? revealStage;
    case 'travelling':
      return 'travelling';
    default:
      return 'done';
  }
}

/** Whether the welcome layer should be mounted at all. */
export function isWelcomeStage(stage: ArrivalStage): boolean {
  return stage === 'signal' || stage === 'welcome' || stage === 'welcome-out';
}

/**
 * Whether the welcome is in its stable, readable hold — entered, still, and
 * with nothing else on screen.
 */
export function isWelcomeHold(stage: ArrivalStage): boolean {
  return stage === 'welcome';
}

/**
 * The clean beat between the two chapters. Nothing readable is mounted, by
 * construction rather than by both happening to be transparent.
 */
export function isGap(stage: ArrivalStage): boolean {
  return stage === 'gap';
}

/** Whether the Explorer presentation (framing copy + card) should be mounted. */
export function isPresentationStage(stage: ArrivalStage): boolean {
  return (
    stage === 'presenting' ||
    stage === 'reading' ||
    stage === 'copy-out' ||
    stage === 'revealing' ||
    stage === 'content-out' ||
    stage === 'content-in' ||
    stage === 'travelling'
  );
}

/**
 * Whether the transient framing copy — eyebrow, heading, and the line explaining
 * the four missions — should still be readable.
 *
 * It belongs to the central presentation only. It never travels, and it is gone
 * before the card starts transforming: the presentation ends, *then* the handoff
 * begins. It used to fade during `revealing`, which put the framing copy's exit
 * on top of the card's content wipe and the application appearing behind both.
 */
export function isIntroCopyVisible(stage: ArrivalStage): boolean {
  return stage === 'presenting' || stage === 'reading';
}

/**
 * Whether the reassurance below the card is readable.
 *
 * Same lifetime as the framing copy, and for the same reason — it is stage
 * dressing, not part of the object that travels. It enters last, once the card
 * it refers to has settled, so the composition assembles top-down.
 */
export function isReassuranceVisible(stage: ArrivalStage): boolean {
  return stage === 'presenting' || stage === 'reading';
}

/**
 * The beat after the reading hold where the framing copy and the reassurance
 * are leaving and the card is alone on a still-opaque backdrop.
 *
 * Its whole purpose is separation: the presentation finishes as a presentation
 * before anything about the handoff starts. Nothing is revealed here.
 */
export function isCopyExiting(stage: ArrivalStage): boolean {
  return stage === 'copy-out';
}

/**
 * Whether the composition is settled and still — the reading beat, and the only
 * window where the ambient treatment runs.
 *
 * The ambient glow is confined here: during the entrance it would compete with
 * the elements arriving, and from the reveal onwards the card is on its way out.
 */
export function isReadingBeat(stage: ArrivalStage): boolean {
  return stage === 'reading';
}

/**
 * Whether the card's full presentation content is still shown. It must be
 * completely unchanged throughout the reading hold — the composition the user
 * is reading cannot start dismantling itself under them.
 */
export function isFullCardContentVisible(stage: ArrivalStage): boolean {
  return (
    stage === 'presenting' ||
    stage === 'reading' ||
    stage === 'copy-out' ||
    stage === 'revealing'
  );
}

/**
 * Whether the compact, destination-shaped content is shown. From here on the
 * card already looks like the surface it is about to become, so the travel has
 * nothing left to reconcile on arrival.
 */
export function isCompactCardContentVisible(stage: ArrivalStage): boolean {
  return stage === 'content-in' || stage === 'travelling';
}

/**
 * Whether the card is mid-transformation — its full content gone or going, its
 * compact content not yet in. Both content groups are absent at the crossover,
 * leaving only the shared anchors and the shell.
 */
export function isCardTransforming(stage: ArrivalStage): boolean {
  return stage === 'content-out' || stage === 'content-in';
}

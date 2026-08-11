import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import type { BadgeClaimOutcome } from '@/hooks/useBadgeClaim';
import { prefersReducedMotion } from '@/lib/reducedMotion';

/**
 * The ceremony's phases.
 *
 * - `closed`    — nothing mounted.
 * - `opening`   — the sealed reward is travelling from where the user clicked it.
 * - `sealed`    — settled and still, waiting for the user. Indefinite.
 * - `acting`    — the claim is being signed and published.
 * - `revealing` — the seal is coming off the badge.
 * - `settled`   — the badge is revealed and the composition is still.
 * - `failed`    — the publish did not go through. Retryable, forever.
 * - `closing`   — travelling back toward where it came from.
 *
 * **None of these is persisted, and that is the point.** The one durable fact
 * about a reveal is `badgeClaim.revealedAt`, written the moment the claim
 * succeeds — *before* the animation runs, not after. So the animation is
 * disposable: skipping it, closing over it, or reloading through it all land on
 * the same revealed reward, because none of them can un-write the timestamp.
 * `revealing` and `settled` differ only in whether the choreography is still
 * playing.
 */
export type RewardCeremonyPhase =
  | 'closed'
  | 'opening'
  | 'sealed'
  | 'acting'
  | 'revealing'
  | 'settled'
  | 'failed'
  | 'closing';

/**
 * How long the acting presentation is held even when the claim resolves sooner.
 *
 * A publish that comes back in 80ms would otherwise flash "Sending your claim…"
 * and be gone before it could be read, which reads as a glitch rather than as an
 * act. This delays only the *presentation*: the event is published and persisted
 * the moment it resolves, whatever this does.
 */
export const CEREMONY_MIN_ACTING_MS = 700;

/**
 * When the acting copy changes once to explain a wait.
 *
 * Publishing is bounded (the relay write aborts at 5s) but *signing* is not: an
 * extension or a remote bunker can hold the user in an approval prompt
 * indefinitely, with this stage sitting behind it. After this the copy names
 * that possibility, once. It never cancels anything, never counts down, and a
 * late success proceeds exactly as an early one would.
 */
export const CEREMONY_SLOW_MS = 2_200;

/**
 * How long the reveal choreography runs before the composition is settled.
 *
 * Covers the seal getting out of the way, the badge resolving, and the name and
 * copy arriving after it. Purely a presentation clock: `revealedAt` is already
 * persisted when this starts, so nothing depends on it finishing.
 */
export const CEREMONY_REVEAL_MS = 1_900;

/** Router state marking the history entry the ceremony pushes for Back. */
const CEREMONY_HISTORY_STATE = 'rewardCeremony';

function hasCeremonyEntry(state: unknown): boolean {
  return !!state && typeof state === 'object' &&
    (state as Record<string, unknown>)[CEREMONY_HISTORY_STATE] === true;
}

/**
 * Local interaction state for the reward ceremony: which phase it is in, where
 * it was opened from, and the browser-Back handling that makes a full-screen
 * stage behave like a place rather than a trap.
 *
 * ### Why Back is a history entry rather than a listener
 *
 * A full-screen overlay that ignores Back is a bug on a phone: the gesture that
 * should dismiss it navigates away from `/missions` instead, and the user loses
 * their place to close a dialog. So opening pushes one entry at the *same* URL
 * carrying a marker in router state, and every close pops it:
 *
 *  - **Back** — the entry disappears, the location effect notices the marker has
 *    gone, and the ceremony closes. No animation: the user asked to leave now.
 *  - **Close / Escape / backdrop** — the return animation runs, and only when it
 *    finishes does `finishClose` pop the entry. Closing therefore leaves the
 *    history stack exactly as it found it, so repeated open/close cycles cannot
 *    accumulate entries the user would have to press Back through later.
 *
 * Pushed through the router rather than `window.history` directly, because the
 * router owns this history stack and a raw `pushState` behind its back leaves it
 * describing a location that no longer matches the one in the address bar.
 */
export function useRewardCeremony({
  claimSubmitted = false,
}: {
  /**
   * Whether the persisted claim already exists. Watched while acting so a claim
   * that resolves outside this ceremony still ends the act truthfully.
   */
  claimSubmitted?: boolean;
} = {}) {
  const [phase, setPhase] = useState<RewardCeremonyPhase>('closed');
  /** The claim is taking long enough to be worth explaining. */
  const [slow, setSlow] = useState(false);
  /** Consecutive failures in *this* ceremony, for the copy only. Never a limit. */
  const [failures, setFailures] = useState(0);
  /** The reveal was skipped, so it should land without easing. */
  const [skipped, setSkipped] = useState(false);
  /**
   * Whether *this* ceremony is mid-submit.
   *
   * The "a claim resolved elsewhere" effect below watches persisted state, and
   * for a user who was already claimed that state is true from the first frame —
   * so it fired the moment the act began, moved the phase off `acting`, and the
   * real outcome then found itself too late to stamp the reveal. The already
   * claimed path silently stopped persisting `revealedAt`. While our own submit
   * is running, its outcome is the only thing allowed to end the act.
   */
  const submittingRef = useRef(false);
  const navigate = useNavigate();
  const location = useLocation();

  // Read inside callbacks that must not be re-created when the phase changes —
  // a new `open` identity on every phase transition would re-run the effects of
  // anything keyed on it.
  const phaseRef = useRef(phase);
  phaseRef.current = phase;

  /** Whether *this* ceremony pushed the entry it is about to pop. */
  const pushedRef = useRef(false);
  /** Where the reward was on screen when it was clicked. */
  const sourceRectRef = useRef<DOMRect | null>(null);
  /** The element itself, re-measured at close: it may have moved, or gone. */
  const sourceRef = useRef<HTMLElement | null>(null);
  /** The control to hand focus back to. Radix restores this itself; kept for
   *  the case where the trigger unmounts and Radix has nothing to return to. */
  const triggerRef = useRef<HTMLElement | null>(null);

  const open = useCallback(
    (
      source: HTMLElement | null,
      options?: {
        trigger?: HTMLElement | null;
        /** Land on the settled stage without playing the entrance. */
        immediate?: boolean;
        /**
         * Localhost harness only: open directly on a phase, purely as a
         * presentation. Nothing is signed, published or persisted to get here —
         * the claim is only ever reachable through the real gesture.
         */
        phase?: RewardCeremonyPhase;
        /** Harness only: start already showing the slow-signer explanation. */
        slow?: boolean;
      },
    ) => {
      // Rapid double-open, a double-tap, or Strict Mode's double invocation:
      // one ceremony, one history entry.
      if (phaseRef.current !== 'closed') return;

      sourceRef.current = source;
      sourceRectRef.current = source?.getBoundingClientRect() ?? null;
      triggerRef.current = options?.trigger ?? null;

      // Reduced motion has nothing to travel, so it starts settled rather than
      // spending a phase animating to where it already is.
      setSlow(options?.slow === true);
      setPhase(
        options?.phase ??
          (options?.immediate || prefersReducedMotion() ? 'sealed' : 'opening'),
      );

      // The whole current URL, hash included. Dropping the hash would silently
      // move the user off an anchor when the ceremony opened, and again when it
      // closed and popped back to a location that no longer matched.
      navigate(`${location.pathname}${location.search}${location.hash}`, {
        state: { ...(location.state as object | null), [CEREMONY_HISTORY_STATE]: true },
      });
      pushedRef.current = true;
    },
    [navigate, location.pathname, location.search, location.hash, location.state],
  );

  /** The entrance finished (or could not run). Settle. */
  const settle = useCallback(() => {
    if (phaseRef.current === 'opening') setPhase('sealed');
  }, []);

  /**
   * The ceremonial act: submit the claim, and narrate it honestly.
   *
   * The claim *policy* stays in `useBadgeClaim` — what may be published, the
   * three layers of idempotency, what counts as failure. This owns only the
   * presentation around it: the minimum hold, the one copy change for a slow
   * signer, and which phase each outcome lands in.
   *
   * ### The irreversible point is a write, not a frame
   *
   * A fresh claim persists `status: 'claimed'` **and** `revealedAt` in one
   * settings write, via the atomic option on `completeBadgeClaim`. A claim that
   * already existed publishes nothing and stamps `revealedAt` on its own. Either
   * way the timestamp is down before a single pixel moves, which is what makes
   * the choreography safe to skip, close over, or reload through.
   */
  const reveal = useCallback(
    async (actions: {
      /** Publish and persist the claim, recording the reveal in the same write. */
      submit: (options: { revealedAt: number }) => Promise<BadgeClaimOutcome>;
      /** Stamp the reveal on a claim that already exists. Publishes nothing. */
      markRevealed: () => Promise<void>;
    }) => {
      // The button is disabled while acting, but a keyboard repeat or a
      // programmatic double call must not start a second publish either.
      if (phaseRef.current !== 'sealed' && phaseRef.current !== 'failed') return;

      setPhase('acting');
      setSlow(false);
      submittingRef.current = true;
      const startedAt = Date.now();
      const slowTimer = setTimeout(() => setSlow(true), CEREMONY_SLOW_MS);

      let outcome: BadgeClaimOutcome;
      try {
        outcome = await actions.submit({ revealedAt: Date.now() });
      } catch (error) {
        // `claim()` reports failure rather than throwing, so this is a bug
        // guard, not the failure path.
        outcome = { status: 'failed', error };
      } finally {
        clearTimeout(slowTimer);
      }

      const held = Date.now() - startedAt;
      if (held < CEREMONY_MIN_ACTING_MS) {
        await new Promise((resolve) => setTimeout(resolve, CEREMONY_MIN_ACTING_MS - held));
      }
      submittingRef.current = false;

      // The user may have closed the stage while the signer was open. The
      // publish still ran and still persisted; there is just nothing to narrate.
      // Read through a widened local: the guard at the top of this function
      // narrowed `phaseRef.current`, and TypeScript keeps that narrowing across
      // the await even though the phase very much can have moved since.
      const phaseNow = phaseRef.current as RewardCeremonyPhase;
      if (phaseNow !== 'acting') return;
      setSlow(false);

      switch (outcome.status) {
        case 'claimed':
          // `revealedAt` went down with the claim, in one write.
          setFailures(0);
          setPhase('revealing');
          return;
        case 'already-claimed':
          // Claimed under an earlier build, so there is nothing to publish —
          // but the reveal is still owed, and it must be the same ceremony
          // rather than a lesser one. Stamp it, then reveal.
          await actions.markRevealed();
          setFailures(0);
          if ((phaseRef.current as RewardCeremonyPhase) === 'acting') setPhase('revealing');
          return;
        case 'failed':
          setFailures((count) => count + 1);
          setPhase('failed');
          return;
        case 'in-flight':
          // A claim is genuinely running somewhere else. Not a failure, and not
          // something to retry — hold the acting presentation and let the
          // persisted state resolve it (see the effect below).
          return;
        case 'ineligible':
          // The mission changed underneath the ceremony. Never fabricate a
          // success; fall back to the truthful sealed state.
          setPhase('sealed');
          return;
      }
    },
    [],
  );

  /**
   * Jump to the end of the reveal.
   *
   * Skipping the *animation* is not undoing the reward: `revealedAt` was written
   * before it started, so this only stops the choreography and shows the badge
   * at once. `skipped` also tells the art to apply the revealed treatment with
   * no transition, so a skip lands immediately instead of easing for another
   * second.
   */
  const skipReveal = useCallback(() => {
    if (phaseRef.current !== 'revealing') return;
    setSkipped(true);
    setPhase('settled');
  }, []);

  /** Begin closing: run the return animation, then pop the history entry. */
  const requestClose = useCallback(() => {
    if (phaseRef.current === 'closed' || phaseRef.current === 'closing') return;
    setPhase(prefersReducedMotion() ? 'closed' : 'closing');
    if (prefersReducedMotion()) {
      if (pushedRef.current) {
        pushedRef.current = false;
        navigate(-1);
      }
    }
  }, [navigate]);

  /** The return animation finished. Give the history entry back. */
  const finishClose = useCallback(() => {
    if (phaseRef.current !== 'closing') return;
    if (pushedRef.current) {
      pushedRef.current = false;
      // The location effect below sees the marker gone and sets `closed`, so
      // the two close paths converge on one state transition.
      navigate(-1);
    } else {
      setPhase('closed');
    }
  }, [navigate]);

  /**
   * Leave the ceremony for somewhere else in the app.
   *
   * Navigating straight out pushes the destination *on top of* the entry the
   * ceremony added for Back. The unmount cleanup below then finds itself still
   * holding that entry — the location it last rendered with is the marked one,
   * because a component being removed does not render again — and pops it,
   * dropping the user back on the journey they just asked to leave. The
   * destination flashed past and the journey came back.
   *
   * So the entry is handed back first, and the destination pushed onto the
   * stack the ceremony originally found. Back then returns to the journey once,
   * which is what a person expects after following a link out of a dialog.
   */
  const leave = useCallback(
    (to: string) => {
      if (!pushedRef.current) {
        navigate(to);
        return;
      }
      pushedRef.current = false;
      navigate(-1);
      // After the pop has landed. Issued together, the router applies them in
      // one pass and the ceremony's entry survives underneath the destination.
      queueMicrotask(() => navigate(to));
    },
    [navigate],
  );

  // A claim that resolved somewhere else (another tab, or a publish that landed
  // after `in-flight` was reported) finishes the act here rather than leaving the
  // stage narrating a send that is already over.
  useEffect(() => {
    if (phase !== 'acting' || !claimSubmitted) return;
    if (submittingRef.current) return;
    setPhase('revealing');
  }, [phase, claimSubmitted]);

  // The choreography's own clock. Nothing waits on it: `revealedAt` is already
  // persisted, so this only decides when the composition stops moving.
  useEffect(() => {
    if (phase !== 'revealing') return;
    const timer = setTimeout(() => setPhase('settled'), CEREMONY_REVEAL_MS);
    return () => clearTimeout(timer);
  }, [phase]);

  // Back (or any navigation that drops the marker) closes immediately. This is
  // also the tail of the deliberate close path, via `navigate(-1)`.
  useEffect(() => {
    if (phaseRef.current === 'closed') return;
    if (hasCeremonyEntry(location.state)) return;
    pushedRef.current = false;
    setPhase('closed');
  }, [location]);

  // Put focus back on the control that opened the ceremony.
  //
  // Radix does this itself when its content unmounts — but the ceremony's close
  // is deliberately deferred by the return animation, so by the time the dialog
  // actually unmounts the restore no longer lands and focus falls to `<body>`.
  // That leaves a keyboard user at the top of the page instead of where they
  // were. The focus *trap* is still entirely Radix's; this only puts the caret
  // back afterwards.
  useEffect(() => {
    if (phase !== 'closed') return;
    setSlow(false);
    setFailures(0);
    setSkipped(false);
    const trigger = triggerRef.current;
    triggerRef.current = null;
    if (trigger && trigger.isConnected) trigger.focus();
  }, [phase]);

  // An unmount mid-ceremony must not leave the marker entry behind.
  //
  // Dropping ownership was not enough: the entry stayed on the stack, so a user
  // whose panel unmounted with the stage open (an account switch, a parent
  // re-render that drops the reward, a route change) was left with a Back press
  // that appeared to do nothing — it popped an entry for a ceremony that no
  // longer existed, at a URL identical to the one they were already on.
  //
  // Popping it is safe *only* when it is still the entry we are standing on. If
  // the unmount was itself caused by navigating somewhere else, the router has
  // already moved past our entry and a `navigate(-1)` here would drag the user
  // backwards out of the page they just asked for. The location ref is read at
  // cleanup time precisely so that distinction is made on current facts.
  const locationRef = useRef(location);
  locationRef.current = location;
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;

  useEffect(
    () => () => {
      if (!pushedRef.current) return;
      pushedRef.current = false;
      if (!hasCeremonyEntry(locationRef.current.state)) return;
      // Out of the commit phase: navigating synchronously during unmount makes
      // React update a tree it is in the middle of tearing down.
      const go = navigateRef.current;
      queueMicrotask(() => go(-1));
    },
    [],
  );

  return {
    phase,
    /** The claim is slow enough to be worth explaining. Acting only. */
    slow,
    /** Consecutive failures in this ceremony. Copy only; never a lockout. */
    failures,
    /** Whether the reveal was skipped, so it should apply without easing. */
    skipped,
    /** Jump to the settled reveal. Never undoes anything. */
    skipReveal,
    isOpen: phase !== 'closed',
    /** Submit the claim and narrate it. */
    reveal,
    /** Open from the element the user clicked, remembering where it was. */
    open,
    /** Escape, backdrop, Close, or the dev harness. */
    requestClose,
    settle,
    finishClose,
    /** Go somewhere else, handing the ceremony's history entry back on the way. */
    leave,
    /** The reward's on-screen box at the moment it was clicked, if measurable. */
    sourceRect: sourceRectRef,
    /** The reward element, for re-measuring on the way back. */
    sourceElement: sourceRef,
    triggerElement: triggerRef,
  };
}

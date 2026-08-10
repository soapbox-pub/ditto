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
 * - `submitted` — the claim exists. The reward is still sealed.
 * - `failed`    — the publish did not go through. Retryable, forever.
 * - `closing`   — travelling back toward where it came from.
 *
 * There is still no `revealing` or `revealed` here. `submitted` is the honest
 * end of *this* ceremony: the claim is in, and the reward has not been shown to
 * anyone. The phases that open the seal belong to the reveal choreography, along
 * with the only thing that may write `revealedAt`.
 *
 * **None of this is persisted.** The only durable fact about a reveal is
 * `badgeClaim.revealedAt`, and nothing here writes it. Opening and closing the
 * ceremony leaves the mission exactly as it found it, which is what makes the
 * shell safe to open and close a hundred times while it is being built.
 */
export type RewardCeremonyPhase =
  | 'closed'
  | 'opening'
  | 'sealed'
  | 'acting'
  | 'submitted'
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
   * Deliberately does **not** pass `revealedAt`. That option exists so the
   * eventual reveal can record "claimed" and "revealed" in a single write, and
   * using it here would mark the reward revealed on the strength of a claim the
   * user has not been shown anything for. *Claim submitted* and *reward
   * revealed* stay two facts until there is a reveal to justify the second.
   */
  const reveal = useCallback(
    async (submit: () => Promise<BadgeClaimOutcome>) => {
      // The button is disabled while acting, but a keyboard repeat or a
      // programmatic double call must not start a second publish either.
      if (phaseRef.current !== 'sealed' && phaseRef.current !== 'failed') return;

      setPhase('acting');
      setSlow(false);
      const startedAt = Date.now();
      const slowTimer = setTimeout(() => setSlow(true), CEREMONY_SLOW_MS);

      let outcome: BadgeClaimOutcome;
      try {
        outcome = await submit();
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
        case 'already-claimed':
          // Both mean "the claim exists". `already-claimed` published nothing,
          // which is the correct outcome for a user who claimed before this
          // ceremony existed — it must not republish to catch up.
          setFailures(0);
          setPhase('submitted');
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

  // A claim that resolved somewhere else (another tab, or a publish that landed
  // after `in-flight` was reported) finishes the act here rather than leaving the
  // stage narrating a send that is already over.
  useEffect(() => {
    if (phase !== 'acting' || !claimSubmitted) return;
    setPhase('submitted');
  }, [phase, claimSubmitted]);

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
    isOpen: phase !== 'closed',
    /** Submit the claim and narrate it. */
    reveal,
    /** Open from the element the user clicked, remembering where it was. */
    open,
    /** Escape, backdrop, Close, or the dev harness. */
    requestClose,
    settle,
    finishClose,
    /** The reward's on-screen box at the moment it was clicked, if measurable. */
    sourceRect: sourceRectRef,
    /** The reward element, for re-measuring on the way back. */
    sourceElement: sourceRef,
    triggerElement: triggerRef,
  };
}

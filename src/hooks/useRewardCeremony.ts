import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { prefersReducedMotion } from '@/lib/reducedMotion';

/**
 * The ceremony's phases. Four, and deliberately no more.
 *
 * - `closed`  — nothing mounted.
 * - `opening` — the sealed reward is travelling from where the user clicked it.
 * - `sealed`  — settled and still, waiting for the user. Indefinite.
 * - `closing` — travelling back toward where it came from.
 *
 * There is no `claiming`, `revealing`, `settled` or `failed` here. Those belong
 * to the reveal, they each need persisted state to be meaningful, and inventing
 * them now would mean guessing at transitions before the thing that drives them
 * exists. This is the room and the entrance; the ceremony that happens inside it
 * is a later job.
 *
 * **None of this is persisted.** The only durable fact about a reveal is
 * `badgeClaim.revealedAt`, and nothing here writes it. Opening and closing the
 * ceremony leaves the mission exactly as it found it, which is what makes the
 * shell safe to open and close a hundred times while it is being built.
 */
export type RewardCeremonyPhase = 'closed' | 'opening' | 'sealed' | 'closing';

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
export function useRewardCeremony() {
  const [phase, setPhase] = useState<RewardCeremonyPhase>('closed');
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
      setPhase(options?.immediate || prefersReducedMotion() ? 'sealed' : 'opening');

      navigate(`${location.pathname}${location.search}`, {
        state: { ...(location.state as object | null), [CEREMONY_HISTORY_STATE]: true },
      });
      pushedRef.current = true;
    },
    [navigate, location.pathname, location.search, location.state],
  );

  /** The entrance finished (or could not run). Settle. */
  const settle = useCallback(() => {
    if (phaseRef.current === 'opening') setPhase('sealed');
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
    const trigger = triggerRef.current;
    triggerRef.current = null;
    if (trigger && trigger.isConnected) trigger.focus();
  }, [phase]);

  // An unmount mid-ceremony (a route change, an account switch) must not leave
  // a marker entry behind that a later Back would land on.
  useEffect(
    () => () => {
      pushedRef.current = false;
    },
    [],
  );

  return {
    phase,
    isOpen: phase !== 'closed',
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

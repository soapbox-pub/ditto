import { useCallback, useEffect, useRef, useState } from 'react';

import { missionDevArrivalEntry, missionDevForcesArrival } from '@/dev/missionHarness';
import { useAppContext } from '@/hooks/useAppContext';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import {
  consumeFirstArrival,
  isFirstArrivalPending,
  readFirstArrival,
} from '@/lib/firstArrival';
import { prefersReducedMotion } from '@/lib/reducedMotion';

/**
 * Phases of the one-time arrival transition.
 *
 * - `waiting`     — we have not yet resolved which account (if any) is active,
 *                   so we cannot know whether an arrival is owed. Bounded.
 * - `idle`        — nothing to play. The overlay renders nothing.
 * - `playing`     — the sequence is on screen (signal → welcome → Explorer card).
 * - `revealing`   — the backdrop dissolves and the real interface appears behind
 *                   the still-centred card.
 * - `travelling`  — the card flies to the persistent Explorer surface and hands
 *                   over. Skipped entirely under reduced motion or on skip.
 * - `done`        — finished or skipped; the intent has been consumed.
 */
export type ArrivalPhase =
  | 'waiting'
  | 'idle'
  | 'playing'
  | 'revealing'
  | 'travelling'
  | 'done';

/** How long we will wait for an account to resolve before giving up. */
const ACCOUNT_WAIT_MS = 5_000;

/**
 * Signal, welcome, welcome exit, then the Explorer presentation — see
 * `STAGE_TIMINGS` for the act boundaries inside this window. Lengthened from
 * 2600ms because the welcome previously held for only ~215ms before the card
 * arrived on top of it.
 */
const PLAY_MS = 2_700;
/**
 * The backdrop dissolves and the application appears behind the presentation.
 *
 * Shortened from 800ms, and the backdrop's own fade deliberately runs slightly
 * longer than this, so the travel begins while the last of the backdrop is
 * still clearing. Previously the app finished revealing and the card then sat
 * motionless for ~825ms — measured, and very visible.
 */
const REVEAL_MS = 700;
/**
 * Safety net for the travel stage. The FLIP runner normally ends it by calling
 * `completeTravel()`, but an animation that never resolves (a cancelled
 * `WebAnimation`, a browser quirk) must not strand the overlay on screen.
 */
const TRAVEL_TIMEOUT_MS = 2_500;

/** Reduced motion: a static welcome, held briefly, then an immediate hand-off. */
const REDUCED_PLAY_MS = 1_500;
const REDUCED_REVEAL_MS = 150;

export interface FirstArrivalExperience {
  phase: ArrivalPhase;
  /** True while the overlay should be mounted. */
  visible: boolean;
  /** True once the backdrop has started dissolving. */
  revealing: boolean;
  /** True while the card is flying to the persistent Explorer surface. */
  travelling: boolean;
  /** Whether the simplified, motion-free presentation is in use. */
  reducedMotion: boolean;
  /** Dismiss immediately; consumes the intent so it never replays. */
  skip: () => void;
  /** Called by the FLIP runner once the card has landed (or failed to). */
  completeTravel: () => void;
}

/**
 * Drives the one-time arrival transition shown immediately after signup.
 *
 * The whole design goal is determinism: one explicit phase at a time rather
 * than a handful of booleans, so refresh, skip, reduced motion, remount, route
 * change, delayed account resolution and a malformed marker all land in a
 * defined place.
 *
 * **The intent is consumed only once the experience has genuinely been
 * presented** — when the sequence reaches its reveal, or when the user skips.
 * Consuming earlier (say, on mount) would mean a reload one second into signup
 * silently eats the moment; consuming later would risk replaying it.
 *
 * It never waits on network data. The application loads normally underneath and
 * is revealed on a fixed schedule, so this can never mask a slow relay or hide
 * a genuine failure — worst case the user arrives to a feed of skeletons, which
 * is the honest state of the app at that instant.
 */
export function useFirstArrivalExperience(): FirstArrivalExperience {
  const { config } = useAppContext();
  const { user } = useCurrentUser();
  const pubkey = user?.pubkey;

  // Localhost-only: force the sequence so it can be inspected without a real
  // signup, optionally starting at a later beat. Undefined in every production
  // build. It drives presentation only — no marker is written or consumed, so it
  // cannot affect a real account.
  const devEntry = missionDevArrivalEntry();
  const forced = missionDevForcesArrival();

  const [phase, setPhase] = useState<ArrivalPhase>(
    devEntry === 'handoff' || devEntry === 'revealing'
      ? 'revealing'
      : forced
        ? 'playing'
        : 'waiting',
  );
  // A skip jumps straight to the hand-off: the user asked for the application,
  // so flying a card across it would be ignoring them.
  const skippedRef = useRef(false);
  // Latches the account this run belongs to, so switching accounts mid-session
  // can never let one account's arrival play for another.
  const playingForRef = useRef<string | undefined>(undefined);
  const reducedMotion = prefersReducedMotion();

  // Give up waiting for an account after a bounded interval. A logged-out
  // visitor would otherwise sit in `waiting` forever (harmless, but it would
  // make the state machine untestable and hide bugs).
  useEffect(() => {
    if (forced) return;
    if (phase !== 'waiting') return;
    const timer = setTimeout(() => setPhase('idle'), ACCOUNT_WAIT_MS);
    return () => clearTimeout(timer);
  }, [phase, forced]);

  // Decide, once we know the account, whether an arrival is owed.
  useEffect(() => {
    if (forced) return;
    if (!pubkey) return;
    // Already running (or finished) for this account — never restart.
    if (playingForRef.current === pubkey) return;

    playingForRef.current = pubkey;
    const intent = readFirstArrival(config.appId, pubkey);
    setPhase(isFirstArrivalPending(intent) ? 'playing' : 'idle');
  }, [pubkey, config.appId, forced]);

  // A different account became active: reset so the new account is evaluated
  // on its own terms rather than inheriting the previous one's phase.
  useEffect(() => {
    if (forced) return;
    if (!pubkey && playingForRef.current) {
      playingForRef.current = undefined;
      setPhase('idle');
    }
  }, [pubkey, forced]);

  const finish = useCallback(
    (from: 'played' | 'skipped') => {
      // Consumed here and only here: the experience has been presented.
      if (pubkey && !forced) consumeFirstArrival(config.appId, pubkey);
      setPhase('revealing');
      void from;
    },
    [config.appId, pubkey, forced],
  );

  // Act 1 + 2 → Act 3.
  useEffect(() => {
    if (phase !== 'playing') return;
    const timer = setTimeout(
      () => finish('played'),
      reducedMotion ? REDUCED_PLAY_MS : PLAY_MS,
    );
    return () => clearTimeout(timer);
  }, [phase, reducedMotion, finish]);

  // Backdrop dissolved → travel, unless motion is unwanted or unhelpful.
  //
  // Reduced motion crossfades instead of travelling, and a skip goes straight
  // to the application. Both still reach exactly the same end state.
  useEffect(() => {
    if (phase !== 'revealing') return;
    const timer = setTimeout(
      () => setPhase(reducedMotion || skippedRef.current ? 'done' : 'travelling'),
      reducedMotion ? REDUCED_REVEAL_MS : REVEAL_MS,
    );
    return () => clearTimeout(timer);
  }, [phase, reducedMotion]);

  // Travel is ended by the FLIP runner; this only catches an animation that
  // never reports back.
  useEffect(() => {
    if (phase !== 'travelling') return;
    const timer = setTimeout(() => setPhase('done'), TRAVEL_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [phase]);

  const completeTravel = useCallback(() => {
    setPhase((current) => (current === 'travelling' ? 'done' : current));
  }, []);

  const skip = useCallback(() => {
    if (phase !== 'playing' && phase !== 'revealing') return;
    skippedRef.current = true;
    if (phase === 'playing') finish('skipped');
    else setPhase('done');
  }, [phase, finish]);

  return {
    phase,
    visible: phase === 'playing' || phase === 'revealing' || phase === 'travelling',
    revealing: phase === 'revealing' || phase === 'travelling',
    travelling: phase === 'travelling',
    reducedMotion,
    skip,
    completeTravel,
  };
}

import { useCallback, useMemo, useRef, useSyncExternalStore } from 'react';

import {
  missionDevRejectsWrites,
  readMissionDevState,
  subscribeMissionDev,
  writeMissionDevState,
} from '@/dev/missionHarness';
import { useEncryptedSettings } from '@/hooks/useEncryptedSettings';
import {
  type AutoWriteName,
  claimAutoWrite,
  releaseAutoWrite,
  resetAutoWrites,
  settleAutoWrite,
} from '@/lib/missionAutoWrites';
import type { PostInteractionKind } from '@/lib/postInteraction';
import {
  type MissionBaselines,
  type PostOnboardingGuideState,
  type PostOnboardingPathId,
  areAllPathsCompleted,
  badgeRewardView,
  canShowMissionDetail,
  countCompletedPaths,
  createInitialGuideState,
  introState,
  isClaimInFlight,
  isIntroOutstanding,
  nextRecommendedPath,
  normalizeGuideState,
  POST_ONBOARDING_PATH_IDS,
} from '@/lib/postOnboardingGuide';

/**
 * Read and mutate the post-onboarding first-session mission state.
 *
 * State lives in the user's private, cross-device encrypted settings (NIP-78
 * kind 30078) keyed by pubkey. This hook is the **only** place mission state
 * transitions happen; view components read from it and never write their own
 * shape. Completion *policy* (when a task is actually done) lives in
 * `useMissionEngine`, which calls the setters here.
 *
 * The mission is signup-independent: it is created for any authenticated user
 * whose signer can encrypt (see `useMissionEngine`), and nothing about it
 * depends on how the account came to exist.
 *
 * **Concurrency.** Every setter is idempotent and progress-preserving: it
 * spreads the current state and only ever moves a task forward, so a repeated
 * call (a remount, a double-tap, a second detection pass) is a no-op. Within a
 * tab, writes compose through a ref that tracks the freshest state. Across
 * tabs, `useEncryptedSettings` re-reads the newest settings event before
 * merging, so a concurrent write loses at most the other tab's last few
 * seconds — and because completion is re-derived from real product state on
 * every pass, a lost completion simply gets re-detected and re-written.
 *
 * **Account isolation.** Every in-memory snapshot this hook keeps belongs to
 * exactly one pubkey (see `latestOwnerRef`). Switching accounts discards it
 * rather than carrying it forward, so one account's progress can never become
 * the base of another account's write, and the new account is free to
 * initialize immediately rather than waiting for a page reload.
 */
export function usePostOnboardingGuide() {
  const { settings, updateSettings, isLoading, pubkey } = useEncryptedSettings();

  // `useMutation` returns a **new object on every render**. Reading it through a
  // ref keeps it out of the callback dependency lists below, which is what makes
  // every setter identity-stable for the lifetime of the hook.
  //
  // This is not a micro-optimisation. While these setters changed identity each
  // render, any `useEffect` keyed on one re-ran on every render — and a failing
  // write re-rendered by itself, because the mutation's own pending -> error
  // transition is a state change. That closed a loop that reached ~4,650 write
  // attempts per second.
  const mutateRef = useRef(updateSettings.mutateAsync);
  mutateRef.current = updateSettings.mutateAsync;
  const pubkeyRef = useRef(pubkey);
  pubkeyRef.current = pubkey;

  // Localhost-only inspection state. `readMissionDevState()` returns undefined
  // in every production build and on every non-localhost host, so this collapses
  // to the real state path. When active it substitutes the state for reading and
  // absorbs writes into a shared store — nothing is published, and no policy is
  // bypassed. Shared (rather than per-hook) so every mission surface sees a
  // transition at once, exactly as they would through the real query cache.
  const devState = useSyncExternalStore(subscribeMissionDev, readMissionDevState);
  const devStateRef = useRef(devState);
  devStateRef.current = devState;

  // Normalized on read so a state persisted before the fourth task changed
  // presents in the current shape everywhere at once (see `normalizeGuideState`).
  // Memoized because a fresh object identity on every render is exactly what
  // re-armed the effects behind the mission write loop; the normalization is
  // pure, so memoizing on the raw state is sound.
  const rawState = devState ?? settings?.postOnboardingGuide;
  const state = useMemo(() => normalizeGuideState(rawState), [rawState]);

  // Tracks the freshest state we've written this session so rapid successive
  // transitions in the same tab compose instead of clobbering each other (the
  // settings cache update lands a tick later than a synchronous second call).
  const latestRef = useRef<PostOnboardingGuideState | undefined>(undefined);
  /** Whether the write that just ran rejected. Read by `updateOnce`. */
  const failedRef = useRef(false);
  // `latestRef` belongs to exactly one account, and this is who. Without it, an
  // account switch left the previous account's mission in the ref: the new
  // account's `state` is `undefined`, so the "only seed from a truthy state"
  // rule below never overwrote it. That had two consequences — `initializeGuide`
  // saw a non-empty ref and refused to create a mission for the new account
  // (until a full page reload), and any later transition would have reduced
  // from the *previous* account's state and written the result into the new
  // account's encrypted settings.
  const latestOwnerRef = useRef<string | undefined>(pubkey);

  if (latestOwnerRef.current !== pubkey) {
    // A different account is active. The previous account's snapshot is not a
    // usable base for anything, and must not survive as a fallback: adopt the
    // new account's state, which is `undefined` while its settings load and
    // when it genuinely has no mission. The pubkey-scoped auto-write guards in
    // `missionAutoWrites` are unaffected — they were already keyed by account.
    latestOwnerRef.current = pubkey;
    latestRef.current = state;
    failedRef.current = false;
  } else if (state && latestRef.current?.updatedAt !== state.updatedAt) {
    // Same account. Only ever seeded from a truthy state, so an ordinary
    // settings refetch (which briefly reports no settings) can't discard a
    // snapshot we are mid-way through composing onto.
    latestRef.current = state;
  }

  /**
   * Apply a pure transition to the freshest known mission state and persist it.
   * Returning `null` from the reducer means "nothing to do" and skips the write
   * entirely — that's what makes every setter below idempotent.
   */
  const update = useCallback(
    (
      reduce: (current: PostOnboardingGuideState) => PostOnboardingGuideState | null,
    ): Promise<void> => {
      // Harness: apply locally so the surfaces are genuinely interactive to
      // inspect, without a relay write.
      if (devStateRef.current) {
        // Persistence-failure scenario: compute the transition, then throw it
        // away exactly as a rejected relay write would. Detection stays true,
        // so this is precisely the shape a write loop would emerge from.
        if (missionDevRejectsWrites()) {
          console.error('Mission harness: simulated persistence failure');
          return Promise.resolve();
        }
        const devNext = reduce(devStateRef.current);
        if (devNext) writeMissionDevState(devNext);
        return Promise.resolve();
      }
      const current = latestRef.current;
      if (!current) return Promise.resolve();
      const next = reduce(current);
      if (!next) return Promise.resolve();
      // Whose write this is. An account switch can land while it is in flight,
      // and a rollback that ignored that would put the previous account's state
      // straight back into a ref the switch had just cleared.
      const owner = latestOwnerRef.current;
      latestRef.current = next;
      return mutateRef
        .current({ postOnboardingGuide: next })
        .then(() => undefined)
        .catch((error) => {
          // Roll the local snapshot back so a failed write doesn't make later
          // transitions build on state that was never persisted — but only
          // while this hook still belongs to the account the write was for.
          if (latestOwnerRef.current === owner) {
            latestRef.current = current;
            failedRef.current = true;
          }
          console.error('Failed to persist mission state:', error);
        });
    },
    [],
  );

  /**
   * Run an **automatic** write — one no user asked for — at most once per
   * account per session.
   *
   * See `missionAutoWrites`: the guard is module-level because several surfaces
   * mount this hook simultaneously, so a per-hook flag cannot answer "has this
   * already been attempted anywhere". A failure is recorded and never retried;
   * the loop this replaces is not worth an informational field.
   *
   * The timestamp is minted **inside the claim**, so even if a retry were ever
   * added it would reproduce the identical state rather than a state that only
   * differs by `Date.now()` — which is precisely what defeated every equality
   * check during the incident.
   */
  const updateOnce = useCallback(
    (
      name: AutoWriteName,
      reduce: (current: PostOnboardingGuideState) => PostOnboardingGuideState | null,
    ): Promise<void> => {
      // The harness owns its own state and never persists, so it is exempt.
      if (devStateRef.current) return update(reduce);

      const key = pubkeyRef.current;
      if (!claimAutoWrite(key, name)) return Promise.resolve();

      // Read only for *this* write; a user action that failed earlier must not
      // be mistaken for this one failing.
      failedRef.current = false;
      let attempted = false;
      const result = update((current) => {
        const next = reduce(current);
        attempted = next !== null;
        return next;
      });

      // The reducer decided there was nothing to do, so nothing was written and
      // nothing should be consumed: a genuinely new situation may try later.
      if (!attempted) {
        releaseAutoWrite(key, name);
        return result;
      }

      // `update` swallows its own rejection, so success is read from the local
      // snapshot having survived rather than from a thrown error.
      return result.then(() => {
        settleAutoWrite(key, name, latestRef.current !== undefined && !failedRef.current);
        failedRef.current = false;
      });
    },
    [update],
  );

  /**
   * Create the mission for a user who doesn't have one yet. Idempotent: a no-op
   * if any state already exists, so it can never clobber prior progress, a
   * dismissal, or a published badge claim.
   *
   * Called only by `useMissionEngine`, which owns the "is it safe to
   * initialize" checks (logged in, pubkey known, settings loaded, signer can
   * encrypt).
   */
  const initializeGuide = useCallback((): Promise<void> => {
    if (devStateRef.current) return Promise.resolve(); // harness owns the state
    if (latestRef.current) return Promise.resolve();

    // Guarded exactly like `markIntroPresented`, and for the same reason: the
    // engine's initialization effect also depends on this callback, and while a
    // failing write left `latestRef` empty, "no mission yet" stayed true
    // forever — so the effect kept firing. One attempt per account per session;
    // a failure is picked up on the next load rather than hammered.
    const key = pubkeyRef.current;
    if (!claimAutoWrite(key, 'initializeGuide')) return Promise.resolve();

    const owner = latestOwnerRef.current;
    const fresh = createInitialGuideState();
    latestRef.current = fresh;
    return mutateRef
      .current({ postOnboardingGuide: fresh })
      .then(() => {
        settleAutoWrite(key, 'initializeGuide', true);
        return undefined;
      })
      .catch((error) => {
        // Same rule as `update`: only clear a snapshot that is still ours.
        if (latestOwnerRef.current === owner) latestRef.current = undefined;
        settleAutoWrite(key, 'initializeGuide', false);
        console.error('Failed to initialize mission state:', error);
      });
  }, []);

  /** Record which task the user most recently launched (informational only). */
  const startPath = useCallback(
    (pathId: PostOnboardingPathId) =>
      update((current) => {
        if (current.status !== 'active') return null;
        if (current.activePath === pathId && current.paths[pathId] !== 'not_started') {
          return null;
        }
        return {
          ...current,
          activePath: pathId,
          paths: {
            ...current.paths,
            [pathId]: current.paths[pathId] === 'completed' ? 'completed' : 'active',
          },
          updatedAt: Date.now(),
        };
      }),
    [update],
  );

  /**
   * Mark a task completed. When the final task completes, the whole mission
   * transitions to `completed` in the same write, so the celebration fires
   * exactly once. Idempotent — completing an already-completed task is a no-op.
   */
  const completePath = useCallback(
    (pathId: PostOnboardingPathId) =>
      update((current) => {
        if (current.status !== 'active') return null;
        if (current.paths[pathId] === 'completed') return null;
        const now = Date.now();
        const paths = { ...current.paths, [pathId]: 'completed' as const };
        const allDone = POST_ONBOARDING_PATH_IDS.every((id) => paths[id] === 'completed');
        return {
          ...current,
          paths,
          status: allDone ? 'completed' : 'active',
          completedAt: allDone ? now : current.completedAt,
          updatedAt: now,
        };
      }),
    [update],
  );

  /**
   * Complete the `interact` task and record *which* action did it, in one
   * write.
   *
   * One write rather than "complete the path, then record the action" because
   * the surfaces derive their success copy from the recorded action the instant
   * the count changes — a two-step write would flash a generic celebration
   * before the message arrived, and a failure between the two would leave a
   * completed task whose feedback could never be reconstructed.
   *
   * Idempotent in the strong sense the mission needs: once the task is
   * completed, a later interaction returns `null` and writes nothing, so the
   * recorded action stays the one that actually earned it and the completion
   * animation cannot replay.
   */
  const completeInteractPath = useCallback(
    (action: PostInteractionKind, targetEventId?: string) =>
      update((current) => {
        if (current.status !== 'active') return null;
        if (current.paths.interact === 'completed') return null;

        const now = Date.now();
        const paths = { ...current.paths, interact: 'completed' as const };
        const allDone = POST_ONBOARDING_PATH_IDS.every((id) => paths[id] === 'completed');
        return {
          ...current,
          paths,
          interact: { action, targetEventId, completedAt: now },
          status: allDone ? 'completed' : 'active',
          completedAt: allDone ? now : current.completedAt,
          updatedAt: now,
        };
      }),
    [update],
  );

  /**
   * Record customize substep progress. `customize` is one task with two
   * internal steps; it completes only once both land, in a single atomic write
   * so the celebration fires once.
   */
  const completeCustomizeStep = useCallback(
    (step: 'profile' | 'theme') =>
      update((current) => {
        if (current.status !== 'active') return null;
        const key = step === 'profile' ? 'profileCompleted' : 'themeCompleted';
        if (current.customize?.[key] === true) return null;

        const now = Date.now();
        const customize = { ...current.customize, [key]: true };
        const bothDone =
          customize.profileCompleted === true && customize.themeCompleted === true;

        const paths = {
          ...current.paths,
          customize:
            bothDone || current.paths.customize === 'completed'
              ? ('completed' as const)
              : ('active' as const),
        };
        const allDone = POST_ONBOARDING_PATH_IDS.every((id) => paths[id] === 'completed');

        return {
          ...current,
          paths,
          customize,
          status: allDone ? 'completed' : 'active',
          completedAt: allDone ? now : current.completedAt,
          updatedAt: now,
        };
      }),
    [update],
  );

  /**
   * Record a real-product-state baseline the first time it's observed. Never
   * overwrites an existing baseline — the goalposts must not move on a remount,
   * a refresh, or a second device.
   */
  const recordBaseline = useCallback(
    (baseline: MissionBaselines) =>
      update((current) => {
        const entries = Object.entries(baseline).filter(
          ([key, value]) =>
            value !== undefined &&
            current.baselines?.[key as keyof MissionBaselines] === undefined,
        );
        if (entries.length === 0) return null;
        return {
          ...current,
          baselines: { ...current.baselines, ...Object.fromEntries(entries) },
          updatedAt: Date.now(),
        };
      }),
    [update],
  );

  /**
   * Record that the introduction has been shown. Purely informational — it does
   * not change what the user is offered — so it never advances the intro state.
   */
  const markIntroPresented = useCallback(() => {
    // One timestamp for the whole attempt. Minting it per render is what made
    // every attempt look like a brand-new state during the incident.
    const now = Date.now();
    return updateOnce('markIntroPresented', (current) => {
        if (!current.intro || current.intro.presentedAt) return null;
      return {
        ...current,
        intro: { ...current.intro, presentedAt: now },
        updatedAt: now,
      };
    });
  }, [updateOnce]);

  /**
   * "Start exploring" — the user accepted the introduction. Terminal for the
   * intro; the full mission detail becomes available from here on.
   */
  const acknowledgeIntro = useCallback(
    () =>
      update((current) => {
        if (current.intro?.acknowledgedAt) return null;
        const now = Date.now();
        return {
          ...current,
          intro: { ...current.intro, acknowledgedAt: now, postponedAt: undefined },
          updatedAt: now,
        };
      }),
    [update],
  );

  /**
   * "Maybe later" — postpones the *introduction only*.
   *
   * Emphatically not a skip: the mission stays `active`, all progress and
   * detection keep running, `/missions` still offers the introduction, and the
   * compact surface stays available (just quiet). Conflating this with
   * dismissing the mission is precisely the mistake this replaces.
   */
  const postponeIntro = useCallback(
    () =>
      update((current) => {
        if (!current.intro || current.intro.acknowledgedAt) return null;
        if (current.intro.postponedAt) return null;
        const now = Date.now();
        return {
          ...current,
          intro: { ...current.intro, postponedAt: now },
          updatedAt: now,
        };
      }),
    [update],
  );

  /**
   * Hide the mission's promotional surfaces. Preserves prior progress,
   * `completedAt`, and any `badgeClaim` — hiding must never undo a published
   * claim. Reversible via {@link resumeGuide}.
   */
  const dismissGuide = useCallback(
    () =>
      update((current) => {
        if (current.status === 'skipped') return null;
        const now = Date.now();
        return { ...current, status: 'skipped', skippedAt: now, updatedAt: now };
      }),
    [update],
  );

  /**
   * Un-hide a hidden mission and put it back in play.
   *
   * Previously hiding was terminal in production while the UI promised the
   * mission could be picked back up from `/missions` — a promise the code
   * broke. This is that promise, implemented. A mission whose tasks were all
   * finished before it was hidden returns to `completed` (so the reward is
   * reachable again) rather than to `active`.
   */
  const resumeGuide = useCallback(
    () =>
      update((current) => {
        if (current.status !== 'skipped') return null;
        const now = Date.now();
        return {
          ...current,
          status: areAllPathsCompleted(current) ? 'completed' : 'active',
          skippedAt: undefined,
          updatedAt: now,
        };
      }),
    [update],
  );

  /**
   * Latch the badge claim to in-flight. Only valid when the mission is fully
   * completed and the badge isn't already claimed or *actively* claiming — a
   * stale `claiming` (the app died mid-claim) is retryable, so a crash can never
   * lock the user out. Resolves `false` when the transition isn't allowed, so
   * the caller knows not to publish.
   */
  const beginBadgeClaim = useCallback((): Promise<boolean> => {
    const current = latestRef.current;
    if (!current) return Promise.resolve(false);
    if (current.status !== 'completed') return Promise.resolve(false);
    if (current.badgeClaim?.status === 'claimed') return Promise.resolve(false);
    if (isClaimInFlight(current.badgeClaim)) return Promise.resolve(false);

    const now = Date.now();
    return update((state) => ({
      ...state,
      badgeClaim: { badge: 'ditto-explorer', status: 'claiming', claimingStartedAt: now },
      updatedAt: now,
    })).then(() => true);
  }, [update]);

  /** Record a successfully-published claim event. Never re-publishes. */
  const completeBadgeClaim = useCallback(
    (claimEventId: string) =>
      update((current) => {
        if (current.badgeClaim?.status === 'claimed') return null;
        const now = Date.now();
        return {
          ...current,
          badgeClaim: {
            badge: 'ditto-explorer',
            status: 'claimed',
            claimEventId,
            claimedAt: now,
          },
          updatedAt: now,
        };
      }),
    [update],
  );

  /**
   * Record a failed claim so the UI can show "that didn't go through" and offer
   * a retry — deliberately distinct from `unclaimed`, which reads as "never
   * tried". Never clobbers a successful claim.
   */
  const failBadgeClaim = useCallback(
    () =>
      update((current) => {
        if (current.badgeClaim?.status === 'claimed') return null;
        const now = Date.now();
        return {
          ...current,
          badgeClaim: { badge: 'ditto-explorer', status: 'failed', failedAt: now },
          updatedAt: now,
        };
      }),
    [update],
  );

  /**
   * DEV-ONLY: reset the mission to a fresh, active state for the current
   * account — including clearing any `badgeClaim` and baselines — so the whole
   * flow can be re-run without creating a new account. Gated behind
   * `import.meta.env.DEV`, which is statically false in production builds, so
   * the branch is dropped by the bundler and can never reach end users. It only
   * touches the `postOnboardingGuide` key; every other setting is untouched.
   */
  const resetGuideDev = useCallback((): Promise<void> => {
    if (!import.meta.env.DEV) return Promise.resolve();
    if (devStateRef.current) {
      writeMissionDevState(createInitialGuideState());
      return Promise.resolve();
    }
    const fresh = createInitialGuideState();
    latestRef.current = fresh;
    // A deliberate developer action: clear the session guards so the automatic
    // writes can run again against the fresh state.
    resetAutoWrites();
    return mutateRef
      .current({ postOnboardingGuide: fresh })
      .then(() => undefined)
      .catch((error) => {
        console.error('Failed to reset mission state:', error);
      });
  }, []);

  const completedCount = useMemo(
    () => (state ? countCompletedPaths(state) : 0),
    [state],
  );

  return {
    /** The current mission state, or `undefined` if never created. */
    state,
    isLoading,
    /** Whether the mission is armed and still in progress. */
    isActive: state?.status === 'active',
    /** Whether every task is done (badge-claim phase, not yet dismissed). */
    isCompleted: state?.status === 'completed',
    /** Whether the user dismissed the mission. */
    isDismissed: state?.status === 'skipped',
    completedCount,
    totalCount: POST_ONBOARDING_PATH_IDS.length,
    allCompleted: state ? areAllPathsCompleted(state) : false,
    /** The reward state as the UI should present it. */
    rewardView: badgeRewardView(state),
    /** Raw badge claim record from encrypted settings. */
    badgeClaim: state?.badgeClaim,
    /** How the introduction should be treated: none/pending/postponed/acknowledged. */
    introState: introState(state),
    /** Whether the introduction is still owed a presentation. */
    introOutstanding: isIntroOutstanding(state),
    /** Whether task rows / reward detail may be shown yet. */
    canShowDetail: canShowMissionDetail(state),
    /** The task compact surfaces should recommend next. */
    nextPath: nextRecommendedPath(state),
    /** What completed the `interact` task, once it has. */
    interaction: state?.interact,
    initializeGuide,
    startPath,
    completePath,
    completeInteractPath,
    completeCustomizeStep,
    recordBaseline,
    markIntroPresented,
    acknowledgeIntro,
    postponeIntro,
    dismissGuide,
    resumeGuide,
    beginBadgeClaim,
    completeBadgeClaim,
    failBadgeClaim,
    /** DEV-only: reset the mission to a fresh active state (no-op in prod). */
    resetGuideDev,
  };
}

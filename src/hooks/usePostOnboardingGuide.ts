import { useCallback, useMemo, useRef } from 'react';

import { useEncryptedSettings } from '@/hooks/useEncryptedSettings';
import {
  type MissionBaselines,
  type PostOnboardingGuideState,
  type PostOnboardingPathId,
  areAllPathsCompleted,
  badgeRewardView,
  countCompletedPaths,
  createInitialGuideState,
  isClaimInFlight,
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
 */
export function usePostOnboardingGuide() {
  const { settings, updateSettings, isLoading } = useEncryptedSettings();

  const state = settings?.postOnboardingGuide;

  // Tracks the freshest state we've written this session so rapid successive
  // transitions in the same tab compose instead of clobbering each other (the
  // settings cache update lands a tick later than a synchronous second call).
  const latestRef = useRef<PostOnboardingGuideState | undefined>(undefined);
  if (state && latestRef.current?.updatedAt !== state.updatedAt) {
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
      const current = latestRef.current;
      if (!current) return Promise.resolve();
      const next = reduce(current);
      if (!next) return Promise.resolve();
      latestRef.current = next;
      return updateSettings
        .mutateAsync({ postOnboardingGuide: next })
        .then(() => undefined)
        .catch((error) => {
          // Roll the local snapshot back so a failed write doesn't make later
          // transitions build on state that was never persisted.
          latestRef.current = current;
          console.error('Failed to persist mission state:', error);
        });
    },
    [updateSettings],
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
    if (latestRef.current) return Promise.resolve();
    const fresh = createInitialGuideState();
    latestRef.current = fresh;
    return updateSettings
      .mutateAsync({ postOnboardingGuide: fresh })
      .then(() => undefined)
      .catch((error) => {
        latestRef.current = undefined;
        console.error('Failed to initialize mission state:', error);
      });
  }, [updateSettings]);

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
   * Dismiss the mission. Before completion this is the explicit "I'll explore
   * on my own"; after completion it dismisses the celebratory/claimed card.
   * Either way it preserves prior progress, `completedAt`, and any `badgeClaim`
   * — dismissing must never undo a published claim. The `/missions` page stays
   * reachable, so this is "hide the prompts", not "delete the mission".
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
    const fresh = createInitialGuideState();
    latestRef.current = fresh;
    return updateSettings
      .mutateAsync({ postOnboardingGuide: fresh })
      .then(() => undefined)
      .catch((error) => {
        console.error('Failed to reset mission state:', error);
      });
  }, [updateSettings]);

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
    initializeGuide,
    startPath,
    completePath,
    completeCustomizeStep,
    recordBaseline,
    dismissGuide,
    beginBadgeClaim,
    completeBadgeClaim,
    failBadgeClaim,
    /** DEV-only: reset the mission to a fresh active state (no-op in prod). */
    resetGuideDev,
  };
}

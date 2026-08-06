import { useEffect, useSyncExternalStore } from 'react';
import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';

import { armMissionDevInteraction } from '@/dev/missionHarness';
import { useAppContext } from '@/hooks/useAppContext';
import { useAuthor } from '@/hooks/useAuthor';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useEncryptedSettings } from '@/hooks/useEncryptedSettings';
import { useFollowList } from '@/hooks/useFollowActions';
import { usePostOnboardingGuide } from '@/hooks/usePostOnboardingGuide';
import {
  readPostInteractions,
  subscribePostInteractions,
} from '@/lib/postInteraction';
import {
  isProfileTaskSatisfied,
  isQualifyingStarterPost,
  PUBLISH_CLOCK_SKEW_MS,
  themeSignature,
} from '@/lib/postOnboardingGuide';

/**
 * The mission engine: the single owner of mission *policy*.
 *
 * Mounted exactly once (by `MissionEngine` in `MainLayout`), it does two jobs
 * that must never be duplicated across surfaces:
 *
 *  1. **Initialization** — creates the mission for an authenticated user who
 *     doesn't have one, and only once every precondition holds.
 *  2. **Completion detection** — decides when a task is genuinely done by
 *     observing real product state, then latches that into persistence.
 *
 * View components (`MissionsWidget`, `MobileMissionTeaser`, `/missions`) are
 * pure readers. They never initialize and never decide completion, which is why
 * several of them can render at once without racing.
 *
 * ### Why state detection rather than click tracking
 *
 * "The user tapped the button, therefore the task is done" is wrong in every
 * interesting case: they bounce off the page, the publish fails, they change
 * their mind. Every task whose outcome is observable is therefore derived from
 * the product state it's actually about, which also makes completion
 * self-healing — a write lost to a concurrent tab is simply re-detected.
 *
 * | Task           | Completed when                                                  |
 * |----------------|-----------------------------------------------------------------|
 * | `find-people`  | the kind-3 follow list grew past its baseline                    |
 * | `post-small`   | a qualifying root kind-1 note exists, authored since mission start |
 * | `customize`    | profile republished with real fields **and** theme changed       |
 * | `interact`     | a reaction/reply/repost/bookmark on someone else's post landed   |
 *
 * Every rule is about something the user *did*, and none of them is "the user
 * arrived at a URL". The retired fourth task was the exception — it completed
 * on reaching `/trends` — and replacing it removed the only visit-based rule
 * in the system.
 */
export function useMissionEngine(): void {
  const { user } = useCurrentUser();
  const { config } = useAppContext();
  const { isLoading: settingsLoading, hasNip44Support } = useEncryptedSettings();
  const {
    state,
    isActive,
    initializeGuide,
    completePath,
    completeInteractPath,
    completeCustomizeStep,
    recordBaseline,
  } = usePostOnboardingGuide();

  const pubkey = user?.pubkey;

  // ── 1. Initialization ─────────────────────────────────────────────────────
  //
  // Deliberately gated so the mission can never be created against the wrong
  // (or no) identity: we need a resolved pubkey, settings that have finished
  // loading (otherwise "no mission" is indistinguishable from "not loaded
  // yet"), and a signer that can encrypt. `initializeGuide` is itself
  // idempotent, so even a double-invoke writes once.
  useEffect(() => {
    if (!pubkey) return;
    if (settingsLoading) return;
    if (!hasNip44Support) return;
    if (state) return;
    void initializeGuide();
  }, [pubkey, settingsLoading, hasNip44Support, state, initializeGuide]);

  const startedAt = state?.startedAt ?? 0;
  const detectionEnabled = !!pubkey && isActive;

  // ── 2a. find-people — the follow list grew ────────────────────────────────
  const { data: followList } = useFollowList();
  const followCount = followList?.pubkeys.length;
  const followBaseline = state?.baselines?.follows;

  useEffect(() => {
    if (!detectionEnabled) return;
    if (followCount === undefined) return; // follow list hasn't resolved yet
    if (followBaseline === undefined) {
      // First observation: this is where the user started from.
      void recordBaseline({ follows: followCount });
      return;
    }
    if (state?.paths['find-people'] === 'completed') return;
    if (followCount > followBaseline) {
      void completePath('find-people');
    }
  }, [detectionEnabled, followCount, followBaseline, state, recordBaseline, completePath]);

  // ── 2b. post-small — a qualifying note was published ──────────────────────
  //
  // Queried rather than inferred from a callback so completion survives a
  // refresh, a crash mid-toast, or publishing from another device. The composer
  // callback in `Index` is only a fast path on top of this.
  const { nostr } = useNostr();
  const postSmallDone = state?.paths['post-small'] === 'completed';

  const { data: hasStarterPost } = useQuery({
    queryKey: ['mission-starter-post', pubkey ?? '', startedAt],
    queryFn: async ({ signal }) => {
      if (!pubkey) return false;
      const events = await nostr.query(
        [{
          kinds: [1],
          authors: [pubkey],
          since: Math.floor((startedAt - PUBLISH_CLOCK_SKEW_MS) / 1000),
          limit: 20,
        }],
        { signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]) },
      );
      return events.some((event) => isQualifyingStarterPost(event, pubkey, startedAt));
    },
    enabled: detectionEnabled && !postSmallDone && startedAt > 0,
    // The composer's own success callback covers the immediate case, so this
    // only needs to catch up on load / after a refetch.
    staleTime: 60_000,
  });

  useEffect(() => {
    if (!detectionEnabled || postSmallDone) return;
    if (hasStarterPost) void completePath('post-small');
  }, [detectionEnabled, postSmallDone, hasStarterPost, completePath]);

  // ── 2c. customize (step 1) — the profile was filled in ────────────────────
  //
  // Requires the kind-0 to have been (re)published since the mission started,
  // so a pre-existing profile doesn't silently tick the box on day one: the
  // task asks the user to do something, not to already have done it.
  const author = useAuthor(pubkey);
  const profileDone = state?.customize?.profileCompleted === true;

  useEffect(() => {
    if (!detectionEnabled || profileDone) return;
    if (isProfileTaskSatisfied(author.data?.event, author.data?.metadata, startedAt)) {
      void completeCustomizeStep('profile');
    }
  }, [detectionEnabled, profileDone, author.data, startedAt, completeCustomizeStep]);

  // ── 2d. customize (step 2) — the theme changed ────────────────────────────
  //
  // "Picked a theme" is only meaningful relative to where the user started, so
  // the signature at mission start is the baseline and any later difference —
  // a built-in switch, a preset, an edited custom palette — completes the step.
  const currentThemeSignature = themeSignature(config.theme, config.customTheme);
  const themeBaseline = state?.baselines?.theme;
  const themeDone = state?.customize?.themeCompleted === true;

  useEffect(() => {
    if (!detectionEnabled) return;
    if (themeBaseline === undefined) {
      void recordBaseline({ theme: currentThemeSignature });
      return;
    }
    if (themeDone) return;
    if (currentThemeSignature !== themeBaseline) {
      void completeCustomizeStep('theme');
    }
  }, [
    detectionEnabled,
    themeBaseline,
    themeDone,
    currentThemeSignature,
    recordBaseline,
    completeCustomizeStep,
  ]);

  // ── 2e. interact — a real interaction with someone else's post landed ──────
  //
  // Read from the shared `postInteraction` signal, which each action's domain
  // layer reports to on success. The engine therefore knows nothing about feed
  // cards, buttons, routes, DOM events, or toast text: the same reaction counts
  // whether it came from Home, a thread, a profile feed, or search, and a
  // button that was merely *clicked* produces nothing to react to.
  //
  // Three rules turn a signal into a completion, and all three are here rather
  // than in the signal, because they are mission policy:
  //
  //  1. **It was this user.** A signal from another account (a fast account
  //     switch mid-publish) is not this mission's progress.
  //  2. **It was someone else's post.** Reacting to, replying to, reposting or
  //     bookmarking your own post is not engaging with another person, so the
  //     target author is compared against the active pubkey. For replies and
  //     reposts that comparison is against the *target's* author, resolved from
  //     the reply/repost tags — never against the author of the event the
  //     action just published, which is always the user.
  //  3. **It happened during the mission.** Signals only exist for interactions
  //     performed live in this session, but the timestamp is checked anyway so
  //     the rule doesn't quietly depend on that.
  //
  // Completion is idempotent at the persistence layer, so a duplicated signal,
  // a second engine instance, or Strict Mode's double-invoke all converge on
  // exactly one completion and one celebration.
  const interactions = useSyncExternalStore(
    subscribePostInteractions,
    readPostInteractions,
    readPostInteractions,
  );
  const interactDone = state?.paths.interact === 'completed';

  useEffect(() => {
    if (!detectionEnabled || interactDone || !pubkey) return;
    const qualifying = interactions.find(
      (signal) =>
        signal.actorPubkey === pubkey &&
        signal.targetAuthorPubkey !== pubkey &&
        signal.at >= startedAt - PUBLISH_CLOCK_SKEW_MS,
    );
    if (!qualifying) return;
    void completeInteractPath(qualifying.type, qualifying.targetEventId);
  }, [detectionEnabled, interactDone, pubkey, interactions, startedAt, completeInteractPath]);

  // DEV-only: let the localhost harness stand in for a real interaction, so the
  // guidance → completion → celebration sequence can be inspected without
  // publishing anything. `import.meta.env.DEV` is statically false in
  // production, so the bundler drops this; `armMissionDevInteraction` is
  // additionally a no-op off localhost and without a `?missionDev=` scenario.
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    return armMissionDevInteraction(pubkey);
  }, [pubkey]);
}

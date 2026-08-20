/**
 * Post-onboarding first-session mission ("Ditto Explorer").
 *
 * A lightweight, non-blocking first mission that helps a user who has already
 * entered Ditto understand what to do next and build some momentum. It is
 * **not** a signup wizard and knows nothing about how the account was created —
 * any authenticated user with an encryption-capable signer gets it.
 *
 * This module holds the shared types, task metadata, and small *pure* helpers
 * used by the persistence hook (`usePostOnboardingGuide`), the completion
 * engine (`useMissionEngine`), and the view surfaces. Keeping the policy pure
 * here (and the React state transitions in the hook) keeps both testable.
 *
 * State is persisted in the user's private, cross-device encrypted settings
 * (NIP-78 kind 30078, see `useEncryptedSettings`) keyed by pubkey — never in
 * localStorage and never in the public kind-0 profile.
 *
 * ## Where this feature touches the rest of the app
 *
 * This module is the feature's root, so the map lives here. Everything under
 * "owned" exists only for this journey and can be deleted outright; everything
 * under "integration" is a line or two in a file that has its own reasons to
 * exist. Nothing else in the app knows this feature is here.
 *
 * **Owned** (delete): `postOnboardingGuide` · `missionAutoWrites` ·
 * `missionTasks` · `badgeClaim` · `usePostOnboardingGuide` · `useMissionEngine` ·
 * `useMissionSurfaceState` · `useMissionCelebration` · `useStartMissionTask` ·
 * `useInteractMissionFlow` · `useCustomizeMissionFlow` · `useBadgeClaim` ·
 * `useRewardCeremony` · `Mission*` components · `RewardCeremony` ·
 * `DittoExplorer*` · `InteractMissionTip` · `MissionsPage` · `dev/missionHarness`.
 *
 * **Integration** (revert a few lines):
 *  1. `AppRouter` — the `/missions` route.
 *  2. `sidebarItems` — the Missions nav entry.
 *  3. `MainLayout` — mounts `MissionEngine`.
 *  4. `WidgetSidebar` — renders `MissionsWidget`, and suppresses it on `/missions`.
 *  5. `Feed` / `NotificationsPage` / `SearchPage` / `TrendsPage` — render
 *     `MobileMissionTeaser`.
 *  6. `ProfileSettings` / `ThemesPage` — render `MissionHelperCard` and call
 *     `useCustomizeMissionFlow`, which is how the customize task completes.
 *  7. `Index` — renders `InteractMissionTip` and reads `isMissionComposeState` /
 *     `isQualifyingStarterPost` for the post-small task's compose flow.
 *  8. `useEncryptedSettings` — the `postOnboardingGuide` field, and
 *     `schemas.ts` — `PostOnboardingGuideStateSchema`. Dropping the field leaves
 *     stale data in users' settings, which the loose schema simply ignores.
 *  9. `useNostrPublish` — one call reporting an accepted publish to
 *     `lib/postInteraction`, which is how the interact task hears about
 *     reactions, replies and reposts.
 * 10. `useBookmarks` / `NoteMoreMenu` — the same report for bookmarks. **The
 *     one integration that is not additive:** `toggleBookmark` takes
 *     `{ eventId, authorPubkey }` rather than a bare `eventId`, because a kind
 *     10003 `e` tag carries no author and the call site is the only place that
 *     knows whose post is being saved. Reverting this feature means reverting
 *     that signature too, or leaving a parameter nothing reads.
 * 11. `BadgesPage` — reads `?tab=` through `lib/badgesTabs`, so the reward's
 *     "Open Badges" can land on My Badges. `lib/badgesTabs` belongs to Badges,
 *     not to this feature: it holds that page's own tab vocabulary, and only
 *     `DITTO_EXPLORER_BADGES_DESTINATION` is ours to delete.
 *
 * **Shared, keep** (used by this feature, owned by nobody): `lib/reducedMotion` ·
 * `lib/sharedElementTravel` · `lib/postInteraction` · `lib/badgesTabs` · the
 * Dialog primitives · `useNostrPublish` · `useEncryptedSettings` itself.
 *
 * **Adjacent, not owned**: the first-arrival experience is a *signup*
 * transition, with its own seams — `App.tsx` mounts `ExplorerArrivalProvider`
 * and `FirstArrivalExperience`, and `InitialSyncGate` calls `markFirstArrival`
 * at the signup completion boundary and resolves `useSignupServices`. It
 * introduces this journey and hands its card to `MissionsWidget` /
 * `MobileMissionTeaser` via `ExplorerTransitionTarget`, but it reads no mission
 * state and would need only a new destination — or removing in its own right.
 * The general `/badges` feature is likewise independent: this feature publishes
 * a *claim* (kind 30637) and never awards, accepts or equips anything.
 *
 * **Development only**: `AppRouter` also registers `/dev` and
 * `/dev/signup-arrival` behind `isLocalhostDev()`, and `App.tsx`-level
 * `DevSignupArrivalReturn` renders during a simulated signup. Those, `src/dev/`
 * and the harness seams inside `useMissionEngine`, `usePostOnboardingGuide`,
 * `useBadgeClaim`, `useCurrentUser`, `useEncryptedSettings`, `signupServices`
 * and `InitialSyncGate` are inert in every production build — see
 * `dev/isLocalhostDev`.
 */

import type { NostrEvent, NostrMetadata } from '@nostrify/nostrify';

import type { PostInteractionKind } from '@/lib/postInteraction';

export type PostOnboardingGuideStatus = 'active' | 'completed' | 'skipped';

/**
 * Task ids, as persisted in the user's encrypted settings.
 *
 * These are an **internal** vocabulary. They are persisted, so renaming one
 * without a migration resets everybody who had completed it — but they are no
 * longer what goes on the wire. The badge claim's `path` tags have their own
 * frozen, published spelling, and `CLAIM_PATH_TAG` in `lib/badgeClaim` is the
 * single place that maps between the two. Renaming a task id there is a type
 * error until its wire value is decided explicitly.
 */
export type PostOnboardingPathId =
  | 'find-people'
  | 'post-small'
  | 'customize'
  | 'interact';

export type PostOnboardingPathStatus = 'not_started' | 'active' | 'completed';

/**
 * Lifecycle of the Ditto Explorer badge claim.
 *
 * `failed` is a distinct, explicitly retryable state (rather than silently
 * reverting to `unclaimed`) so the UI can say "that didn't go through — try
 * again" instead of pretending the user never tried.
 */
export type BadgeClaimStatus = 'unclaimed' | 'claiming' | 'claimed' | 'failed';

/**
 * State of the "Ditto Explorer" badge claim attached to a completed mission.
 *
 * Lives inside the mission state (and therefore in the user's private,
 * encrypted NIP-78 settings), so the claimed/pending-award UI survives reloads
 * and device switches without re-publishing. `badge` is fixed to
 * `ditto-explorer` for now but is stored explicitly so the shape can grow to
 * other badges later.
 */
export interface PostOnboardingBadgeClaim {
  badge: 'ditto-explorer';
  status: BadgeClaimStatus;
  /** Event id of the published kind 30637 claim, once it succeeds. */
  claimEventId?: string;
  /** Epoch ms when the claim was published. */
  claimedAt?: number;
  /**
   * Epoch ms when the claim was latched to `claiming`. Used to recover from a
   * stuck `claiming` state: if the tab closes / app crashes / the publish hangs
   * between `beginBadgeClaim` and `completeBadgeClaim`/`failBadgeClaim`, the
   * persisted `claiming` would otherwise never clear. A `claiming` state older
   * than {@link STALE_CLAIMING_TIMEOUT_MS} is treated as failed/retryable.
   */
  claimingStartedAt?: number;
  /** Epoch ms of the last failed claim attempt. */
  failedAt?: number;
  /**
   * Epoch ms when the reward reveal crossed its **irreversible point**.
   *
   * This is emphatically *not* "the user watched the whole reveal". It is
   * written at the moment the reveal becomes owed to them and can no longer be
   * taken back — in practice, in the same write that records a successful claim,
   * i.e. at the *start* of the reveal rather than the end. Everything after that
   * moment (the animation, a skip, a close, a reload halfway through) is
   * presentation, and none of it may change this field.
   *
   * Its only job is to answer one question on every future mount: *should the
   * stable revealed state render, or is the reveal still owed?* Persisting the
   * end of the animation instead would mean a user who skipped, closed the tab,
   * or reloaded mid-reveal came back to a reward that had un-revealed itself.
   *
   * Deliberately separate from `status: 'claimed'`. A claim being submitted and
   * a reward being revealed are two different facts, and this branch could
   * already produce the first without the second (claiming shipped before the
   * reveal existed) — see {@link badgeRewardView}.
   */
  revealedAt?: number;
}

/**
 * How long a persisted `claiming` state is trusted before it's considered stale
 * and retryable. Publishing a single event takes seconds; anything still
 * `claiming` after this window almost certainly means the app died mid-claim,
 * so the user must be able to retry rather than stay locked out forever.
 */
export const STALE_CLAIMING_TIMEOUT_MS = 60_000;

/**
 * Substep progress for the guided `customize` ("Make it feel like me") task.
 *
 * `customize` is one task with two internal steps — it completes only once
 * *both* land. Each substep is detected from **real product state** (see
 * `useMissionEngine`), never from a click:
 *  - `profileCompleted` — the user's kind-0 profile was (re)published with at
 *    least one meaningful field since the mission started.
 *  - `themeCompleted` — the user's active theme differs from the baseline
 *    recorded when the mission started.
 *
 * Both fields are optional so states written before a user ever entered the
 * flow parse cleanly with the substep simply absent (treated as `false`).
 */
export interface CustomizeSubsteps {
  profileCompleted?: boolean;
  themeCompleted?: boolean;
}

/**
 * Snapshots of real product state taken when the mission first observes them.
 *
 * Completion for `find-people` and the customize *theme* substep is "the user
 * changed something", which is only meaningful relative to where they started.
 * Baselines are written lazily (the follow list / theme may resolve after the
 * mission state is created) and, once set, are never overwritten — so a
 * refresh, remount, or second device can't quietly move the goalposts.
 */
export interface MissionBaselines {
  /** Number of pubkeys on the user's kind-3 follow list at baseline time. */
  follows?: number;
  /** {@link themeSignature} of the user's active theme at baseline time. */
  theme?: string;
}

/**
 * Presentation state of the Ditto Explorer *introduction* — the short "here's
 * what this is" panel shown before the task list.
 *
 * This is an **optional, additive** field rather than a new `status` value or a
 * `version` bump, and that is a deliberate forward-compatibility decision. Both
 * of those alternatives make a client that predates them fail
 * `EncryptedSettingsSchema` validation, which drops it into the raw-JSON
 * fallback path for *every* setting the user has — not just the mission. An
 * extra optional field costs nothing and is preserved verbatim by the
 * `looseObject` strategy.
 */
export interface MissionIntro {
  /** Epoch ms the introduction was first shown. */
  presentedAt?: number;
  /** Epoch ms the user chose "Start exploring". Terminal. */
  acknowledgedAt?: number;
  /** Epoch ms the user chose "Maybe later". Not terminal — see below. */
  postponedAt?: number;
}

/**
 * What actually completed the `interact` ("Find something you like") task.
 *
 * Recorded because the completion feedback is action-specific — "You shared a
 * post." reads as recognition, "Task complete." reads as a form submission —
 * and because persisting it means the right message survives a reload and is
 * identical on every surface, rather than living in one component's local state.
 *
 * Optional and additive, for the same compatibility reason as {@link MissionIntro}.
 */
export interface MissionInteraction {
  /** Which of the four valid actions landed first. */
  action: PostInteractionKind;
  /** The post that was interacted with, for debugging and idempotence. */
  targetEventId?: string;
  /** Epoch ms the interaction completed the task. */
  completedAt: number;
}

export interface PostOnboardingGuideState {
  /** Schema version, so the shape can evolve without colliding with old data. */
  version: 1;
  status: PostOnboardingGuideStatus;
  /** The task the user most recently launched (informational). */
  activePath?: PostOnboardingPathId;
  paths: Record<PostOnboardingPathId, PostOnboardingPathStatus>;
  /** Epoch ms when the mission was created. */
  startedAt: number;
  /** Epoch ms of the last mutation. */
  updatedAt: number;
  /** Epoch ms when all tasks were completed. */
  completedAt?: number;
  /** Epoch ms when the user dismissed the mission ("I'll explore on my own"). */
  skippedAt?: number;
  /** Ditto Explorer badge claim state. Absent until the claim flow starts. */
  badgeClaim?: PostOnboardingBadgeClaim;
  /** Substep progress for the two-step `customize` task. */
  customize?: CustomizeSubsteps;
  /** Real-product-state snapshots used for change-based completion. */
  baselines?: MissionBaselines;
  /**
   * Introduction presentation state. Every mission is born with this present
   * and empty (see {@link createInitialGuideState}); it stays optional in the
   * type and the schema so a state that somehow arrives without it parses and
   * reads as "introduction still owed" rather than failing validation.
   */
  intro?: MissionIntro;
  /** What completed the `interact` task. Absent until it completes. */
  interact?: MissionInteraction;
}

/** The four actionable tasks, in display order. */
export const POST_ONBOARDING_PATH_IDS: readonly PostOnboardingPathId[] = [
  'find-people',
  'post-small',
  'customize',
  'interact',
] as const;

export interface PostOnboardingPathMeta {
  id: PostOnboardingPathId;
  label: string;
  description: string;
  /** One-line explanation of what actually completes the task. */
  completionHint: string;
}

export const POST_ONBOARDING_PATHS: Record<PostOnboardingPathId, PostOnboardingPathMeta> = {
  'find-people': {
    id: 'find-people',
    label: 'Find your people',
    description: 'Follow voices that make your feed feel alive.',
    completionHint: 'Follow someone new to complete this.',
  },
  'post-small': {
    id: 'post-small',
    label: 'Post something small',
    description: 'Say hi, ask a question, or share a thought.',
    completionHint: 'Publish a post to complete this.',
  },
  customize: {
    id: 'customize',
    label: 'Make it feel like me',
    description: 'Add your profile and pick a theme.',
    completionHint: 'Save your profile, then choose a theme.',
  },
  interact: {
    id: 'interact',
    label: 'Find something you like',
    description: 'React, reply, repost, or save a post from someone else.',
    completionHint: 'Any one of those on someone else’s post completes this.',
  },
};

/**
 * The guided instruction shown on the feed while this task is in progress.
 * Names all four options without demanding any of them — the task is meant to
 * feel like browsing, not like homework.
 */
export const INTERACT_TASK_GUIDANCE =
  'Choose any post that catches your attention, then react, reply, repost, or save it.';

/**
 * Fallback guidance when the user's feed has nothing of anybody else's to
 * interact with. Leaving them staring at an empty column with an unfinishable
 * task is the one outcome this mission must not produce.
 */
export const INTERACT_TASK_EMPTY_FEED_GUIDANCE =
  'Your feed is quiet right now. Follow a few people, or switch to the Global tab, and you’ll have plenty to choose from.';

/**
 * Recognition copy for the action that completed the task. The mission says
 * back what the user *did* — a generic "task complete" would throw away the one
 * thing that makes the moment feel like it was about them.
 */
export function interactionSuccessMessage(action: PostInteractionKind): string {
  switch (action) {
    case 'reaction':
      return 'You reacted to a post.';
    case 'reply':
      return 'You joined the conversation.';
    case 'repost':
      return 'You shared a post.';
    case 'bookmark':
      return 'You saved something for later.';
  }
}

/** Build a fresh, freshly-armed mission state. */
export function createInitialGuideState(now = Date.now()): PostOnboardingGuideState {
  return {
    version: 1,
    status: 'active',
    paths: {
      'find-people': 'not_started',
      'post-small': 'not_started',
      customize: 'not_started',
      interact: 'not_started',
    },
    startedAt: now,
    // Written explicitly (empty, not absent) so a mission always carries its
    // introduction state rather than implying it by omission.
    intro: {},
    updatedAt: now,
  };
}

/**
 * How the introduction should be treated for a given mission state.
 *
 * - `pending`      — never acknowledged or postponed. Show the introduction.
 * - `postponed`    — the user chose "Maybe later". Promotional surfaces go
 *                    quiet, but `/missions` still offers the introduction, and
 *                    the mission itself is untouched.
 * - `acknowledged` — the user chose "Start exploring". Show the real mission.
 *
 * A state with no `intro` object at all reads as `pending`: every mission is
 * created with one, so this only covers a state that lost it, and offering the
 * introduction again is the harmless outcome — it is dismissible and changes
 * nothing about the mission's progress.
 */
export type MissionIntroState = 'pending' | 'postponed' | 'acknowledged';

export function introState(
  state: PostOnboardingGuideState | undefined,
): MissionIntroState {
  if (state?.intro?.acknowledgedAt) return 'acknowledged';
  if (state?.intro?.postponedAt) return 'postponed';
  return 'pending';
}

/**
 * Whether the introduction still owes the user a presentation — i.e. it should
 * be offered on `/missions` and anchored from the compact surfaces.
 */
export function isIntroOutstanding(state: PostOnboardingGuideState | undefined): boolean {
  const intro = introState(state);
  return intro === 'pending' || intro === 'postponed';
}

/**
 * Whether the *full* mission detail (task rows, reward panel) may be shown.
 * Task rows are deliberately withheld until the user has acknowledged the
 * introduction, so their first encounter is an invitation rather than a
 * checklist.
 */
export function canShowMissionDetail(state: PostOnboardingGuideState | undefined): boolean {
  return introState(state) === 'acknowledged';
}

/** Number of completed tasks. */
export function countCompletedPaths(state: PostOnboardingGuideState): number {
  return POST_ONBOARDING_PATH_IDS.reduce(
    (total, id) => total + (state.paths[id] === 'completed' ? 1 : 0),
    0,
  );
}

/** Completion as a percentage. Zero tasks reads as zero, never as `NaN`. */
export function missionProgressValue(completedCount: number, totalCount: number): number {
  return totalCount > 0 ? (completedCount / totalCount) * 100 : 0;
}

/** True when every task has been completed. */
export function areAllPathsCompleted(state: PostOnboardingGuideState): boolean {
  return POST_ONBOARDING_PATH_IDS.every((id) => state.paths[id] === 'completed');
}

/**
 * The task the compact surfaces should recommend next.
 *
 * Prefers the task the user most recently *started* (`activePath`) when it is
 * still unfinished, so a surface can't tell someone "up next: post something"
 * while they are standing in the middle of the customize flow. Falls back to
 * the first unfinished task in canonical order.
 */
export function nextRecommendedPath(
  state: PostOnboardingGuideState | undefined,
): PostOnboardingPathId | undefined {
  if (!state) return undefined;
  const { activePath } = state;
  // Guarded against an id this build doesn't know — a task added by a newer
  // client, riding through on the `looseObject` schema. An unknown id has no
  // metadata, and every surface that renders `nextPath` looks its label up.
  if (
    activePath &&
    POST_ONBOARDING_PATH_IDS.includes(activePath) &&
    state.paths[activePath] !== 'completed'
  ) {
    return activePath;
  }
  return POST_ONBOARDING_PATH_IDS.find((id) => state.paths[id] !== 'completed');
}

/** Whether the customize profile substep has been completed. */
export function isCustomizeProfileDone(
  state: PostOnboardingGuideState | undefined,
): boolean {
  return state?.customize?.profileCompleted === true;
}

/** Whether the customize theme substep has been completed. */
export function isCustomizeThemeDone(
  state: PostOnboardingGuideState | undefined,
): boolean {
  return state?.customize?.themeCompleted === true;
}

/**
 * Whether a badge-claim state is effectively "claiming" *right now* — i.e.
 * `claiming` and not yet stale. A stale `claiming` (older than
 * {@link STALE_CLAIMING_TIMEOUT_MS}, or missing its start timestamp) is treated
 * as retryable, not in-flight, so a crash mid-claim never locks the user out.
 */
export function isClaimInFlight(
  claim: PostOnboardingBadgeClaim | undefined,
  now = Date.now(),
): boolean {
  if (claim?.status !== 'claiming') return false;
  if (typeof claim.claimingStartedAt !== 'number') return false;
  return now - claim.claimingStartedAt < STALE_CLAIMING_TIMEOUT_MS;
}

/**
 * The claim state as the UI should present it — the seven distinct states the
 * reward surfaces must be able to tell apart. Derived (never persisted) so a
 * stale `claiming` reads as `failed` (retryable) rather than a stuck spinner.
 *
 * - `locked`     — the mission isn't finished, so the badge isn't earned yet.
 * - `ready`      — earned and ready to claim.
 * - `claiming`   — a claim publish is in flight.
 * - `claimed`    — the claim was published, and the reward has *not* been
 *                  revealed. The award is pending server-side either way.
 * - `revealed`   — the claim was published *and* the reveal crossed its
 *                  irreversible point. Terminal for this client.
 * - `failed`     — the last attempt failed (or died mid-flight); retryable.
 * - `dismissed`  — the user dismissed the mission before claiming.
 *
 * `claimed` and `revealed` are separate because *claim submitted* and *reward
 * revealed* are separate facts, and this branch shipped claiming before any
 * reveal existed: a user who claimed under an earlier build is `claimed`, and is
 * still owed the reveal. Neither value says anything about the badge having been
 * issued or owned — that is the issuer's business, and Ditto cannot observe it.
 */
export type BadgeRewardView =
  | 'locked'
  | 'ready'
  | 'claiming'
  | 'claimed'
  | 'revealed'
  | 'failed'
  | 'dismissed';

export function badgeRewardView(
  state: PostOnboardingGuideState | undefined,
  now = Date.now(),
): BadgeRewardView {
  if (!state) return 'locked';
  const claim = state.badgeClaim;
  // A successful claim still outranks dismissal: hiding the mission must never
  // undo a published claim, and it must not undo a reveal either.
  if (claim?.status === 'claimed') {
    return claim.revealedAt === undefined ? 'claimed' : 'revealed';
  }
  if (state.status === 'skipped') return 'dismissed';
  if (!areAllPathsCompleted(state)) return 'locked';
  if (isClaimInFlight(claim, now)) return 'claiming';
  // A stale `claiming` never leaves the user stuck — it reads as retryable.
  if (claim?.status === 'failed' || claim?.status === 'claiming') return 'failed';
  return 'ready';
}

/**
 * Whether the user has earned a reward reveal they have not had yet.
 *
 * Derived from {@link badgeRewardView} rather than from the raw state, so it
 * inherits every precedence rule that function already owns — dismissal, stale
 * claim recovery, and the claim-outranks-dismissal exception — instead of
 * introducing a second, subtly different completion model.
 *
 * True for `ready`, `claiming`, `failed` and `claimed`: the journey is finished
 * and the reveal has not happened. False for `locked` (not earned), `dismissed`
 * (deliberately hidden) and `revealed` (already had).
 *
 * `claimed` counts. A claim submitted under a build that had no reveal still
 * owes the user one, and the surfaces that lead there must not vanish just
 * because the claim went out.
 */
export function isCeremonyOwed(
  state: PostOnboardingGuideState | undefined,
  now = Date.now(),
): boolean {
  switch (badgeRewardView(state, now)) {
    case 'ready':
    case 'claiming':
    case 'failed':
    case 'claimed':
      return true;
    case 'locked':
    case 'dismissed':
    case 'revealed':
      return false;
  }
}

/**
 * How the reward region should present itself, which is *not* always the claim
 * state it is presenting.
 *
 * One extra value on top of {@link BadgeRewardView}: `settling`. The fourth task
 * is always the last one, so finishing it lands 4/4 and an earned reward in the
 * same write — and the reward used to start asking for attention (its ready
 * copy, its call to action, its glow) underneath the completion celebration
 * that was still playing. The order the user should read is *you did this* →
 * *that's 4 of 4* → *here's your reward*, and the reward is one settle away.
 *
 * `settling` is that settle: earned, acknowledged, still sealed, no action yet.
 *
 * Only `ready` is held. Every other value is either impossible at the moment a
 * count increases (nothing can be `claiming`, `claimed`, `revealed` or `failed`
 * before the journey is finished) or has nothing to hold back (`locked`,
 * `dismissed`). Deriving it from the *view* rather than from the state keeps the
 * rule in one place for both the page's reward panel and the compact surfaces.
 *
 * `celebrating` is transient by design (see `useMissionCelebration`) and is
 * never persisted — so this takes it as an argument rather than reading it out
 * of the mission state, which knows nothing about it.
 */
export type RewardPresentation = BadgeRewardView | 'settling';

export function rewardPresentation(
  view: BadgeRewardView,
  celebrating: boolean,
): RewardPresentation {
  return view === 'ready' && celebrating ? 'settling' : view;
}

// ── Real-product-state predicates ───────────────────────────────────────────
//
// Task completion is derived from actual product state wherever it can be
// verified, rather than from "the user clicked the button". These are pure so
// the rules can be tested without React, relays, or a signer.

/**
 * Profile fields that count as "you filled in your profile". Deliberately
 * generous: any one of them is a real, visible improvement over an empty kind-0.
 */
const MEANINGFUL_PROFILE_FIELDS = ['name', 'display_name', 'about', 'picture'] as const;

/** Whether kind-0 metadata contains at least one meaningful, non-blank field. */
export function hasMeaningfulProfile(metadata: NostrMetadata | undefined): boolean {
  if (!metadata) return false;
  return MEANINGFUL_PROFILE_FIELDS.some((field) => {
    const value = metadata[field];
    return typeof value === 'string' && value.trim().length > 0;
  });
}

/**
 * Whether a kind-0 event proves the user filled in their profile *as part of
 * this mission* — i.e. it was published at or after the mission started and
 * carries at least one meaningful field.
 *
 * Requiring the timestamp is what stops a long-standing profile from silently
 * auto-completing the task on day one: the mission asks the user to do
 * something, not to already have done it.
 */
export function isProfileTaskSatisfied(
  event: NostrEvent | undefined,
  metadata: NostrMetadata | undefined,
  startedAt: number,
): boolean {
  if (!event) return false;
  if (event.created_at * 1000 < startedAt - PUBLISH_CLOCK_SKEW_MS) return false;
  return hasMeaningfulProfile(metadata);
}

/**
 * Tolerance for clock skew between this device and the signer/relay when
 * comparing an event's `created_at` against a locally-stamped mission start.
 * Without it a device whose clock is a few seconds behind would reject the very
 * post the user just made.
 */
export const PUBLISH_CLOCK_SKEW_MS = 120_000;

/**
 * Whether an event is a **qualifying starter post** for the `post-small` task:
 * a root-level short text note (kind 1) authored by this user at or after the
 * mission started.
 *
 * Replies and comments are excluded (an `e`/`E`/`a`/`A` marker means it hangs
 * off someone else's thread), as are polls, voice messages, articles, and every
 * other kind — the task is "post something", not "interact with something".
 * Reposts never reach here because they aren't kind 1.
 */
export function isQualifyingStarterPost(
  event: NostrEvent | undefined,
  pubkey: string | undefined,
  startedAt: number,
): boolean {
  if (!event || !pubkey) return false;
  if (event.kind !== 1) return false;
  if (event.pubkey !== pubkey) return false;
  if (event.created_at * 1000 < startedAt - PUBLISH_CLOCK_SKEW_MS) return false;
  // Any thread-parent marker makes this a reply/comment rather than a post.
  return !event.tags.some(([name]) => name === 'e' || name === 'E' || name === 'a' || name === 'A');
}

/**
 * Stable signature of the user's active theme, used as the baseline for the
 * customize *theme* substep. Any real change — switching between built-ins,
 * applying a preset, or editing custom colors — produces a different string.
 *
 * Kept pure and JSON-based (rather than a hash) so a mismatch is debuggable and
 * the function has no dependencies on the theme subsystem's internals.
 */
export function themeSignature(
  theme: string | undefined,
  customTheme: unknown,
): string {
  if (theme !== 'custom') return `builtin:${theme ?? 'unset'}`;
  try {
    return `custom:${JSON.stringify(customTheme ?? null)}`;
  } catch {
    // Circular / non-serializable config: fall back to the coarse signature
    // rather than throwing. Worst case the substep needs an explicit change.
    return 'custom:unserializable';
  }
}

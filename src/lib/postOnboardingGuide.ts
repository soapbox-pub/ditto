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
 */

import type { NostrEvent, NostrMetadata } from '@nostrify/nostrify';

export type PostOnboardingGuideStatus = 'active' | 'completed' | 'skipped';

/**
 * Stable task ids. These are persisted and published (as `path` tags on the
 * badge claim), so they must never be renamed.
 */
export type PostOnboardingPathId =
  | 'find-people'
  | 'post-small'
  | 'customize'
  | 'explore';

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
}

/** The four actionable tasks, in display order. */
export const POST_ONBOARDING_PATH_IDS: readonly PostOnboardingPathId[] = [
  'find-people',
  'post-small',
  'customize',
  'explore',
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
  explore: {
    id: 'explore',
    label: 'Explore Ditto',
    description: 'See what’s happening across Ditto.',
    completionHint: 'Visit Trends to complete this.',
  },
};

/** Build a fresh, freshly-armed mission state. */
export function createInitialGuideState(now = Date.now()): PostOnboardingGuideState {
  return {
    version: 1,
    status: 'active',
    paths: {
      'find-people': 'not_started',
      'post-small': 'not_started',
      customize: 'not_started',
      explore: 'not_started',
    },
    startedAt: now,
    updatedAt: now,
  };
}

/** Number of completed tasks. */
export function countCompletedPaths(state: PostOnboardingGuideState): number {
  return POST_ONBOARDING_PATH_IDS.reduce(
    (total, id) => total + (state.paths[id] === 'completed' ? 1 : 0),
    0,
  );
}

/** True when every task has been completed. */
export function areAllPathsCompleted(state: PostOnboardingGuideState): boolean {
  return POST_ONBOARDING_PATH_IDS.every((id) => state.paths[id] === 'completed');
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
 * The claim state as the UI should present it — the six distinct states the
 * reward surfaces must be able to tell apart. Derived (never persisted) so a
 * stale `claiming` reads as `failed` (retryable) rather than a stuck spinner.
 *
 * - `locked`     — the mission isn't finished, so the badge isn't earned yet.
 * - `ready`      — earned and ready to claim.
 * - `claiming`   — a claim publish is in flight.
 * - `claimed`    — the claim was published; the award is pending server-side.
 * - `failed`     — the last attempt failed (or died mid-flight); retryable.
 * - `dismissed`  — the user dismissed the mission before claiming.
 */
export type BadgeRewardView =
  | 'locked'
  | 'ready'
  | 'claiming'
  | 'claimed'
  | 'failed'
  | 'dismissed';

export function badgeRewardView(
  state: PostOnboardingGuideState | undefined,
  now = Date.now(),
): BadgeRewardView {
  if (!state) return 'locked';
  const claim = state.badgeClaim;
  if (claim?.status === 'claimed') return 'claimed';
  if (state.status === 'skipped') return 'dismissed';
  if (!areAllPathsCompleted(state)) return 'locked';
  if (isClaimInFlight(claim, now)) return 'claiming';
  // A stale `claiming` never leaves the user stuck — it reads as retryable.
  if (claim?.status === 'failed' || claim?.status === 'claiming') return 'failed';
  return 'ready';
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

import type { PostOnboardingPathId } from '@/lib/postOnboardingGuide';

/**
 * Shared "start a mission task" plumbing.
 *
 * Every mission surface (the `/missions` page, the feed card, the sidebar and
 * mobile teasers) starts a task the same way, through `useStartMissionTask`.
 * This module holds the pure pieces that orchestration needs: the route-state
 * contracts used to hand a page into a guided flow, and the starter copy.
 *
 * **Nothing here completes a task.** Completion is decided entirely by
 * `useMissionEngine` from real product state (a follow that landed, a note that
 * published, a profile that was saved, a theme that changed, a page that was
 * actually reached). Starting a task only navigates.
 */

/**
 * Route-state key set on `navigate('/', { state })` to ask the home feed to
 * open the composer for a specific mission task. Read once by `Index` and then
 * cleared from history so a refresh/back doesn't re-open the composer.
 */
export interface MissionComposeState {
  /** The mission task that opened the composer. */
  missionTask: Extract<PostOnboardingPathId, 'post-small'>;
}

/** Type guard for the mission-compose route state on the home feed. */
export function isMissionComposeState(
  state: unknown,
): state is MissionComposeState {
  return (
    typeof state === 'object' &&
    state !== null &&
    (state as { missionTask?: unknown }).missionTask === 'post-small'
  );
}

/**
 * Route-state flag set on `navigate('/settings/profile', { state })` when the
 * user starts the guided `customize` task. It tells the profile settings page
 * that the customize flow is in progress so it renders the helper card even
 * before either substep is done. The helper otherwise falls back to the
 * persisted substep state, so a reload / direct navigation to the theme page
 * still shows the correct step without this flag.
 */
export interface MissionCustomizeState {
  /** The mission task that started this flow. */
  missionTask: Extract<PostOnboardingPathId, 'customize'>;
}

/** Type guard for the customize mission route state. */
export function isMissionCustomizeState(
  state: unknown,
): state is MissionCustomizeState {
  return (
    typeof state === 'object' &&
    state !== null &&
    (state as { missionTask?: unknown }).missionTask === 'customize'
  );
}

/**
 * Route state set on `navigate('/feed', { state })` when the user starts the
 * `interact` ("Find something you like") task. It only asks the feed to show
 * the guidance tip — no post is chosen for the user, nothing is injected, and
 * the task completes from a real interaction wherever they end up making it.
 */
export interface MissionInteractState {
  /** The mission task that started this flow. */
  missionTask: Extract<PostOnboardingPathId, 'interact'>;
}

/** Type guard for the interact mission route state. */
export function isMissionInteractState(
  state: unknown,
): state is MissionInteractState {
  return (
    typeof state === 'object' &&
    state !== null &&
    (state as { missionTask?: unknown }).missionTask === 'interact'
  );
}

/**
 * Editable starter note prefilled into the composer when the user arrives from
 * the "Post something small" task. It is only a suggestion — the user can edit
 * or delete every character before posting, and the task completes on whatever
 * they actually publish, not on this text.
 *
 * Deliberately Ditto-only (no "Nostr" mention): for users outside the Nostr
 * bubble, naming Nostr in their very first suggested post adds confusion. The
 * first task should reduce friction and keep the focus on Ditto. This is a copy
 * decision only — it changes no protocol, relay, or publishing behavior, and
 * the post is an ordinary kind-1 note published exactly like any other.
 */
export const POST_SMALL_STARTER_TEXT = `Hi Ditto community! 👋

I’m exploring Ditto and saying hello.

#Ditto`;

/**
 * Where each task sends the user when they start it.
 *
 * `interact` goes to `/feed` rather than `/` because `/` renders whichever page
 * the user chose as their homepage — a mission that needs a feed must land on
 * one, not on Trends or Settings because of an unrelated preference.
 */
export const MISSION_TASK_ROUTES: Record<PostOnboardingPathId, string> = {
  'find-people': '/search',
  'post-small': '/',
  customize: '/settings/profile',
  interact: '/feed',
};

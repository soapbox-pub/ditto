import type { PostOnboardingPathId } from '@/lib/postOnboardingGuide';

/**
 * Shared "start a mission task" plumbing.
 *
 * Every mission surface (the `/missions` page, the sidebar widget, the mobile
 * teaser) starts a task the same way, through `useStartMissionTask`. This
 * module holds the pure pieces that orchestration needs: the route-state
 * contracts used to hand a page into a guided flow, and the starter copy.
 *
 * **Nothing here completes a task.** Completion is decided entirely by
 * `useMissionEngine` from real product state — a follow that landed, a note
 * that published, a profile that was saved, a theme that changed, an
 * interaction with somebody else's post. Starting a task only navigates.
 */

/**
 * Route state set by `useStartMissionTask` when the user starts a task, read by
 * whatever page the task lands on.
 *
 * One shape for all four tasks rather than a type per task. It says the same
 * thing every time — *this navigation was the mission starting this task* — and
 * each destination decides what to do with it: the home feed opens the composer
 * for `post-small`, and the guided flows (`find-people`, `customize`,
 * `interact`) use it to show their helper card immediately, before the mission's
 * own `activePath` write has come back from encrypted settings.
 *
 * It is always read once and then cleared from history, so a refresh or a Back
 * doesn't re-trigger anything. Every destination therefore treats it as a hint
 * about *this* navigation, never as the source of truth about the mission — that
 * is the persisted state, which is what keeps the guidance correct across a
 * reload, a second tab, or another device.
 */
export interface MissionTaskState {
  /** The mission task this navigation started. */
  missionTask: PostOnboardingPathId;
}

/** Whether this route state was set by the mission starting `task`. */
export function isMissionTaskState(
  state: unknown,
  task: PostOnboardingPathId,
): state is MissionTaskState {
  return (
    typeof state === 'object' &&
    state !== null &&
    (state as { missionTask?: unknown }).missionTask === task
  );
}

/**
 * The home feed's read of the above: "open the composer, the mission sent me".
 *
 * Kept as its own named guard because `Index` is not a mission surface — it
 * asks one question about one task, and reading `isMissionComposeState` there
 * says what it means without the caller having to know the task vocabulary.
 */
export function isMissionComposeState(state: unknown): boolean {
  return isMissionTaskState(state, 'post-small');
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

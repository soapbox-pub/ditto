/**
 * Session-scoped policy for **automatic** mission writes.
 *
 * Automatic writes are the ones no user asked for: recording that the
 * introduction was displayed, and creating the mission for an account that
 * doesn't have one. They are triggered by effects, which means they are
 * triggered by rendering — and rendering is not a bounded event.
 *
 * That combination produced a live incident. `markIntroPresented` retried on
 * every render while the write kept failing, measured at ~4,650 attempts per
 * second and 139,409 in thirty seconds, each with a fresh `Date.now()` so no
 * equality check could ever catch it. Two things made it self-sustaining: the
 * setters changed identity on every render (so the effect re-ran), and a failed
 * write rolled the local snapshot back (so the reducer's own idempotence guard
 * never latched).
 *
 * This module is the single owner of that policy, and it is deliberately
 * module-level rather than per-hook: several surfaces mount
 * `usePostOnboardingGuide` at once (sidebar widget, mobile teaser, `/missions`,
 * the arrival destination, helper hooks — 21 instances in a normal session), so
 * a component-local boolean cannot decide "has this been attempted". Only a
 * shared registry can.
 *
 * The rule is one attempt per key per session. A key is `pubkey + transition`,
 * so it is scoped to an identity and to a specific piece of work.
 *
 * **A failed automatic write is not retried.** This is the important part. The
 * alternative — retrying until it succeeds — is what caused the incident, and
 * neither of these writes is worth it: `presentedAt` is informational and
 * changes nothing the user is offered, and a mission that fails to initialize
 * is retried on the next page load. Silence beats a hot loop. Deliberate user
 * actions ("Start exploring", "Maybe later", completing a task) never come
 * through here and stay retryable through a new action.
 */

type AutoWriteStatus = 'in-flight' | 'done' | 'failed';

/** The automatic transitions this policy governs. */
export type AutoWriteName = 'initializeGuide' | 'markIntroPresented';

const attempts = new Map<string, AutoWriteStatus>();

function keyFor(pubkey: string | undefined, name: AutoWriteName): string {
  // A missing pubkey still gets a key, so an anonymous session cannot loop
  // either. It simply shares one slot.
  return `${pubkey ?? 'anon'}:${name}`;
}

/**
 * Ask permission to run an automatic write.
 *
 * Returns `true` at most once per key per session. Returns `false` when an
 * identical write is already in flight, has already succeeded, or has already
 * failed — in every one of those cases the correct action is to do nothing.
 */
export function claimAutoWrite(
  pubkey: string | undefined,
  name: AutoWriteName,
): boolean {
  const key = keyFor(pubkey, name);
  if (attempts.has(key)) return false;
  attempts.set(key, 'in-flight');
  return true;
}

/** Record how a claimed write ended. Neither outcome permits another attempt. */
export function settleAutoWrite(
  pubkey: string | undefined,
  name: AutoWriteName,
  ok: boolean,
): void {
  attempts.set(keyFor(pubkey, name), ok ? 'done' : 'failed');
}

/**
 * Release a claim without consuming it.
 *
 * Only for the case where the write never actually happened — the reducer
 * decided there was nothing to do — so a genuinely new situation later is still
 * allowed to try. A write that was *attempted* never comes back here.
 */
export function releaseAutoWrite(
  pubkey: string | undefined,
  name: AutoWriteName,
): void {
  attempts.delete(keyFor(pubkey, name));
}

/** Current status, for tests and diagnostics. */
export function autoWriteStatus(
  pubkey: string | undefined,
  name: AutoWriteName,
): AutoWriteStatus | undefined {
  return attempts.get(keyFor(pubkey, name));
}

/** Test-only: forget every claim. */
export function resetAutoWrites(): void {
  attempts.clear();
}

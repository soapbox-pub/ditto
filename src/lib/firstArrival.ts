/**
 * First-arrival intent — the one-time "this account just finished signup" marker.
 *
 * This is deliberately *not* the Ditto Explorer mission. It answers exactly one
 * question — "did this pubkey just complete signup in this browser?" — and is
 * used for nothing but the short arrival transition. Mission eligibility and
 * progress are a separate, durable concern (see `postOnboardingGuide.ts`), and
 * an existing user can be eligible for the mission without ever having an
 * arrival intent.
 *
 * In particular: **a missing mission state is not evidence of a fresh signup.**
 * That inference is what coupled the abandoned signup-onboarding branch to the
 * mission engine, and it is not reintroduced here.
 *
 * Stored in localStorage rather than the user's NIP-78 settings: this is
 * device-local, worthless after a few minutes, and publishing a Nostr event
 * just to drive an animation would be indefensible.
 */

import { getStorageKey } from '@/lib/storageKey';

/**
 * The marker itself.
 *
 * `consumedAt` is what makes the experience one-shot. The record is kept (not
 * deleted) after consumption so a reload immediately afterwards can tell
 * "already played" apart from "never happened" — deleting it would make those
 * two cases indistinguishable and risk a replay.
 */
export interface FirstArrivalIntent {
  /** Epoch ms when signup completed. */
  createdAt: number;
  /** Epoch ms when the arrival experience finished or was skipped. */
  consumedAt?: number;
}

/**
 * How long an unconsumed intent stays valid.
 *
 * The arrival is a *transition* — it only makes sense in the moments right
 * after signup. Thirty minutes is far longer than any plausible signup→app
 * gap (it comfortably covers a reload, a slow relay round-trip, or the user
 * being interrupted), while ensuring that someone who abandons the tab and
 * returns tomorrow gets the ordinary app rather than a stale welcome.
 */
export const FIRST_ARRIVAL_TTL_MS = 30 * 60_000;

/** Per-account storage key. Never global — see {@link isFirstArrivalPending}. */
export function firstArrivalKey(appId: string, pubkey: string): string {
  return getStorageKey(appId, `first-arrival:${pubkey}`);
}

/**
 * Read the stored intent for a pubkey.
 *
 * Any unreadable, non-JSON, or structurally invalid value is treated as absent
 * *and cleared*, so a corrupt entry can never wedge a user into a permanent
 * welcome screen (or a permanent lack of one).
 */
export function readFirstArrival(
  appId: string,
  pubkey: string,
): FirstArrivalIntent | undefined {
  let raw: string | null;
  try {
    raw = localStorage.getItem(firstArrivalKey(appId, pubkey));
  } catch {
    return undefined; // storage unavailable (private mode, etc.)
  }
  if (!raw) return undefined;

  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) throw new Error('not an object');
    const { createdAt, consumedAt } = parsed as Record<string, unknown>;
    if (typeof createdAt !== 'number' || !Number.isFinite(createdAt)) {
      throw new Error('bad createdAt');
    }
    if (consumedAt !== undefined && (typeof consumedAt !== 'number' || !Number.isFinite(consumedAt))) {
      throw new Error('bad consumedAt');
    }
    return { createdAt, consumedAt };
  } catch {
    clearFirstArrival(appId, pubkey);
    return undefined;
  }
}

/**
 * Record that this pubkey just completed signup. Called from exactly one place
 * — the signup completion boundary — and never inferred from anything else.
 *
 * Idempotent per account: re-marking an account that already has an unconsumed
 * intent keeps the original timestamp rather than extending its life.
 */
export function markFirstArrival(appId: string, pubkey: string, now = Date.now()): void {
  const existing = readFirstArrival(appId, pubkey);
  if (existing && existing.consumedAt === undefined) return;
  writeFirstArrival(appId, pubkey, { createdAt: now });
}

/** Mark the experience as played or skipped. Idempotent. */
export function consumeFirstArrival(appId: string, pubkey: string, now = Date.now()): void {
  const existing = readFirstArrival(appId, pubkey);
  if (!existing || existing.consumedAt !== undefined) return;
  writeFirstArrival(appId, pubkey, { ...existing, consumedAt: now });
}

export function clearFirstArrival(appId: string, pubkey: string): void {
  try {
    localStorage.removeItem(firstArrivalKey(appId, pubkey));
  } catch {
    // storage unavailable — nothing to clear
  }
}

function writeFirstArrival(appId: string, pubkey: string, intent: FirstArrivalIntent): void {
  try {
    localStorage.setItem(firstArrivalKey(appId, pubkey), JSON.stringify(intent));
  } catch {
    // Storage full or unavailable. The arrival is a nicety; failing to record
    // it must never break signup.
  }
}

/**
 * Whether the arrival experience should still play: recorded, not yet
 * consumed, and not stale.
 */
export function isFirstArrivalPending(
  intent: FirstArrivalIntent | undefined,
  now = Date.now(),
): boolean {
  if (!intent) return false;
  if (intent.consumedAt !== undefined) return false;
  return now - intent.createdAt < FIRST_ARRIVAL_TTL_MS;
}

/**
 * How long after the arrival the app should settle before anything else asks
 * for attention. Gives the user a beat to recognise the interface they just
 * arrived in before the Ditto Explorer introduction appears.
 */
export const ARRIVAL_SETTLE_MS = 900;

/**
 * Whether an arrival finished so recently that follow-up surfaces (the Explorer
 * introduction) should hold back for a moment.
 *
 * Derived from the persisted `consumedAt` rather than in-memory state, so it
 * survives the remount that the reveal itself causes.
 */
export function isArrivalSettling(
  intent: FirstArrivalIntent | undefined,
  now = Date.now(),
): boolean {
  if (!intent?.consumedAt) return false;
  return now - intent.consumedAt < ARRIVAL_SETTLE_MS;
}

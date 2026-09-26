import type { NostrEvent } from '@nostrify/nostrify';

/** Posting streak (replaceable, see NIP.md). "1·FIRE" on a phone keypad. */
export const STREAK_KIND = 13473;

/** Longest gap between creative events before a streak is broken, in seconds (36h). */
export const STREAK_WINDOW = 129_600;

/** How far past `now` a streak's `end` may sit before it's treated as bogus (clock skew). */
const FUTURE_SLACK = 600;

/** Longest streak span we'll believe, in seconds (~20 years). */
const MAX_SPAN = 20 * 365 * 86_400;

/**
 * Creative kinds that keep a streak alive. Low-effort actions — reactions,
 * reposts, zaps, follows, list and metadata updates, votes, RSVPs — don't count.
 */
export const STREAK_KINDS: ReadonlySet<number> = new Set([
  1, // Text note
  1111, // Comment
  20, // Photo
  21, // Video
  22, // Short video
  34236, // Short (vine)
  1222, // Voice message
  1244, // Voice reply
  30023, // Article
  1068, // Poll
  9802, // Highlight
  36787, // Music track
  34139, // Music playlist
  30054, // Podcast episode
  1063, // Webxdc app
  36767, // Theme
  31922, // Calendar event (date)
  31923, // Calendar event (time)
  30402, // Listing
  33863, // Fundraiser
  3367, // Color moment
  37516, // Geocache
  37849, // Quiz
  30009, // Badge definition
  30617, // Git repository
  1617, // Git patch
  1621, // Git issue
  30817, // Custom NIP
]);

/** A streak: the first and latest creative event it spans, in Unix seconds. */
export interface Streak {
  start: number;
  end: number;
}

export function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

function parseTimestamp(value: string | undefined): number | undefined {
  if (!value || !/^\d{1,12}$/.test(value)) return undefined;
  return Number(value);
}

/**
 * Parse a kind 13473 event. Streaks are self-reported, so this only rejects
 * values that are malformed or impossible — not ones that are merely unlikely.
 */
export function parseStreakEvent(event: NostrEvent | null | undefined, now = nowSeconds()): Streak | undefined {
  if (!event || event.kind !== STREAK_KIND) return undefined;
  const start = parseTimestamp(event.tags.find(([name]) => name === 'start')?.[1]);
  const end = parseTimestamp(event.tags.find(([name]) => name === 'end')?.[1]);
  if (!start || !end) return undefined;
  if (start > end || end > now + FUTURE_SLACK || end - start > MAX_SPAN) return undefined;
  return { start, end };
}

/**
 * Fold one creative event into a streak. Events at or before the current
 * `end` can't move a streak backwards, so they're ignored.
 */
export function advanceStreak(prev: Streak | undefined, at: number): Streak {
  if (!prev) return { start: at, end: at };
  if (at <= prev.end) return prev;
  if (at - prev.end > STREAK_WINDOW) return { start: at, end: at };
  return { start: prev.start, end: at };
}

/**
 * Combine two views of the same user's streak (e.g. two devices, or a relay
 * copy and a locally repaired one). Streaks close enough to chain are joined;
 * otherwise the later one wins. Commutative and idempotent.
 */
export function mergeStreaks(a: Streak | undefined, b: Streak | undefined): Streak | undefined {
  if (!a) return b;
  if (!b) return a;
  const [first, second] = a.start <= b.start ? [a, b] : [b, a];
  if (second.start - first.end <= STREAK_WINDOW) {
    return { start: first.start, end: Math.max(first.end, second.end) };
  }
  return second;
}

export function sameStreak(a: Streak | undefined, b: Streak | undefined): boolean {
  return a?.start === b?.start && a?.end === b?.end;
}

/** Unix time at which the streak breaks unless something new is posted. */
export function streakExpiresAt(streak: Streak): number {
  return streak.end + STREAK_WINDOW;
}

export function isStreakLive(streak: Streak | undefined, now = nowSeconds()): streak is Streak {
  return !!streak && now <= streakExpiresAt(streak);
}

/** Length of a live streak in days (at least 1), or 0 if it has expired. */
export function streakDays(streak: Streak | undefined, now = nowSeconds()): number {
  if (!isStreakLive(streak, now)) return 0;
  return Math.max(1, Math.ceil((streak.end - streak.start) / 86_400));
}

export function buildStreakTags(streak: Streak): string[][] {
  return [
    ['start', String(streak.start)],
    ['end', String(streak.end)],
    ['alt', 'Posting streak'],
  ];
}

/** Whether an event of this user's should count toward their streak. */
export function isStreakActivity(event: NostrEvent, pubkey: string, now = nowSeconds()): boolean {
  return event.pubkey === pubkey && STREAK_KINDS.has(event.kind) && event.created_at <= now + FUTURE_SLACK;
}

const listeners = new Set<(event: NostrEvent) => void>();

/** Report a creative event the current user just published. */
export function notifyStreakActivity(event: NostrEvent): void {
  if (!STREAK_KINDS.has(event.kind)) return;
  for (const listener of listeners) listener(event);
}

export function subscribeStreakActivity(listener: (event: NostrEvent) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const startedListeners = new Set<(pubkey: string) => void>();

/** Report that a creative event just started a new streak for this user. */
export function notifyStreakStarted(pubkey: string): void {
  for (const listener of startedListeners) listener(pubkey);
}

export function subscribeStreakStarted(listener: (pubkey: string) => void): () => void {
  startedListeners.add(listener);
  return () => {
    startedListeners.delete(listener);
  };
}

import type { NostrEvent, NostrFilter } from '@nostrify/nostrify';
import type { NIndexedDB } from '@nostrify/indexeddb';

import type { OutboxPool } from '@/lib/outbox';
import {
  advanceStreak,
  isStreakActivity,
  nowSeconds,
  STREAK_KINDS,
  STREAK_WINDOW,
  type Streak,
} from '@/lib/streak';

/** Events requested per page, from each source. */
const PAGE_SIZE = 200;
/** Cap on pages walked in one direction, so a repair can't run away. */
const MAX_PAGES = 10;
/** Per-query timeout. */
const QUERY_TIMEOUT_MS = 8000;

export interface StreakRepairContext {
  nostr: OutboxPool;
  store: NIndexedDB;
  /** Relays the user publishes to — where other clients will have put their events. */
  relays: string[];
  pubkey: string;
  signal: AbortSignal;
}

interface Page {
  /** The user's creative events, newest first. */
  events: NostrEvent[];
  /**
   * Oldest `created_at` the page is complete down to. A source that returned
   * a full page may hold older events we didn't get, so the page only vouches
   * for the span above the highest such cutoff.
   */
  floor: number;
  /** Whether any source may have more events below `floor`. */
  more: boolean;
}

/**
 * Query the local store and the user's relays together. Relay results are
 * written into the local store, so a repair also fills in the data the user
 * exports from Settings.
 */
async function fetchPage(ctx: StreakRepairContext, filter: NostrFilter): Promise<Page> {
  const full: NostrFilter = { ...filter, authors: [ctx.pubkey], kinds: [...STREAK_KINDS], limit: PAGE_SIZE };
  const signal = AbortSignal.any([ctx.signal, AbortSignal.timeout(QUERY_TIMEOUT_MS)]);

  const [local, remote] = await Promise.all([
    ctx.store.query([full], { signal }),
    ctx.relays.length ? ctx.nostr.group(ctx.relays).query([full], { signal }) : Promise.resolve([]),
  ]);
  ctx.signal.throwIfAborted();

  for (const event of remote) {
    ctx.store.event(event).catch(() => {});
  }

  const since = filter.since ?? 0;
  let floor = since;
  for (const batch of [local, remote]) {
    if (batch.length >= PAGE_SIZE) {
      floor = Math.max(floor, Math.min(...batch.map((e) => e.created_at)));
    }
  }

  const now = nowSeconds();
  const byId = new Map<string, NostrEvent>();
  for (const event of [...local, ...remote]) {
    if (event.created_at >= floor && isStreakActivity(event, ctx.pubkey, now)) byId.set(event.id, event);
  }

  const events = [...byId.values()].sort((a, b) => b.created_at - a.created_at);
  return { events, floor, more: floor > since };
}

/**
 * Walk forward from `prev.end` (or the last window, with no prior streak) and
 * fold in every creative event since. Usually a single small page: it only
 * covers what happened since the streak was last recorded.
 */
export async function repairStreakForward(ctx: StreakRepairContext, prev: Streak | undefined): Promise<Streak | undefined> {
  const since = (prev ? prev.end : nowSeconds() - STREAK_WINDOW) + 1;
  const collected: NostrEvent[] = [];

  let until: number | undefined;
  for (let i = 0; i < MAX_PAGES; i++) {
    const page = await fetchPage(ctx, { since, until });
    collected.push(...page.events);
    if (!page.more) break;
    until = page.floor - 1;
  }

  let streak = prev;
  for (const event of collected.sort((a, b) => a.created_at - b.created_at)) {
    streak = advanceStreak(streak, event.created_at);
  }
  return streak;
}

/**
 * Walk backward from `streak.start`, pulling it earlier while creative events
 * keep chaining within the window. Starts with a one-event probe so the common
 * case (the start is already right) costs a single tiny query.
 */
export async function repairStreakBackward(ctx: StreakRepairContext, streak: Streak): Promise<Streak> {
  let start = streak.start;

  const probe = await fetchPage(ctx, { since: start - STREAK_WINDOW, until: start - 1 });
  if (!probe.events.length) return streak;

  let until = start - 1;
  for (let i = 0; i < MAX_PAGES; i++) {
    const page = await fetchPage(ctx, { until });
    for (const event of page.events) {
      if (start - event.created_at > STREAK_WINDOW) return { start, end: streak.end };
      start = Math.min(start, event.created_at);
    }
    if (!page.more) break;
    until = page.floor - 1;
  }
  return { start, end: streak.end };
}

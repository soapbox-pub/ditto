import type { NostrEvent, NostrFilter } from '@nostrify/nostrify';
import type { NostrRelayCLOSED, NostrRelayEOSE, NostrRelayEVENT } from '@nostrify/types';

/** Anything that can run a REQ against one relay, such as `pool.relay(url)`. */
export interface FeedRelay {
  req(
    filters: NostrFilter[],
    opts?: { signal?: AbortSignal },
  ): AsyncIterable<NostrRelayEVENT | NostrRelayEOSE | NostrRelayCLOSED>;
}

/** Where one relay's pagination stands. */
interface RelayCursor {
  /** `until` for this relay's next REQ. Unset until the relay has answered once or the feed has a boundary. */
  until?: number;
  /** Ids already received at `until`, which the next REQ returns again. */
  edge?: string[];
  /** Failed, timed-out or refused REQs in a row. */
  failures?: number;
  /** The relay has nothing older, or kept failing, so it's not asked again. */
  done?: boolean;
  /** A REQ at `until` missed its page's deadline and is still running. */
  pending?: boolean;
}

/** Failed REQs in a row after which a relay is given up on for this feed load. */
const MAX_FAILURES = 3;

/**
 * Pagination state of a multi-relay feed, passed from one page to the next.
 *
 * Every relay keeps its own `until`, so a relay that answers slowly (or
 * reaches back less far than the others) resumes where it left off instead
 * of being skipped past by a single shared cursor.
 */
export interface FeedCursor {
  /** Ties in-flight REQs to this feed load, so a refresh never reuses them. */
  session: string;
  /** Oldest timestamp emitted so far. Later pages only emit events at or before it. */
  boundary?: number;
  /** Ids emitted at `boundary`, which a later page may receive again. */
  boundaryIds: string[];
  relays: Record<string, RelayCursor>;
  /** Events received but not yet emitted, all at or before `boundary`. */
  buffer: NostrEvent[];
}

export interface FeedPageResult {
  /** This page, newest first. */
  events: NostrEvent[];
  /** State for the next page, or undefined when every relay is exhausted. */
  cursor?: FeedCursor;
}

interface RelayResult {
  events: NostrEvent[];
  status: 'eose' | 'closed' | 'error';
}

interface Run {
  promise: Promise<RelayResult>;
  result?: RelayResult;
}

/**
 * REQs keyed by session, relay and filter. A relay that misses a page's
 * deadline keeps running here, and the next page picks up its answer
 * instead of sending the same REQ again.
 */
const runs = new Map<string, Run>();

/** How long an answered REQ nobody collected is kept. */
const RUN_TTL = 60_000;

function startRun(key: string, relay: FeedRelay, filter: NostrFilter, timeout: number): Run {
  const existing = runs.get(key);
  if (existing) return existing;

  const run: Run = {
    promise: (async (): Promise<RelayResult> => {
      const events: NostrEvent[] = [];
      try {
        for await (const msg of relay.req([filter], { signal: AbortSignal.timeout(timeout) })) {
          if (msg[0] === 'EVENT') events.push(msg[2]);
          else if (msg[0] === 'EOSE') return { events, status: 'eose' };
          else if (msg[0] === 'CLOSED') return { events, status: 'closed' };
        }
      } catch {
        // Timed out or failed to connect; keep what arrived.
      }
      return { events, status: 'error' };
    })(),
  };
  void run.promise.then((result) => {
    run.result = result;
    setTimeout(() => {
      if (runs.get(key) === run) runs.delete(key);
    }, RUN_TTL);
  });
  runs.set(key, run);
  return run;
}

/**
 * Resolve once every run has answered, or `grace` ms after the first EOSE,
 * or when `signal` aborts — the same race the pool uses for queries.
 */
function settle(list: Run[], grace: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    let pending = list.length;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const finish = () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', finish);
      resolve();
    };
    if (pending === 0 || signal?.aborted) return finish();
    signal?.addEventListener('abort', finish);
    for (const run of list) {
      void run.promise.then((result) => {
        pending--;
        if (pending === 0) finish();
        else if (result.status === 'eose' && !timer) timer = setTimeout(finish, grace);
      });
    }
  });
}

const byNewest = (a: NostrEvent, b: NostrEvent) => b.created_at - a.created_at;

interface FeedPageOptions {
  relays: string[];
  relay: (url: string) => FeedRelay;
  /** The feed filter, with `limit` as the page size. Must not set `until`. */
  filter: NostrFilter;
  cursor?: FeedCursor;
  /** ms to wait for other relays after the first EOSE. */
  grace?: number;
  /** ms before a relay's REQ is abandoned. */
  timeout?: number;
  signal?: AbortSignal;
}

/** Most REQ rounds spent filling one page after the first. */
const MAX_ROUNDS = 3;

/**
 * Fetch the next page of a feed from several relays, without skipping events.
 *
 * A page ends no lower than the oldest point any responding relay has been
 * read down to, so nothing a relay holds can fall between pages. Events
 * fetched past that point are kept for the next page rather than fetched
 * again, and relays whose unread range is already covered by that buffer
 * aren't asked at all.
 *
 * The first page resolves on the same deadline as a pool query. Relays that
 * miss it keep running, and the next page continues from their answer. A
 * relay that times out or fails is asked again on the next page, until it
 * has failed {@link MAX_FAILURES} times in a row. Later pages, which load
 * ahead of the scroll position, ask again while they're under half full.
 *
 * Nothing is ever added above a page already returned: whatever a late or
 * failed relay holds there is dropped, and a relay that falls behind resumes
 * from the page's end rather than from where it left off (see
 * {@link clampToBoundary}).
 */
export async function fetchFeedPage(opts: FeedPageOptions): Promise<FeedPageResult> {
  const limit = opts.filter.limit ?? 20;
  const events: NostrEvent[] = [];
  let cursor = opts.cursor;
  // Relays that failed during this page wait for the next one rather than
  // spend their failure allowance on this page's later rounds.
  const failed = new Set<string>();

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const result = await fetchRound(opts, cursor, limit - events.length, failed);
    events.push(...result.events);
    cursor = result.cursor;
    if (
      !opts.cursor || !cursor || result.late || !result.asked ||
      events.length * 2 >= limit || opts.signal?.aborted
    ) break;
  }

  return { events, cursor };
}

/**
 * Move a relay's position down to the feed's boundary if it's above it. What
 * a relay holds above the boundary sits among pages already returned, so it
 * would only be dropped; asking from the boundary keeps a relay that fell
 * behind (it was late, it failed, it's new) from re-fetching those pages and
 * from holding the next one back while it catches up.
 */
function clampToBoundary(state: RelayCursor, boundary: number | undefined, boundaryIds: string[]): RelayCursor {
  if (boundary === undefined || state.done) return state;
  if (state.until === undefined || state.until > boundary) {
    return { ...state, until: boundary, edge: boundaryIds };
  }
  if (state.until === boundary) {
    return { ...state, edge: [...new Set([...(state.edge ?? []), ...boundaryIds])] };
  }
  return state;
}

/** One REQ round: ask the relays holding the page back, and emit what's safe. */
async function fetchRound(
  opts: FeedPageOptions,
  cursor: FeedCursor | undefined,
  need: number,
  failed: Set<string>,
): Promise<FeedPageResult & { asked: number; late: boolean }> {
  const { filter, grace = 300, timeout = 8000 } = opts;
  const limit = filter.limit ?? 20;
  const now = Math.floor(Date.now() / 1000);
  const prev = cursor ?? {
    session: Math.random().toString(36).slice(2),
    boundaryIds: [],
    relays: {},
    buffer: [],
  };
  const boundary = prev.boundary;
  const relays: Record<string, RelayCursor> = { ...prev.relays };
  const active = opts.relays.filter((url) => !relays[url]?.done);
  for (const url of active) {
    // A relay with a REQ still running keeps its filter, so this round
    // collects that REQ instead of sending another.
    const state = relays[url] ?? {};
    relays[url] = state.pending ? state : clampToBoundary(state, boundary, prev.boundaryIds);
  }

  // A relay read down below the last buffered event this page needs can't
  // add anything to it, so only relays not yet read that far are asked.
  const buffered = [...prev.buffer].sort(byNewest);
  const reach = buffered.length >= need ? buffered[need - 1].created_at : -Infinity;
  const asked = active
    .filter((url) => !failed.has(url))
    .filter((url) => relays[url]?.until === undefined || relays[url].until! >= reach)
    .map((url) => {
      const until = relays[url]?.until;
      const relayFilter: NostrFilter = until === undefined ? filter : { ...filter, until };
      const key = `${prev.session}\n${url}\n${JSON.stringify(relayFilter)}`;
      return { url, key, run: startRun(key, opts.relay(url), relayFilter, timeout) };
    });

  await settle(asked.map(({ run }) => run), grace, opts.signal);

  const incoming: NostrEvent[] = [];
  const lateUrls = new Set<string>();

  for (const { url, key, run } of asked) {
    const result = run.result;
    if (!result) {
      lateUrls.add(url);
      relays[url] = { ...relays[url], pending: true };
      continue;
    }
    runs.delete(key);

    const state: RelayCursor = { ...relays[url], pending: undefined };
    const edge = new Set(state.edge);
    const fresh = result.events.filter((ev) => !edge.has(ev.id));
    incoming.push(...fresh);

    if (result.status !== 'eose') {
      // Timed out, failed or refused: ask again next page, from its end,
      // giving up only after a few failures in a row. Like a late relay it
      // doesn't hold the page back.
      const failures = (state.failures ?? 0) + 1;
      relays[url] = failures >= MAX_FAILURES ? { done: true } : { ...state, failures };
      failed.add(url);
      continue;
    }
    if (result.events.length < limit) {
      relays[url] = { done: true };
      continue;
    }
    const floor = Math.min(...result.events.map((ev) => ev.created_at));
    const atFloor = result.events.filter((ev) => ev.created_at === floor).map((ev) => ev.id);
    const next: RelayCursor = floor === state.until
      // A full page all at the same second; step past it rather than loop.
      ? (fresh.length === 0 ? { until: floor - 1 } : { until: floor, edge: [...edge, ...atFloor] })
      : { until: floor, edge: atFloor };
    // A late REQ from before the boundary moved may have stopped above it.
    relays[url] = clampToBoundary(next, boundary, prev.boundaryIds);
  }

  // Merge, dropping duplicates, future-dated events and ones already emitted.
  const seen = new Set(prev.boundaryIds);
  const merged: NostrEvent[] = [];
  for (const ev of [...prev.buffer, ...incoming]) {
    if (seen.has(ev.id) || ev.created_at > now) continue;
    seen.add(ev.id);
    merged.push(ev);
  }

  // Anything above the boundary belongs among pages already returned.
  const candidates = (boundary === undefined ? merged : merged.filter((ev) => ev.created_at <= boundary)).sort(byNewest);

  // The page may reach down only as far as every answering relay has been read.
  let floor = -Infinity;
  for (const url of active) {
    const state = relays[url];
    if (!state || state.pending || failed.has(url) || state.done || state.until === undefined) continue;
    floor = Math.max(floor, state.until);
  }

  const events = candidates.filter((ev) => ev.created_at >= floor).slice(0, need);
  const emitted = new Set(events.map((ev) => ev.id));
  const buffer = candidates.filter((ev) => !emitted.has(ev.id));
  const nextBoundary = events.length ? events[events.length - 1].created_at : boundary;
  const boundaryIds = events.length
    ? [
      ...(nextBoundary === boundary ? prev.boundaryIds : []),
      ...events.filter((ev) => ev.created_at === nextBoundary).map((ev) => ev.id),
    ]
    : prev.boundaryIds;

  const exhausted = buffer.length === 0 && lateUrls.size === 0 && opts.relays.every((url) => relays[url]?.done);

  return {
    asked: asked.length,
    late: lateUrls.size > 0,
    events,
    cursor: exhausted ? undefined : { session: prev.session, boundary: nextBoundary, boundaryIds, relays, buffer },
  };
}

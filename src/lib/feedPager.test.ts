import { describe, expect, it } from 'vitest';
import type { NostrEvent, NostrFilter } from '@nostrify/nostrify';

import { fetchFeedPage, type FeedCursor, type FeedRelay } from './feedPager';

function event(id: string, created_at: number): NostrEvent {
  return { id, pubkey: 'p', created_at, kind: 1, tags: [], content: '', sig: '' };
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

interface FakeRelay {
  relay: FeedRelay;
  /** Every filter this relay was sent, in order. */
  calls: NostrFilter[];
}

/**
 * A relay holding `events`. `delays[i]` holds the i-th REQ back that long;
 * the first `failFirst` REQs fail.
 */
function fakeRelay(events: NostrEvent[], opts: { delays?: number[]; failFirst?: number } = {}): FakeRelay {
  const calls: NostrFilter[] = [];
  const relay: FeedRelay = {
    async *req(filters) {
      const [filter] = filters;
      const call = calls.push(filter) - 1;
      if (call < (opts.failFirst ?? 0)) throw new Error('refused');
      const delay = opts.delays?.[call];
      if (delay) await sleep(delay);
      const matched = events
        .filter((ev) => filter.until === undefined || ev.created_at <= filter.until)
        .sort((a, b) => b.created_at - a.created_at)
        .slice(0, filter.limit);
      for (const ev of matched) yield ['EVENT', 'sub', ev];
      yield ['EOSE', 'sub'];
    },
  };
  return { relay, calls };
}

/** Page through a feed until it ends, returning each page's events. */
async function pageAll(
  relays: Record<string, FakeRelay>,
  opts: { limit?: number; grace?: number; between?: () => Promise<void> } = {},
): Promise<NostrEvent[][]> {
  const pages: NostrEvent[][] = [];
  let cursor: FeedCursor | undefined;
  do {
    const page = await fetchFeedPage({
      relays: Object.keys(relays),
      relay: (url) => relays[url].relay,
      filter: { kinds: [1], limit: opts.limit ?? 10 },
      cursor,
      grace: opts.grace ?? 5,
      timeout: 1_000,
    });
    pages.push(page.events);
    cursor = page.cursor;
    await opts.between?.();
  } while (cursor && pages.length < 50);
  return pages;
}

const ids = (events: NostrEvent[]) => events.map((ev) => ev.id);

/** Every event across pages is distinct and never newer than one before it. */
function expectOrderedAndUnique(pages: NostrEvent[][]): void {
  const all = pages.flat();
  expect(new Set(ids(all)).size).toBe(all.length);
  for (let i = 1; i < all.length; i++) {
    expect(all[i].created_at).toBeLessThanOrEqual(all[i - 1].created_at);
  }
}

/** Events at `from`, `from - step`, … (`count` of them), ids prefixed. */
function series(prefix: string, from: number, step: number, count: number): NostrEvent[] {
  return Array.from({ length: count }, (_, i) => event(`${prefix}${from - i * step}`, from - i * step));
}

describe('fetchFeedPage', () => {
  it('pages every event of overlapping relays exactly once, newest first', async () => {
    const all = series('e', 1000, 1, 60);
    const a = fakeRelay(all.filter((ev) => ev.created_at % 2 === 0 || ev.created_at % 5 === 0));
    const b = fakeRelay(all.filter((ev) => ev.created_at % 2 === 1 || ev.created_at % 5 === 0));

    const pages = await pageAll({ a, b });

    expectOrderedAndUnique(pages);
    expect(ids(pages.flat())).toEqual(ids(all));
    for (const page of pages.slice(0, -1)) expect(page.length).toBeGreaterThan(0);
  });

  it('resumes a relay whose first REQ failed from the end of the page, not the top', async () => {
    const aEvents = series('a', 1000, 2, 40);
    const bEvents = series('b', 999, 2, 40);
    const a = fakeRelay(aEvents);
    const b = fakeRelay(bEvents, { failFirst: 1 });

    const pages = await pageAll({ a, b });
    const boundary = pages[0].at(-1)!.created_at;

    expect(ids(pages[0])).toEqual(ids(aEvents.slice(0, 10)));
    expect(b.calls[1].until).toBe(boundary);
    expectOrderedAndUnique(pages);
    for (const page of pages.slice(0, -1)) expect(page.length).toBeGreaterThan(0);

    // Everything below the first page arrives; what only b held above it is gone.
    const shown = new Set(ids(pages.flat()));
    for (const ev of aEvents) expect(shown.has(ev.id)).toBe(true);
    for (const ev of bEvents) expect(shown.has(ev.id)).toBe(ev.created_at <= boundary);
  });

  it("collects a late relay's REQ on the next page and drops what it held above the first", async () => {
    const aEvents = series('a', 1000, 2, 40);
    // b's newest page sits entirely above a's first page; the rest is far older.
    const bEvents = [...series('b', 999, 1, 10), ...series('old', 500, 1, 30)];
    const a = fakeRelay(aEvents);
    const b = fakeRelay(bEvents, { delays: [50] });

    const pages = await pageAll({ a, b }, { between: () => sleep(100) });
    const boundary = pages[0].at(-1)!.created_at;

    // Page one is a's alone, and b's slow REQ was reused rather than sent again.
    expect(ids(pages[0])).toEqual(ids(aEvents.slice(0, 10)));
    expect(b.calls[0].until).toBeGreaterThan(boundary);
    expect(b.calls.slice(1).every((f) => f.until !== undefined && f.until <= boundary)).toBe(true);

    expectOrderedAndUnique(pages);
    for (const page of pages.slice(0, -1)) expect(page.length).toBeGreaterThan(0);

    const shown = new Set(ids(pages.flat()));
    for (const ev of aEvents) expect(shown.has(ev.id)).toBe(true);
    for (const ev of bEvents) expect(shown.has(ev.id)).toBe(ev.created_at <= boundary);
  });

  it('steps past a full page at a single second instead of looping', async () => {
    const r = fakeRelay([...series('same', 500, 0, 25).map((ev, i) => ({ ...ev, id: `same${i}` })), ...series('older', 400, 1, 5)]);

    const pages = await pageAll({ r });

    expect(pages.length).toBeLessThan(10);
    expectOrderedAndUnique(pages);
    expect(ids(pages.flat())).toEqual(expect.arrayContaining(ids(series('older', 400, 1, 5))));
  });

  it("doesn't let one relay's future-dated events hold back the others", async () => {
    const now = Math.floor(Date.now() / 1000);
    const future = series('future', now + 600, 1, 20);
    const past = series('past', now - 100, 1, 25);
    // Without an `until` on its first REQ, `a` answers with only future events.
    const a = fakeRelay([...future, ...past]);
    const b = fakeRelay(series('b', now - 50, 1, 25));

    const pages = await pageAll({ a, b });

    expect(pages[0].length).toBeGreaterThan(0);
    expect(a.calls[0].until).toBeLessThanOrEqual(now + 1);
    expect(pages.flat().some((ev) => ev.id.startsWith('future'))).toBe(false);
    expectOrderedAndUnique(pages);
  });

  it('ends a feed that keeps returning empty pages', async () => {
    const r: FakeRelay = {
      calls: [],
      relay: {
        async *req(filters) {
          r.calls.push(filters[0]);
          // Always a full page, all of it future-dated, whatever `until` says.
          const now = Math.floor(Date.now() / 1000);
          for (const ev of series(`f${r.calls.length}-`, now + 600, 1, 10)) yield ['EVENT', 'sub', ev];
          yield ['EOSE', 'sub'];
        },
      },
    };

    const pages = await pageAll({ r });

    expect(pages.length).toBeLessThan(10);
    expect(pages.flat()).toEqual([]);
  });
});

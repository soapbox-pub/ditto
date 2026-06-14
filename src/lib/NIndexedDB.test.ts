import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { NostrEvent } from '@nostrify/nostrify';
import { type IDBPDatabase, openDB } from 'idb';

import { type EventsDB, EVENTS_STORE, INDEX, NIndexedDB, type NIndexedDBOpts } from './NIndexedDB';

// Each test gets a fresh, uniquely-named database so there's no cross-test
// state. fake-indexeddb (loaded in src/test/setup.ts) provides the IndexedDB
// implementation under jsdom.

let store: NIndexedDB;
let dbName: string;
let counter = 0;
const openedDbNames: string[] = [];

/** Open the events database with the same schema NostrProvider installs. */
function openDatabase(name: string): Promise<IDBPDatabase<EventsDB>> {
  return openDB<EventsDB>(name, 2, {
    upgrade(db) {
      for (const existing of Array.from(db.objectStoreNames) as string[]) {
        db.deleteObjectStore(existing as typeof EVENTS_STORE);
      }
      const store = db.createObjectStore(EVENTS_STORE, { keyPath: 'id' });
      store.createIndex(INDEX.createdAt, 'created_at');
      store.createIndex(INDEX.pubkey, ['pubkey', 'created_at']);
      store.createIndex(INDEX.kind, ['kind', 'created_at']);
      store.createIndex(INDEX.pubkeyKind, ['pubkey', 'kind', 'created_at']);
      store.createIndex(INDEX.tag, '_tagsCreated', { multiEntry: true });
    },
  });
}

beforeEach(async () => {
  dbName = `test-events-${Date.now()}-${counter++}`;
  openedDbNames.length = 0;
  openedDbNames.push(dbName);
  store = new NIndexedDB(openDatabase(dbName));
});

afterEach(async () => {
  for (const name of openedDbNames) {
    await new Promise<void>((resolve) => {
      const req = indexedDB.deleteDatabase(name);
      req.onsuccess = req.onerror = req.onblocked = () => resolve();
    });
  }
});

/** Open an additional store with custom options, tracked for cleanup. */
function openStore(opts: NIndexedDBOpts = {}): NIndexedDB {
  const name = `test-events-${Date.now()}-${counter++}`;
  openedDbNames.push(name);
  return new NIndexedDB(openDatabase(name), opts);
}

/** Build a minimal valid-shaped event. The id is deterministic-ish for tests. */
function makeEvent(overrides: Partial<NostrEvent> = {}): NostrEvent {
  const id = overrides.id ?? `${'0'.repeat(63)}${(counter++ % 16).toString(16)}`;
  return {
    id,
    pubkey: 'a'.repeat(64),
    created_at: 1000,
    kind: 1,
    tags: [],
    content: '',
    sig: 'f'.repeat(128),
    ...overrides,
  };
}

const PK1 = 'a'.repeat(64);
const PK2 = 'b'.repeat(64);

/** Insert events and return once they've been flushed. */
async function add(...events: NostrEvent[]): Promise<void> {
  await Promise.all(events.map((e) => store.event(e)));
}

describe('NIndexedDB', () => {
  describe('ids filter', () => {
    it('returns events by exact id', async () => {
      const a = makeEvent({ id: '1'.repeat(64) });
      const b = makeEvent({ id: '2'.repeat(64) });
      await add(a, b);

      const result = await store.query([{ ids: [a.id] }]);
      expect(result.map((e) => e.id)).toEqual([a.id]);
    });

    it('returns nothing for an empty ids array', async () => {
      await add(makeEvent({ id: '1'.repeat(64) }));
      const result = await store.query([{ ids: [] }]);
      expect(result).toEqual([]);
    });
  });

  describe('authors filter', () => {
    it('returns events by a single author newest-first', async () => {
      const old = makeEvent({ id: '1'.repeat(64), pubkey: PK1, created_at: 100 });
      const recent = makeEvent({ id: '2'.repeat(64), pubkey: PK1, created_at: 200 });
      const other = makeEvent({ id: '3'.repeat(64), pubkey: PK2, created_at: 150 });
      await add(old, recent, other);

      const result = await store.query([{ authors: [PK1] }]);
      expect(result.map((e) => e.id)).toEqual([recent.id, old.id]);
    });
  });

  describe('kinds filter', () => {
    it('returns events of the given kinds', async () => {
      const k1 = makeEvent({ id: '1'.repeat(64), kind: 1 });
      const k7 = makeEvent({ id: '2'.repeat(64), kind: 7 });
      await add(k1, k7);

      const result = await store.query([{ kinds: [7] }]);
      expect(result.map((e) => e.id)).toEqual([k7.id]);
    });

    it('combines multiple kinds in one filter', async () => {
      const k1 = makeEvent({ id: '1'.repeat(64), kind: 1, created_at: 100 });
      const k6 = makeEvent({ id: '2'.repeat(64), kind: 6, created_at: 200 });
      const k7 = makeEvent({ id: '3'.repeat(64), kind: 7, created_at: 150 });
      await add(k1, k6, k7);

      const result = await store.query([{ kinds: [1, 6] }]);
      expect(result.map((e) => e.id)).toEqual([k6.id, k1.id]);
    });
  });

  describe('authors + kinds (pubkeyKind index)', () => {
    it('intersects authors and kinds', async () => {
      const match = makeEvent({ id: '1'.repeat(64), pubkey: PK1, kind: 1 });
      const wrongKind = makeEvent({ id: '2'.repeat(64), pubkey: PK1, kind: 7 });
      const wrongAuthor = makeEvent({ id: '3'.repeat(64), pubkey: PK2, kind: 1 });
      await add(match, wrongKind, wrongAuthor);

      const result = await store.query([{ authors: [PK1], kinds: [1] }]);
      expect(result.map((e) => e.id)).toEqual([match.id]);
    });
  });

  describe('tag filters', () => {
    it('returns events with a matching #e tag', async () => {
      const target = 'c'.repeat(64);
      const tagged = makeEvent({ id: '1'.repeat(64), tags: [['e', target]] });
      const untagged = makeEvent({ id: '2'.repeat(64), tags: [] });
      await add(tagged, untagged);

      const result = await store.query([{ '#e': [target] }]);
      expect(result.map((e) => e.id)).toEqual([tagged.id]);
    });

    it('does not match a tag value that is only a prefix', async () => {
      const tagged = makeEvent({ id: '1'.repeat(64), tags: [['t', 'foobar']] });
      await add(tagged);

      const result = await store.query([{ '#t': ['foo'] }]);
      expect(result).toEqual([]);
    });

    it('picks the most selective tag and post-filters the rest', async () => {
      // Two tag conditions: #t has many values, #e has one. The planner scans
      // #e, then post-filters #t.
      const match = makeEvent({ id: '1'.repeat(64), tags: [['e', 'c'.repeat(64)], ['t', 'nostr']] });
      const wrongT = makeEvent({ id: '2'.repeat(64), tags: [['e', 'c'.repeat(64)], ['t', 'other']] });
      await add(match, wrongT);

      const result = await store.query([{ '#e': ['c'.repeat(64)], '#t': ['nostr', 'bitcoin'] }]);
      expect(result.map((e) => e.id)).toEqual([match.id]);
    });

    it('does not confuse name+value boundaries (no concatenation collision)', async () => {
      // Under a naive `name + value` concatenation, #e="aXXX" and #ea="XXX"
      // would both produce the token "eaXXX" and collide. Separate key
      // elements keep them distinct.
      const value = 'X'.repeat(63);
      const eTag = makeEvent({ id: '1'.repeat(64), tags: [['e', 'a' + value]] });
      const eaTag = makeEvent({ id: '2'.repeat(64), tags: [['ea', value]] });
      await add(eTag, eaTag);

      const eResult = await store.query([{ '#e': ['a' + value] }]);
      expect(eResult.map((e) => e.id)).toEqual([eTag.id]);
    });

    it('supports multi-letter tag names', async () => {
      // Default indexTags only indexes single-letter tags, so use a custom
      // policy that also indexes #proxy.
      const custom = await openStore({
        indexTags: (event) =>
          event.tags.filter(([name, value]) => (name.length === 1 || name === 'proxy') && !!value),
      });
      const proxied = makeEvent({ id: '1'.repeat(64), tags: [['proxy', 'https://example.com/1']] });
      const other = makeEvent({ id: '2'.repeat(64), tags: [['proxy', 'https://example.com/2']] });
      await Promise.all([proxied, other].map((e) => custom.event(e)));

      const result = await custom.query([{ '#proxy': ['https://example.com/1'] }]);
      expect(result.map((e) => e.id)).toEqual([proxied.id]);
    });
  });

  describe('configurable indexTags', () => {
    it('only indexes tags returned by the policy', async () => {
      // Index #t but NOT #e.
      const custom = await openStore({
        indexTags: (event) => event.tags.filter(([name]) => name === 't'),
      });
      const event = makeEvent({ id: '1'.repeat(64), tags: [['t', 'nostr'], ['e', 'c'.repeat(64)]] });
      await custom.event(event);

      // #t is indexed → found.
      expect((await custom.query([{ '#t': ['nostr'] }])).map((e) => e.id)).toEqual([event.id]);
      // #e is not indexed → a tag-driven query returns nothing.
      expect(await custom.query([{ '#e': ['c'.repeat(64)] }])).toEqual([]);
    });

    it('default policy excludes tag values of 200+ chars', async () => {
      const longValue = 'x'.repeat(200);
      const okValue = 'y'.repeat(199);
      const event = makeEvent({ id: '1'.repeat(64), tags: [['t', longValue], ['t', okValue]] });
      await add(event);

      // The 199-char value is indexed.
      expect((await store.query([{ '#t': [okValue] }])).map((e) => e.id)).toEqual([event.id]);
      // The 200-char value is not.
      expect(await store.query([{ '#t': [longValue] }])).toEqual([]);
    });
  });

  describe('since / until', () => {
    it('applies inclusive time bounds', async () => {
      const e1 = makeEvent({ id: '1'.repeat(64), pubkey: PK1, created_at: 100 });
      const e2 = makeEvent({ id: '2'.repeat(64), pubkey: PK1, created_at: 200 });
      const e3 = makeEvent({ id: '3'.repeat(64), pubkey: PK1, created_at: 300 });
      await add(e1, e2, e3);

      const result = await store.query([{ authors: [PK1], since: 150, until: 250 }]);
      expect(result.map((e) => e.id)).toEqual([e2.id]);
    });
  });

  describe('limit', () => {
    it('truncates to the newest N events', async () => {
      const events = Array.from({ length: 5 }, (_, i) =>
        makeEvent({ id: `${i}`.repeat(64), pubkey: PK1, created_at: 100 + i }));
      await add(...events);

      const result = await store.query([{ authors: [PK1], limit: 2 }]);
      expect(result.map((e) => e.created_at)).toEqual([104, 103]);
    });
  });

  describe('full scan fallback', () => {
    it('returns everything when no major field is given', async () => {
      const e1 = makeEvent({ id: '1'.repeat(64), created_at: 100 });
      const e2 = makeEvent({ id: '2'.repeat(64), created_at: 200 });
      await add(e1, e2);

      const result = await store.query([{}]);
      expect(result.map((e) => e.id)).toEqual([e2.id, e1.id]);
    });
  });

  describe('multiple filters (OR + dedupe)', () => {
    it('unions results and de-duplicates by id', async () => {
      const a = makeEvent({ id: '1'.repeat(64), pubkey: PK1, kind: 1, created_at: 100 });
      const b = makeEvent({ id: '2'.repeat(64), pubkey: PK2, kind: 7, created_at: 200 });
      await add(a, b);

      // Both filters match `a`; it should appear once.
      const result = await store.query([{ authors: [PK1] }, { ids: [a.id] }, { kinds: [7] }]);
      expect(result.map((e) => e.id).sort()).toEqual([a.id, b.id].sort());
      expect(result).toHaveLength(2);
    });
  });

  describe('replaceable supersession', () => {
    it('keeps only the newest replaceable event per (pubkey, kind)', async () => {
      const old = makeEvent({ id: '1'.repeat(64), pubkey: PK1, kind: 0, created_at: 100, content: 'old' });
      await add(old);
      const fresh = makeEvent({ id: '2'.repeat(64), pubkey: PK1, kind: 0, created_at: 200, content: 'new' });
      await add(fresh);

      const result = await store.query([{ kinds: [0], authors: [PK1] }]);
      expect(result.map((e) => e.content)).toEqual(['new']);
    });

    it('does not overwrite a newer replaceable event with an older one', async () => {
      const fresh = makeEvent({ id: '2'.repeat(64), pubkey: PK1, kind: 0, created_at: 200, content: 'new' });
      await add(fresh);
      const old = makeEvent({ id: '1'.repeat(64), pubkey: PK1, kind: 0, created_at: 100, content: 'old' });
      await add(old);

      const result = await store.query([{ kinds: [0], authors: [PK1] }]);
      expect(result.map((e) => e.content)).toEqual(['new']);
    });

    it('keeps separate addressable events per d-tag', async () => {
      const listA = makeEvent({ id: '1'.repeat(64), pubkey: PK1, kind: 30000, created_at: 100, tags: [['d', 'a']] });
      const listB = makeEvent({ id: '2'.repeat(64), pubkey: PK1, kind: 30000, created_at: 100, tags: [['d', 'b']] });
      await add(listA, listB);

      const result = await store.query([{ kinds: [30000], authors: [PK1] }]);
      expect(result).toHaveLength(2);
    });

    it('supersedes addressable events sharing a d-tag', async () => {
      const oldList = makeEvent({ id: '1'.repeat(64), pubkey: PK1, kind: 30000, created_at: 100, tags: [['d', 'a']], content: 'old' });
      await add(oldList);
      const newList = makeEvent({ id: '2'.repeat(64), pubkey: PK1, kind: 30000, created_at: 200, tags: [['d', 'a']], content: 'new' });
      await add(newList);

      const result = await store.query([{ kinds: [30000], authors: [PK1], '#d': ['a'] }]);
      expect(result.map((e) => e.content)).toEqual(['new']);
    });
  });

  describe('stored events are returned clean', () => {
    it('does not leak derived index fields', async () => {
      const e = makeEvent({ id: '1'.repeat(64), tags: [['e', 'c'.repeat(64)]] });
      await add(e);

      const [result] = await store.query([{ ids: [e.id] }]);
      expect(result).not.toHaveProperty('_tagsCreated');
      expect(Object.keys(result).sort()).toEqual(
        ['content', 'created_at', 'id', 'kind', 'pubkey', 'sig', 'tags'],
      );
    });
  });

  describe('count and remove', () => {
    it('counts matching events', async () => {
      await add(
        makeEvent({ id: '1'.repeat(64), pubkey: PK1 }),
        makeEvent({ id: '2'.repeat(64), pubkey: PK1 }),
      );
      const { count } = await store.count([{ authors: [PK1] }]);
      expect(count).toBe(2);
    });

    it('removes matching events', async () => {
      const a = makeEvent({ id: '1'.repeat(64), pubkey: PK1 });
      const b = makeEvent({ id: '2'.repeat(64), pubkey: PK2 });
      await add(a, b);

      await store.remove([{ authors: [PK1] }]);

      const remaining = await store.query([{}]);
      expect(remaining.map((e) => e.id)).toEqual([b.id]);
    });
  });

  describe('ephemeral events', () => {
    it('are never stored', async () => {
      await add(makeEvent({ id: '1'.repeat(64), kind: 20000 }));
      const result = await store.query([{ kinds: [20000] }]);
      expect(result).toEqual([]);
    });
  });

  describe('NIP-09 deletions (kind 5)', () => {
    it('deletes own event referenced by an e tag', async () => {
      const note = makeEvent({ id: '1'.repeat(64), pubkey: PK1, kind: 1 });
      await add(note);

      await add(makeEvent({
        id: '5'.repeat(64),
        pubkey: PK1,
        kind: 5,
        created_at: 2000,
        tags: [['e', note.id], ['k', '1']],
      }));

      expect(await store.query([{ ids: [note.id] }])).toEqual([]);
    });

    it('does not delete another author\'s event referenced by an e tag', async () => {
      const note = makeEvent({ id: '1'.repeat(64), pubkey: PK2, kind: 1 });
      await add(note);

      // PK1 maliciously requests deletion of PK2's note.
      await add(makeEvent({
        id: '5'.repeat(64),
        pubkey: PK1,
        kind: 5,
        created_at: 2000,
        tags: [['e', note.id]],
      }));

      expect((await store.query([{ ids: [note.id] }])).map((e) => e.id)).toEqual([note.id]);
    });

    it('deletes own addressable event referenced by an a tag', async () => {
      const article = makeEvent({
        id: '1'.repeat(64),
        pubkey: PK1,
        kind: 30023,
        created_at: 1000,
        tags: [['d', 'hello']],
      });
      await add(article);

      await add(makeEvent({
        id: '5'.repeat(64),
        pubkey: PK1,
        kind: 5,
        created_at: 2000,
        tags: [['a', `30023:${PK1}:hello`], ['k', '30023']],
      }));

      expect(await store.query([{ kinds: [30023], authors: [PK1] }])).toEqual([]);
    });

    it('does not delete a different d-tag at the same coordinate', async () => {
      const keep = makeEvent({
        id: '2'.repeat(64),
        pubkey: PK1,
        kind: 30023,
        created_at: 1000,
        tags: [['d', 'keep']],
      });
      await add(keep);

      await add(makeEvent({
        id: '5'.repeat(64),
        pubkey: PK1,
        kind: 5,
        created_at: 2000,
        tags: [['a', `30023:${PK1}:other`]],
      }));

      expect((await store.query([{ kinds: [30023] }])).map((e) => e.id)).toEqual([keep.id]);
    });

    it('keeps a replacement newer than the deletion request (a tag)', async () => {
      const newer = makeEvent({
        id: '3'.repeat(64),
        pubkey: PK1,
        kind: 30023,
        created_at: 3000,
        tags: [['d', 'hello']],
      });
      await add(newer);

      await add(makeEvent({
        id: '5'.repeat(64),
        pubkey: PK1,
        kind: 5,
        created_at: 2000,
        tags: [['a', `30023:${PK1}:hello`]],
      }));

      expect((await store.query([{ kinds: [30023] }])).map((e) => e.id)).toEqual([newer.id]);
    });

    it('retains the deletion request event itself', async () => {
      const del = makeEvent({
        id: '5'.repeat(64),
        pubkey: PK1,
        kind: 5,
        created_at: 2000,
        tags: [['e', '1'.repeat(64)]],
      });
      await add(del);

      expect((await store.query([{ kinds: [5] }])).map((e) => e.id)).toEqual([del.id]);
    });
  });
});

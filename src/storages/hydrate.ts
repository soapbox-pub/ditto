import { NostrEvent, NStore } from '@nostrify/nostrify';
import { Conf } from '@/config.ts';
import { db } from '@/db.ts';
import { type DittoEvent } from '@/interfaces/DittoEvent.ts';
import { type DittoRelation } from '@/interfaces/DittoFilter.ts';

interface HydrateEventOpts {
  events: DittoEvent[];
  relations: DittoRelation[];
  storage: NStore;
  signal?: AbortSignal;
}

/** Hydrate event relationships using the provided storage. */
async function hydrateEvents(opts: HydrateEventOpts): Promise<DittoEvent[]> {
  const { events, relations, storage, signal } = opts;

  if (!events.length || !relations.length) {
    return events;
  }

  for (const relation of relations) {
    switch (relation) {
      case 'author':
        await hydrateAuthors({ events, storage, signal });
        break;
      case 'author_stats':
        await hydrateAuthorStats(events);
        break;
      case 'event_stats':
        await hydrateEventStats(events);
        break;
      case 'user':
        await hydrateUsers({ events, storage, signal });
        break;
      case 'repost':
        await hydrateRepostEvents({ events, storage, signal });
        break;
      case 'quote_repost':
        await hydrateQuoteRepostEvents({ events, storage, signal });
        break;
    }
  }

  return events;
}

async function hydrateAuthors(opts: Omit<HydrateEventOpts, 'relations'>): Promise<DittoEvent[]> {
  const { events, storage, signal } = opts;

  const pubkeys = new Set([...events].map((event) => event.pubkey));
  const authors = await storage.query([{ kinds: [0], authors: [...pubkeys], limit: pubkeys.size }], { signal });

  for (const event of events) {
    event.author = authors.find((author) => author.pubkey === event.pubkey);
  }

  return events;
}

async function hydrateUsers(opts: Omit<HydrateEventOpts, 'relations'>): Promise<DittoEvent[]> {
  const { events, storage, signal } = opts;

  const pubkeys = new Set([...events].map((event) => event.pubkey));

  const users = await storage.query(
    [{ kinds: [30361], authors: [Conf.pubkey], '#d': [...pubkeys], limit: pubkeys.size }],
    { signal },
  );

  for (const event of events) {
    event.user = users.find((user) => user.tags.find(([name]) => name === 'd')?.[1] === event.pubkey);
  }

  return events;
}

async function hydrateAuthorStats(events: DittoEvent[]): Promise<DittoEvent[]> {
  const results = await db
    .selectFrom('author_stats')
    .selectAll()
    .where('pubkey', 'in', events.map((event) => event.pubkey))
    .execute();

  for (const event of events) {
    const stat = results.find((result) => result.pubkey === event.pubkey);
    if (stat) {
      event.author_stats = {
        followers_count: Math.max(stat.followers_count, 0) || 0,
        following_count: Math.max(stat.following_count, 0) || 0,
        notes_count: Math.max(stat.notes_count, 0) || 0,
      };
    }
  }

  return events;
}

async function hydrateEventStats(events: DittoEvent[]): Promise<DittoEvent[]> {
  const results = await db
    .selectFrom('event_stats')
    .selectAll()
    .where('event_id', 'in', events.map((event) => event.id))
    .execute();

  for (const event of events) {
    const stat = results.find((result) => result.event_id === event.id);
    if (stat) {
      event.event_stats = {
        replies_count: Math.max(stat.replies_count, 0) || 0,
        reposts_count: Math.max(stat.reposts_count, 0) || 0,
        reactions_count: Math.max(stat.reactions_count, 0) || 0,
      };
    }
  }

  return events;
}

async function hydrateRepostEvents(opts: Omit<HydrateEventOpts, 'relations'>): Promise<DittoEvent[]> {
  const { events, storage, signal } = opts;
  const results = await storage.query([{
    kinds: [1],
    ids: events.map((event) => {
      if (event.kind === 6) {
        const originalPostId = event.tags.find(([name]) => name === 'e')?.[1];
        if (!originalPostId) return event.id;
        else return originalPostId;
      }
      return event.id;
    }),
  }], { signal });

  for (const event of events) {
    if (event.kind === 6) {
      const originalPostId = event.tags.find(([name]) => name === 'e')?.[1];
      if (!originalPostId) continue;

      const originalPostEvent = results.find((event) => event.id === originalPostId);
      if (!originalPostEvent) continue;

      await hydrateEvents({
        events: [originalPostEvent],
        storage: storage,
        signal: signal,
        relations: ['author', 'event_stats'],
      });
      event.repost = originalPostEvent;
    }
  }

  return events;
}

async function hydrateQuoteRepostEvents(opts: Omit<HydrateEventOpts, 'relations'>): Promise<DittoEvent[]> {
  const { events, storage, signal } = opts;

  const results = await storage.query([{
    kinds: [1],
    ids: events.map((event) => {
      if (event.kind === 1) {
        const originalPostId = event.tags.find(([name]) => name === 'q')?.[1];
        if (!originalPostId) return event.id;
        else return originalPostId;
      }
      return event.id;
    }),
  }], { signal });

  for (const event of events) {
    if (event.kind === 1) {
      const originalPostId = event.tags.find(([name]) => name === 'q')?.[1];
      if (!originalPostId) continue;

      const originalPostEvent = events.find((event) => event.id === originalPostId);
      if (!originalPostEvent) {
        const originalPostEvent = results.find((event) => event.id === originalPostId);
        if (!originalPostEvent) continue;

        await hydrateEvents({ events: [originalPostEvent], storage: storage, signal: signal, relations: ['author'] });

        event.quote_repost = originalPostEvent;
        continue;
      }
      if (!originalPostEvent.author) {
        await hydrateEvents({ events: [originalPostEvent], storage: storage, signal: signal, relations: ['author'] });

        event.quote_repost = originalPostEvent;
        continue;
      }
      event.quote_repost = originalPostEvent;
    }
  }

  return events;
}

/** Return a normalized event without any non-standard keys. */
function purifyEvent(event: NostrEvent): NostrEvent {
  return {
    id: event.id,
    pubkey: event.pubkey,
    kind: event.kind,
    content: event.content,
    tags: event.tags,
    sig: event.sig,
    created_at: event.created_at,
  };
}

export { hydrateEvents, purifyEvent };

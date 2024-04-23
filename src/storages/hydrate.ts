import { NostrEvent, NStore } from '@nostrify/nostrify';
import { db } from '@/db.ts';
import { type DittoEvent } from '@/interfaces/DittoEvent.ts';

interface HydrateEventOpts {
  events: DittoEvent[];
  storage: NStore;
  signal?: AbortSignal;
}

/** Hydrate events using the provided storage. */
async function hydrateEvents(opts: HydrateEventOpts): Promise<DittoEvent[]> {
  const { events, storage, signal } = opts;

  if (!events.length) {
    return events;
  }

  const allEventsMap: Map<string, DittoEvent> = new Map(events.map((event) => {
    return [event.id, structuredClone(event)];
  }));

  const childrenEventsIds = (events.map((event) => {
    if (event.kind === 1) return event.tags.find(([name]) => name === 'q')?.[1]; // possible quote repost
    if (event.kind === 6) return event.tags.find(([name]) => name === 'e')?.[1]; // possible repost
    return;
  }).filter(Boolean)) as string[];

  if (childrenEventsIds.length > 0) {
    const childrenEvents = await storage.query([{ ids: childrenEventsIds }], { signal });
    childrenEvents.forEach((event) => {
      allEventsMap.set(event.id, structuredClone(event));
    });

    if (childrenEvents.length > 0) {
      const grandChildrenEventsIds = (childrenEvents.map((event) => {
        if (event.kind === 1) return event.tags.find(([name]) => name === 'q')?.[1]; // possible quote repost
        return;
      }).filter(Boolean)) as string[];
      if (grandChildrenEventsIds.length > 0) {
        const grandChildrenEvents = await storage.query([{ ids: grandChildrenEventsIds }], { signal });
        grandChildrenEvents.forEach((event) => {
          allEventsMap.set(event.id, structuredClone(event));
        });
      }
    }
  }
  await hydrateAuthors({ events: [...allEventsMap.values()], storage, signal });
  await hydrateAuthorStats([...allEventsMap.values()]);
  await hydrateEventStats([...allEventsMap.values()]);

  events.forEach((event) => {
    const correspondingEvent = allEventsMap.get(event.id);
    if (correspondingEvent?.author) event.author = correspondingEvent.author;
    if (correspondingEvent?.author_stats) event.author_stats = correspondingEvent.author_stats;
    if (correspondingEvent?.event_stats) event.event_stats = correspondingEvent.event_stats;

    if (event.kind === 1) {
      const quoteId = event.tags.find(([name]) => name === 'q')?.[1];
      if (quoteId) {
        event.quote_repost = allEventsMap.get(quoteId);
      }
    } else if (event.kind === 6) {
      const repostedId = event.tags.find(([name]) => name === 'e')?.[1];
      if (repostedId) {
        const repostedEvent = allEventsMap.get(repostedId);
        if (repostedEvent && repostedEvent.tags.find(([name]) => name === 'q')?.[1]) { // The repost is a repost of a quote repost
          const postBeingQuoteRepostedId = repostedEvent.tags.find(([name]) => name === 'q')?.[1];
          event.repost = {
            quote_repost: allEventsMap.get(postBeingQuoteRepostedId!),
            ...allEventsMap.get(repostedId)!,
          };
        } else { // The repost is a repost of a normal post
          event.repost = allEventsMap.get(repostedId);
        }
      }
    }
  });
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

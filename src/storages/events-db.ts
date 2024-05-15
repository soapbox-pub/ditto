// deno-lint-ignore-file require-await

import { NDatabase, NIP50, NKinds, NostrEvent, NostrFilter, NSchema as n, NStore } from '@nostrify/nostrify';
import { Stickynotes } from '@soapbox/stickynotes';
import { Kysely } from 'kysely';

import { Conf } from '@/config.ts';
import { DittoTables } from '@/db/DittoTables.ts';
import { normalizeFilters } from '@/filter.ts';
import { DittoEvent } from '@/interfaces/DittoEvent.ts';
import { purifyEvent } from '@/storages/hydrate.ts';
import { isNostrId, isURL } from '@/utils.ts';
import { abortError } from '@/utils/abort.ts';

/** Function to decide whether or not to index a tag. */
type TagCondition = ({ event, count, value }: {
  event: DittoEvent;
  count: number;
  value: string;
}) => boolean;

/** SQLite database storage adapter for Nostr events. */
class EventsDB implements NStore {
  private store: NDatabase;
  private console = new Stickynotes('ditto:db:events');

  /** Conditions for when to index certain tags. */
  static tagConditions: Record<string, TagCondition> = {
    'd': ({ event, count }) => count === 0 && NKinds.parameterizedReplaceable(event.kind),
    'e': ({ event, count, value }) => ((event.user && event.kind === 10003) || count < 15) && isNostrId(value),
    'L': ({ event, count }) => event.kind === 1985 || count === 0,
    'l': ({ event, count }) => event.kind === 1985 || count === 0,
    'media': ({ event, count, value }) => (event.user || count < 4) && isURL(value),
    'P': ({ count, value }) => count === 0 && isNostrId(value),
    'p': ({ event, count, value }) => (count < 15 || event.kind === 3) && isNostrId(value),
    'proxy': ({ count, value }) => count === 0 && isURL(value),
    'q': ({ event, count, value }) => count === 0 && event.kind === 1 && isNostrId(value),
    't': ({ count, value }) => count < 5 && value.length < 50,
    'name': ({ event, count }) => event.kind === 30361 && count === 0,
    'role': ({ event, count }) => event.kind === 30361 && count === 0,
  };

  constructor(private kysely: Kysely<DittoTables>) {
    this.store = new NDatabase(kysely, {
      fts5: Conf.databaseUrl.protocol === 'sqlite:',
      indexTags: EventsDB.indexTags,
      searchText: EventsDB.searchText,
    });
  }

  /** Insert an event (and its tags) into the database. */
  async event(event: NostrEvent, _opts?: { signal?: AbortSignal }): Promise<void> {
    event = purifyEvent(event);
    this.console.debug('EVENT', JSON.stringify(event));
    return this.store.event(event);
  }

  /** Get events for filters from the database. */
  async query(filters: NostrFilter[], opts: { signal?: AbortSignal; limit?: number } = {}): Promise<DittoEvent[]> {
    filters = await this.expandFilters(filters);

    if (opts.signal?.aborted) return Promise.resolve([]);
    if (!filters.length) return Promise.resolve([]);

    this.console.debug('REQ', JSON.stringify(filters));

    return this.store.query(filters, opts);
  }

  /** Delete events based on filters from the database. */
  async remove(filters: NostrFilter[], _opts?: { signal?: AbortSignal }): Promise<void> {
    if (!filters.length) return Promise.resolve();
    this.console.debug('DELETE', JSON.stringify(filters));

    return this.store.remove(filters);
  }

  /** Get number of events that would be returned by filters. */
  async count(
    filters: NostrFilter[],
    opts: { signal?: AbortSignal } = {},
  ): Promise<{ count: number; approximate: boolean }> {
    if (opts.signal?.aborted) return Promise.reject(abortError());
    if (!filters.length) return Promise.resolve({ count: 0, approximate: false });

    this.console.debug('COUNT', JSON.stringify(filters));

    return this.store.count(filters);
  }

  /** Return only the tags that should be indexed. */
  static indexTags(event: DittoEvent): string[][] {
    const tagCounts: Record<string, number> = {};

    function getCount(name: string) {
      return tagCounts[name] || 0;
    }

    function incrementCount(name: string) {
      tagCounts[name] = getCount(name) + 1;
    }

    function checkCondition(name: string, value: string, condition: TagCondition) {
      return condition({
        event,
        count: getCount(name),
        value,
      });
    }

    return event.tags.reduce<string[][]>((results, tag) => {
      const [name, value] = tag;
      const condition = EventsDB.tagConditions[name] as TagCondition | undefined;

      if (value && condition && value.length < 200 && checkCondition(name, value, condition)) {
        results.push(tag);
      }

      incrementCount(name);
      return results;
    }, []);
  }

  /** Build a search index from the event. */
  static searchText(event: NostrEvent): string {
    switch (event.kind) {
      case 0:
        return EventsDB.buildUserSearchContent(event);
      case 1:
        return event.content;
      case 30009:
        return EventsDB.buildTagsSearchContent(event.tags.filter(([t]) => t !== 'alt'));
      default:
        return '';
    }
  }

  /** Build search content for a user. */
  static buildUserSearchContent(event: NostrEvent): string {
    const { name, nip05, about } = n.json().pipe(n.metadata()).catch({}).parse(event.content);
    return [name, nip05, about].filter(Boolean).join('\n');
  }

  /** Build search content from tag values. */
  static buildTagsSearchContent(tags: string[][]): string {
    return tags.map(([_tag, value]) => value).join('\n');
  }

  /** Converts filters to more performant, simpler filters that are better for SQLite. */
  async expandFilters(filters: NostrFilter[]): Promise<NostrFilter[]> {
    for (const filter of filters) {
      if (filter.search) {
        const tokens = NIP50.parseInput(filter.search);

        const domain = (tokens.find((t) =>
          typeof t === 'object' && t.key === 'domain'
        ) as { key: 'domain'; value: string } | undefined)?.value;

        if (domain) {
          const query = this.kysely
            .selectFrom('pubkey_domains')
            .select('pubkey')
            .where('domain', '=', domain);

          if (filter.authors) {
            query.where('pubkey', 'in', filter.authors);
          }

          const pubkeys = await query
            .execute()
            .then((rows) =>
              rows.map((row) => row.pubkey)
            );

          filter.authors = pubkeys;
        }

        filter.search = tokens.filter((t) => typeof t === 'string').join(' ');
      }
    }

    return normalizeFilters(filters); // Improves performance of `{ kinds: [0], authors: ['...'] }` queries.
  }
}

export { EventsDB };

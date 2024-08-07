// deno-lint-ignore-file require-await

import { NDatabase } from '@nostrify/db';
import {
  NIP50,
  NKinds,
  NostrEvent,
  NostrFilter,
  NostrRelayCLOSED,
  NostrRelayEOSE,
  NostrRelayEVENT,
  NSchema as n,
  NStore,
} from '@nostrify/nostrify';
import { Stickynotes } from '@soapbox/stickynotes';
import { Kysely } from 'kysely';
import { nip27 } from 'nostr-tools';

import { Conf } from '@/config.ts';
import { DittoTables } from '@/db/DittoTables.ts';
import { dbEventCounter } from '@/metrics.ts';
import { RelayError } from '@/RelayError.ts';
import { purifyEvent } from '@/storages/hydrate.ts';
import { isNostrId, isURL } from '@/utils.ts';
import { abortError } from '@/utils/abort.ts';

/** Function to decide whether or not to index a tag. */
type TagCondition = ({ event, count, value }: {
  event: NostrEvent;
  count: number;
  value: string;
}) => boolean;

/** SQLite database storage adapter for Nostr events. */
class EventsDB implements NStore {
  private store: NDatabase;
  private console = new Stickynotes('ditto:db:events');

  /** Conditions for when to index certain tags. */
  static tagConditions: Record<string, TagCondition> = {
    'a': ({ count }) => count < 15,
    'd': ({ event, count }) => count === 0 && NKinds.parameterizedReplaceable(event.kind),
    'e': ({ event, count, value }) => ((event.kind === 10003) || count < 15) && isNostrId(value),
    'k': ({ count, value }) => count === 0 && Number.isInteger(Number(value)),
    'L': ({ event, count }) => event.kind === 1985 || count === 0,
    'l': ({ event, count }) => event.kind === 1985 || count === 0,
    'n': ({ count, value }) => count < 50 && value.length < 50,
    'P': ({ count, value }) => count === 0 && isNostrId(value),
    'p': ({ event, count, value }) => (count < 15 || event.kind === 3) && isNostrId(value),
    'proxy': ({ count, value }) => count === 0 && isURL(value),
    'q': ({ event, count, value }) => count === 0 && event.kind === 1 && isNostrId(value),
    'r': ({ event, count }) => (event.kind === 1985 ? count < 20 : count < 3),
    't': ({ event, count, value }) => (event.kind === 1985 ? count < 20 : count < 5) && value.length < 50,
  };

  constructor(private kysely: Kysely<DittoTables>) {
    this.store = new NDatabase(kysely, {
      fts: Conf.db.dialect,
      timeoutStrategy: Conf.db.dialect === 'postgres' ? 'setStatementTimeout' : undefined,
      indexTags: EventsDB.indexTags,
      searchText: EventsDB.searchText,
    });
  }

  /** Insert an event (and its tags) into the database. */
  async event(event: NostrEvent, opts: { signal?: AbortSignal; timeout?: number } = {}): Promise<void> {
    event = purifyEvent(event);
    this.console.debug('EVENT', JSON.stringify(event));
    dbEventCounter.inc({ kind: event.kind });

    if (await this.isDeletedAdmin(event)) {
      throw new RelayError('blocked', 'event deleted by admin');
    }

    await this.deleteEventsAdmin(event);

    try {
      await this.store.event(event, { ...opts, timeout: opts.timeout ?? Conf.db.timeouts.default });
    } catch (e) {
      if (e.message === 'Cannot add a deleted event') {
        throw new RelayError('blocked', 'event deleted by user');
      } else if (e.message === 'Cannot replace an event with an older event') {
        return;
      } else {
        this.console.debug('ERROR', e.message);
      }
    }
  }

  /** Check if an event has been deleted by the admin. */
  private async isDeletedAdmin(event: NostrEvent): Promise<boolean> {
    const filters: NostrFilter[] = [
      { kinds: [5], authors: [Conf.pubkey], '#e': [event.id], limit: 1 },
    ];

    if (NKinds.replaceable(event.kind) || NKinds.parameterizedReplaceable(event.kind)) {
      const d = event.tags.find(([tag]) => tag === 'd')?.[1] ?? '';

      filters.push({
        kinds: [5],
        authors: [Conf.pubkey],
        '#a': [`${event.kind}:${event.pubkey}:${d}`],
        since: event.created_at,
        limit: 1,
      });
    }

    const events = await this.query(filters);
    return events.length > 0;
  }

  /** The DITTO_NSEC can delete any event from the database. NDatabase already handles user deletions. */
  private async deleteEventsAdmin(event: NostrEvent): Promise<void> {
    if (event.kind === 5 && event.pubkey === Conf.pubkey) {
      const ids = new Set(event.tags.filter(([name]) => name === 'e').map(([_name, value]) => value));
      const addrs = new Set(event.tags.filter(([name]) => name === 'a').map(([_name, value]) => value));

      const filters: NostrFilter[] = [];

      if (ids.size) {
        filters.push({ ids: [...ids] });
      }

      for (const addr of addrs) {
        const [k, pubkey, d] = addr.split(':');
        const kind = Number(k);

        if (!(Number.isInteger(kind) && kind >= 0)) continue;
        if (!isNostrId(pubkey)) continue;
        if (d === undefined) continue;

        const filter: NostrFilter = {
          kinds: [kind],
          authors: [pubkey],
          until: event.created_at,
        };

        if (d) {
          filter['#d'] = [d];
        }

        filters.push(filter);
      }

      if (filters.length) {
        await this.remove(filters);
      }
    }
  }

  /** Stream events from the database. */
  req(
    filters: NostrFilter[],
    opts: { signal?: AbortSignal } = {},
  ): AsyncIterable<NostrRelayEVENT | NostrRelayEOSE | NostrRelayCLOSED> {
    return this.store.req(filters, opts);
  }

  /** Get events for filters from the database. */
  async query(
    filters: NostrFilter[],
    opts: { signal?: AbortSignal; timeout?: number; limit?: number } = {},
  ): Promise<NostrEvent[]> {
    filters = await this.expandFilters(filters);

    for (const filter of filters) {
      if (filter.since && filter.since >= 2_147_483_647) {
        throw new RelayError('invalid', 'since filter too far into the future');
      }
      if (filter.until && filter.until >= 2_147_483_647) {
        throw new RelayError('invalid', 'until filter too far into the future');
      }
      for (const kind of filter.kinds ?? []) {
        if (kind >= 2_147_483_647) {
          throw new RelayError('invalid', 'kind filter too far into the future');
        }
      }
    }

    if (opts.signal?.aborted) return Promise.resolve([]);
    if (!filters.length) return Promise.resolve([]);

    this.console.debug('REQ', JSON.stringify(filters));

    return this.store.query(filters, { ...opts, timeout: opts.timeout ?? Conf.db.timeouts.default });
  }

  /** Delete events based on filters from the database. */
  async remove(filters: NostrFilter[], opts: { signal?: AbortSignal; timeout?: number } = {}): Promise<void> {
    if (!filters.length) return Promise.resolve();
    this.console.debug('DELETE', JSON.stringify(filters));

    return this.store.remove(filters, { ...opts, timeout: opts.timeout ?? Conf.db.timeouts.default });
  }

  /** Get number of events that would be returned by filters. */
  async count(
    filters: NostrFilter[],
    opts: { signal?: AbortSignal; timeout?: number } = {},
  ): Promise<{ count: number; approximate: boolean }> {
    if (opts.signal?.aborted) return Promise.reject(abortError());
    if (!filters.length) return Promise.resolve({ count: 0, approximate: false });

    this.console.debug('COUNT', JSON.stringify(filters));

    return this.store.count(filters, { ...opts, timeout: opts.timeout ?? Conf.db.timeouts.default });
  }

  /** Return only the tags that should be indexed. */
  static indexTags(event: NostrEvent): string[][] {
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
        return nip27.replaceAll(event.content, () => '');
      case 30009:
        return EventsDB.buildTagsSearchContent(event.tags.filter(([t]) => t !== 'alt'));
      case 30360:
        return event.tags.find(([name]) => name === 'd')?.[1] || '';
      default:
        return '';
    }
  }

  /** Build search content for a user. */
  static buildUserSearchContent(event: NostrEvent): string {
    const { name, nip05 } = n.json().pipe(n.metadata()).catch({}).parse(event.content);
    return [name, nip05].filter(Boolean).join('\n');
  }

  /** Build search content from tag values. */
  static buildTagsSearchContent(tags: string[][]): string {
    return tags.map(([_tag, value]) => value).join('\n');
  }

  /** Converts filters to more performant, simpler filters that are better for SQLite. */
  async expandFilters(filters: NostrFilter[]): Promise<NostrFilter[]> {
    filters = structuredClone(filters);

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

      if (filter.kinds) {
        // Ephemeral events are not stored, so don't bother querying for them.
        // If this results in an empty kinds array, NDatabase will remove the filter before querying and return no results.
        filter.kinds = filter.kinds.filter((kind) => !NKinds.ephemeral(kind));
      }
    }

    return filters;
  }
}

export { EventsDB };

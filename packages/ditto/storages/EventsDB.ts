// deno-lint-ignore-file require-await

import { DittoTables } from '@ditto/db';
import { NPostgres, NPostgresSchema } from '@nostrify/db';
import { dbEventsCounter } from '@ditto/metrics';
import { NIP50, NKinds, NostrEvent, NostrFilter, NSchema as n } from '@nostrify/nostrify';
import { logi } from '@soapbox/logi';
import { JsonValue } from '@std/json';
import { LanguageCode } from 'iso-639-1';
import { Kysely } from 'kysely';
import linkify from 'linkifyjs';
import { nip27 } from 'nostr-tools';
import tldts from 'tldts';
import { z } from 'zod';

import { RelayError } from '@/RelayError.ts';
import { isNostrId } from '@/utils.ts';
import { abortError } from '@/utils/abort.ts';
import { purifyEvent } from '@/utils/purify.ts';
import { DittoEvent } from '@/interfaces/DittoEvent.ts';
import { detectLanguage } from '@/utils/language.ts';
import { getMediaLinks } from '@/utils/note.ts';

/** Function to decide whether or not to index a tag. */
type TagCondition = (opts: TagConditionOpts) => boolean;

/** Options for the tag condition function. */
interface TagConditionOpts {
  /** Nostr event whose tags are being indexed. */
  event: NostrEvent;
  /** Count of the current tag name so far. Each tag name has a separate counter starting at 0. */
  count: number;
  /** Overall tag index. */
  index: number;
  /** Current vag value. */
  value: string;
}

/** Options for the EventsDB store. */
interface EventsDBOpts {
  /** Kysely instance to use. */
  kysely: Kysely<DittoTables>;
  /** Pubkey of the admin account. */
  pubkey: string;
  /** Timeout in milliseconds for database queries. */
  timeout: number;
  /** Whether the event returned should be a Nostr event or a Ditto event. Defaults to false. */
  pure?: boolean;
}

/** SQL database storage adapter for Nostr events. */
class EventsDB extends NPostgres {
  /** Conditions for when to index certain tags. */
  static tagConditions: Record<string, TagCondition> = {
    'a': ({ count }) => count < 15,
    'd': ({ event, count }) => count === 0 && NKinds.parameterizedReplaceable(event.kind),
    'e': EventsDB.eTagCondition,
    'k': ({ count, value }) => count === 0 && Number.isInteger(Number(value)),
    'L': ({ event, count }) => event.kind === 1985 || count === 0,
    'l': ({ event, count }) => event.kind === 1985 || count === 0,
    'n': ({ count, value }) => count < 50 && value.length < 50,
    'P': ({ count, value }) => count === 0 && isNostrId(value),
    'p': EventsDB.pTagCondition,
    'proxy': ({ count, value }) => count === 0 && value.length < 256,
    'q': ({ event, count, value }) => count === 0 && event.kind === 1 && isNostrId(value),
    'r': ({ event, count }) => (event.kind === 1985 ? count < 20 : count < 3),
    't': ({ event, count, value }) =>
      (value === value.toLowerCase()) && (event.kind === 1985 ? count < 20 : count < 5) && value.length < 50,
    'u': ({ count, value }) => {
      const { success } = z.string().url().safeParse(value); // TODO: maybe find a better library specific for validating web urls
      return count < 15 && success;
    },
  };

  static indexExtensions(event: NostrEvent): Record<string, string> {
    const ext: Record<string, string> = {};

    if (event.kind === 1) {
      ext.reply = event.tags.some(([name]) => name === 'e').toString();
    } else if (event.kind === 1111) {
      ext.reply = event.tags.some(([name]) => ['e', 'E'].includes(name)).toString();
    } else if (event.kind === 6) {
      ext.reply = 'false';
    }

    if ([1, 20, 30023].includes(event.kind)) {
      const language = detectLanguage(event.content, 0.90);

      if (language) {
        ext.language = language;
      }
    }

    const imeta: string[][][] = event.tags
      .filter(([name]) => name === 'imeta')
      .map(([_, ...entries]) =>
        entries.map((entry) => {
          const split = entry.split(' ');
          return [split[0], split.splice(1).join(' ')];
        })
      );

    // quirks mode
    if (!imeta.length && event.kind === 1) {
      const links = linkify.find(event.content).filter(({ type }) => type === 'url');
      imeta.push(...getMediaLinks(links));
    }

    if (imeta.length) {
      ext.media = 'true';

      if (imeta.every((tags) => tags.some(([name, value]) => name === 'm' && value.startsWith('video/')))) {
        ext.video = 'true';
      }
    }

    ext.protocol = event.tags.find(([name]) => name === 'proxy')?.[2] ?? 'nostr';

    return ext;
  }

  constructor(private opts: EventsDBOpts) {
    super(opts.kysely, {
      indexTags: EventsDB.indexTags,
      indexSearch: EventsDB.searchText,
      indexExtensions: EventsDB.indexExtensions,
    });
  }

  /** Insert an event (and its tags) into the database. */
  override async event(event: NostrEvent, opts: { signal?: AbortSignal; timeout?: number } = {}): Promise<void> {
    event = purifyEvent(event);
    logi({ level: 'debug', ns: 'ditto.event', source: 'db', id: event.id, kind: event.kind });
    dbEventsCounter.inc({ kind: event.kind });

    if (await this.isDeletedAdmin(event)) {
      throw new RelayError('blocked', 'event deleted by admin');
    }

    await this.deleteEventsAdmin(event);

    try {
      await super.event(event, { ...opts, timeout: opts.timeout ?? this.opts.timeout });
    } catch (e) {
      if (e instanceof Error && e.message === 'Cannot add a deleted event') {
        throw new RelayError('blocked', 'event deleted by user');
      } else if (e instanceof Error && e.message === 'Cannot replace an event with an older event') {
        return;
      } else {
        throw e;
      }
    }
  }

  /** Check if an event has been deleted by the admin. */
  private async isDeletedAdmin(event: NostrEvent): Promise<boolean> {
    const filters: NostrFilter[] = [
      { kinds: [5], authors: [this.opts.pubkey], '#e': [event.id], limit: 1 },
    ];

    if (NKinds.replaceable(event.kind) || NKinds.parameterizedReplaceable(event.kind)) {
      const d = event.tags.find(([tag]) => tag === 'd')?.[1] ?? '';

      filters.push({
        kinds: [5],
        authors: [this.opts.pubkey],
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
    if (event.kind === 5 && event.pubkey === this.opts.pubkey) {
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

  /** Get events for filters from the database. */
  override async query(
    filters: NostrFilter[],
    opts: { signal?: AbortSignal; timeout?: number; limit?: number } = {},
  ): Promise<DittoEvent[]> {
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

    logi({ level: 'debug', ns: 'ditto.req', source: 'db', filters: filters as JsonValue });

    return super.query(filters, { ...opts, timeout: opts.timeout ?? this.opts.timeout });
  }

  /** Parse an event row from the database. */
  protected override parseEventRow(row: NPostgresSchema['nostr_events']): DittoEvent {
    const event: DittoEvent = {
      id: row.id,
      kind: row.kind,
      pubkey: row.pubkey,
      content: row.content,
      created_at: Number(row.created_at),
      tags: row.tags,
      sig: row.sig,
    };

    if (!this.opts.pure) {
      event.language = row.search_ext.language as LanguageCode | undefined;
    }

    return event;
  }

  /** Delete events based on filters from the database. */
  override async remove(filters: NostrFilter[], opts: { signal?: AbortSignal; timeout?: number } = {}): Promise<void> {
    logi({ level: 'debug', ns: 'ditto.remove', source: 'db', filters: filters as JsonValue });
    return super.remove(filters, { ...opts, timeout: opts.timeout ?? this.opts.timeout });
  }

  /** Get number of events that would be returned by filters. */
  override async count(
    filters: NostrFilter[],
    opts: { signal?: AbortSignal; timeout?: number } = {},
  ): Promise<{ count: number; approximate: boolean }> {
    if (opts.signal?.aborted) return Promise.reject(abortError());

    logi({ level: 'debug', ns: 'ditto.count', source: 'db', filters: filters as JsonValue });

    return super.count(filters, { ...opts, timeout: opts.timeout ?? this.opts.timeout });
  }

  /** Rule for indexing `e` tags. */
  private static eTagCondition({ event, count, value, index }: TagConditionOpts): boolean {
    if (!isNostrId(value)) return false;

    if (event.kind === 7) {
      return index === event.tags.findLastIndex(([name]) => name === 'e');
    }

    return event.kind === 10003 || count < 15;
  }

  /** Rule for indexing `p` tags. */
  private static pTagCondition({ event, count, value, index }: TagConditionOpts): boolean {
    if (!isNostrId(value)) return false;

    if (event.kind === 7) {
      return index === event.tags.findLastIndex(([name]) => name === 'p');
    }

    return count < 15 || event.kind === 3;
  }

  /** Return only the tags that should be indexed. */
  static override indexTags(event: NostrEvent): string[][] {
    const tagCounts: Record<string, number> = {};

    function getCount(name: string) {
      return tagCounts[name] || 0;
    }

    function incrementCount(name: string) {
      tagCounts[name] = getCount(name) + 1;
    }

    function checkCondition(name: string, value: string, condition: TagCondition, index: number): boolean {
      return condition({
        event,
        count: getCount(name),
        value,
        index,
      });
    }

    return event.tags.reduce<string[][]>((results, tag, index) => {
      const [name, value] = tag;
      const condition = EventsDB.tagConditions[name] as TagCondition | undefined;

      if (value && condition && value.length < 200 && checkCondition(name, value, condition, index)) {
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
      case 20:
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

  /** Converts filters to more performant, simpler filters. */
  async expandFilters(filters: NostrFilter[]): Promise<NostrFilter[]> {
    filters = structuredClone(filters);

    for (const filter of filters) {
      if (filter.search) {
        const tokens = NIP50.parseInput(filter.search);

        const domains = new Set<string>();
        const hostnames = new Set<string>();

        for (const token of tokens) {
          if (typeof token === 'object' && token.key === 'domain') {
            const { domain, hostname } = tldts.parse(token.value);
            if (domain === hostname) {
              domains.add(token.value);
            } else {
              hostnames.add(token.value);
            }
          }
        }

        if (domains.size || hostnames.size) {
          let query = this.opts.kysely
            .selectFrom('author_stats')
            .select('pubkey')
            .where((eb) => {
              const expr = [];
              if (domains.size) {
                expr.push(eb('nip05_domain', 'in', [...domains]));
              }
              if (hostnames.size) {
                expr.push(eb('nip05_hostname', 'in', [...hostnames]));
              }
              if (expr.length === 1) {
                return expr[0];
              }
              return eb.or(expr);
            });

          if (filter.authors) {
            query = query.where('pubkey', 'in', filter.authors);
          }

          const pubkeys = await query.execute().then((rows) => rows.map((row) => row.pubkey));

          filter.authors = pubkeys;
        }

        // Re-serialize the search string without the domain key. :facepalm:
        filter.search = tokens
          .filter((t) => typeof t === 'string' || typeof t === 'object' && t.key !== 'domain')
          .map((t) => typeof t === 'object' ? `${t.key}:${t.value}` : t)
          .join(' ');
      }

      if (filter.kinds) {
        // Ephemeral events are not stored, so don't bother querying for them.
        // If this results in an empty kinds array, NDatabase will remove the filter before querying and return no results.
        filter.kinds = filter.kinds.filter((kind) => !NKinds.ephemeral(kind));
      }
    }

    return filters;
  }

  // deno-lint-ignore no-explicit-any
  override async transaction(callback: (store: NPostgres, kysely: Kysely<any>) => Promise<void>): Promise<void> {
    return super.transaction((store, kysely) => callback(store, kysely as unknown as Kysely<DittoTables>));
  }
}

export { EventsDB };

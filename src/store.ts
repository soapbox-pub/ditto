import { type DittoDB } from '@/db.ts';
import { type Event } from '@/deps.ts';
import { type DittoFilter } from '@/filter.ts';
import { type EventData } from '@/types.ts';

/** Additional options to apply to the whole subscription. */
interface GetEventsOpts {
  /** Signal to abort the request. */
  signal?: AbortSignal;
  /** Event limit for the whole subscription. */
  limit?: number;
  /** Relays to use, if applicable. */
  relays?: WebSocket['url'][];
}

type AuthorStats = Omit<DittoDB['author_stats'], 'pubkey'>;
type EventStats = Omit<DittoDB['event_stats'], 'event_id'>;

/** Internal Event representation used by Ditto, including extra keys. */
interface DittoEvent<K extends number = number> extends Event<K> {
  author?: DittoEvent<0>;
  author_stats?: AuthorStats;
  event_stats?: EventStats;
}

/** Storage interface for Nostr events. */
interface EventStore {
  /** Add an event to the store. */
  storeEvent(event: Event, data?: EventData): Promise<void>;
  /** Get events from filters. */
  getEvents<K extends number>(filters: DittoFilter<K>[], opts?: GetEventsOpts): Promise<DittoEvent<K>[]>;
  /** Get the number of events from filters. */
  countEvents<K extends number>(filters: DittoFilter<K>[]): Promise<number>;
  /** Delete events from filters. */
  deleteEvents<K extends number>(filters: DittoFilter<K>[]): Promise<void>;
}

export type { DittoEvent, EventStore, GetEventsOpts };

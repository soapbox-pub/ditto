import { type NostrEvent } from '@/deps.ts';

/** Ditto internal stats for the event's author. */
export interface AuthorStats {
  followers_count: number;
  following_count: number;
  notes_count: number;
}

/** Ditto internal stats for the event. */
export interface EventStats {
  replies_count: number;
  reposts_count: number;
  reactions_count: number;
}

/** Internal Event representation used by Ditto, including extra keys. */
export interface DittoEvent extends NostrEvent {
  author?: DittoEvent;
  author_domain?: string;
  author_stats?: AuthorStats;
  event_stats?: EventStats;
  d_author?: DittoEvent;
  user?: DittoEvent;
  repost?: NostrEvent;
  quote_repost?: NostrEvent;
}

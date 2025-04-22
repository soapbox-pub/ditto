import { NostrEvent } from '@nostrify/nostrify';
import { LanguageCode } from 'iso-639-1';

import type { MastodonPreviewCard } from '@ditto/mastoapi/types';

/** Ditto internal stats for the event's author. */
export interface AuthorStats {
  followers_count: number;
  following_count: number;
  notes_count: number;
  streak_start?: number;
  streak_end?: number;
  nip05?: string;
  nip05_domain?: string;
  nip05_hostname?: string;
  nip05_last_verified_at?: number;
  favicon?: string;
}

/** Ditto internal stats for the event. */
export interface EventStats {
  replies_count: number;
  reposts_count: number;
  quotes_count: number;
  reactions: Record<string, number>;
  zaps_amount: number;
  zaps_amount_cashu: number;
  link_preview?: MastodonPreviewCard;
}

/** Internal Event representation used by Ditto, including extra keys. */
export interface DittoEvent extends NostrEvent {
  author?: DittoEvent;
  author_stats?: AuthorStats;
  event_stats?: EventStats;
  mentions?: DittoEvent[];
  user?: DittoEvent;
  repost?: DittoEvent;
  quote?: DittoEvent;
  reacted?: DittoEvent;
  /** The profile being reported.
   * Must be a kind 0 hydrated.
   * https://github.com/nostr-protocol/nips/blob/master/56.md
   */
  reported_profile?: DittoEvent;
  /** The notes being reported.
   * https://github.com/nostr-protocol/nips/blob/master/56.md
   */
  reported_notes?: DittoEvent[];
  /** Admin event relationship. */
  info?: DittoEvent;
  /** Kind 1 being zapped */
  zapped?: DittoEvent;
  /** Kind 0 or pubkey that zapped */
  zap_sender?: DittoEvent | string;
  zap_amount?: number;
  zap_message?: string;
  /** Language of the event (kind 1s are more accurate). */
  language?: LanguageCode;
  /** Whether or not pubkey accepts cashu. */
  accepts_zaps_cashu?: boolean;
  client?: DittoEvent;
}

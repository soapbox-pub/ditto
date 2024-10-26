import { Generated } from 'kysely';

import { NPostgresSchema } from '@nostrify/db';

export interface DittoTables extends NPostgresSchema {
  nostr_events: NostrEventsRow;
  auth_tokens: AuthTokenRow;
  author_stats: AuthorStatsRow;
  event_stats: EventStatsRow;
  pubkey_domains: PubkeyDomainRow;
  event_zaps: EventZapRow;
  push_subscriptions: PushSubscriptionRow;
}

type NostrEventsRow = NPostgresSchema['nostr_events'] & {
  language: string | null;
};

interface AuthorStatsRow {
  pubkey: string;
  followers_count: number;
  following_count: number;
  notes_count: number;
  search: string;
}

interface EventStatsRow {
  event_id: string;
  replies_count: number;
  reposts_count: number;
  reactions_count: number;
  quotes_count: number;
  reactions: string;
  zaps_amount: number;
}

interface AuthTokenRow {
  token_hash: Uint8Array;
  pubkey: string;
  bunker_pubkey: string;
  nip46_sk_enc: Uint8Array;
  nip46_relays: string[];
  created_at: Date;
}

interface PubkeyDomainRow {
  pubkey: string;
  domain: string;
  last_updated_at: number;
}

interface EventZapRow {
  receipt_id: string;
  target_event_id: string;
  sender_pubkey: string;
  amount_millisats: number;
  comment: string;
}

interface PushSubscriptionRow {
  id: Generated<bigint>;
  pubkey: string;
  token_hash: Uint8Array;
  endpoint: string;
  p256dh: string;
  auth: string;
  data: {
    alerts?: {
      mention?: boolean;
      status?: boolean;
      reblog?: boolean;
      follow?: boolean;
      follow_request?: boolean;
      favourite?: boolean;
      poll?: boolean;
      update?: boolean;
      'admin.sign_up'?: boolean;
      'admin.report'?: boolean;
    };
    policy?: 'all' | 'followed' | 'follower' | 'none';
  } | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

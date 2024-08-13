export interface DittoTables {
  nip46_tokens: NIP46TokenRow;
  unattached_media: UnattachedMediaRow;
  author_stats: AuthorStatsRow;
  event_stats: EventStatsRow;
  pubkey_domains: PubkeyDomainRow;
  event_zaps: EventZapRow;
}

interface AuthorStatsRow {
  pubkey: string;
  followers_count: number;
  following_count: number;
  notes_count: number;
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

interface NIP46TokenRow {
  api_token: string;
  user_pubkey: string;
  server_seckey: Uint8Array;
  server_pubkey: string;
  relays: string;
  connected_at: Date;
}

interface UnattachedMediaRow {
  id: string;
  pubkey: string;
  url: string;
  data: string;
  uploaded_at: number;
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

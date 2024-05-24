export interface DittoTables {
  nostr_events: EventRow;
  nostr_tags: TagRow;
  nostr_fts5: EventFTSRow;
  unattached_media: UnattachedMediaRow;
  author_stats: AuthorStatsRow;
  event_stats: EventStatsRow;
  pubkey_domains: PubkeyDomainRow;
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
  reactions: string;
}

interface EventRow {
  id: string;
  kind: number;
  pubkey: string;
  content: string;
  created_at: number;
  tags: string;
  sig: string;
}

interface EventFTSRow {
  event_id: string;
  content: string;
}

interface TagRow {
  event_id: string;
  name: string;
  value: string;
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

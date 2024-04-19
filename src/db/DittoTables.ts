export interface DittoTables {
  events: EventRow;
  events_fts: EventFTSRow;
  tags: TagRow;
  relays: RelayRow;
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
  reactions_count: number;
}

interface EventRow {
  id: string;
  kind: number;
  pubkey: string;
  content: string;
  created_at: number;
  tags: string;
  sig: string;
  deleted_at: number | null;
}

interface EventFTSRow {
  id: string;
  content: string;
}

interface TagRow {
  tag: string;
  value: string;
  event_id: string;
}

interface RelayRow {
  url: string;
  domain: string;
  active: boolean;
}

interface UnattachedMediaRow {
  id: string;
  pubkey: string;
  url: string;
  data: string;
  uploaded_at: Date;
}

interface PubkeyDomainRow {
  pubkey: string;
  domain: string;
  last_updated_at: number;
}

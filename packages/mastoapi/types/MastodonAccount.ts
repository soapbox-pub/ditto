/** Mastodon account entity, including supported extensions from Pleroma, etc. */
export interface MastodonAccount {
  id: string;
  acct: string;
  avatar: string;
  avatar_static: string;
  bot: boolean;
  created_at: string;
  discoverable: boolean;
  display_name: string;
  emojis: {
    shortcode: string;
    static_url: string;
    url: string;
  }[];
  fields: unknown[];
  follow_requests_count: number;
  followers_count: number;
  following_count: number;
  fqn: string;
  header: string;
  header_static: string;
  last_status_at: string | null;
  locked: boolean;
  note: string;
  roles: unknown[];
  source?: {
    fields: unknown[];
    language: string;
    note: string;
    privacy: string;
    sensitive: boolean;
    follow_requests_count: number;
    nostr: {
      nip05?: string;
    };
    ditto: {
      captcha_solved: boolean;
    };
  };
  statuses_count: number;
  uri: string;
  url: string;
  username: string;
  ditto: {
    accepts_zaps: boolean;
    accepts_zaps_cashu: boolean;
    external_url: string;
    streak: {
      days: number;
      start: string | null;
      end: string | null;
      expires: string | null;
    };
  };
  domain?: string;
  pleroma: {
    deactivated: boolean;
    favicon?: string;
    is_admin: boolean;
    is_moderator: boolean;
    is_suggested: boolean;
    is_local: boolean;
    settings_store?: Record<string, unknown>;
    tags: string[];
  };
  nostr: {
    pubkey: string;
    lud16?: string;
  };
  website?: string;
}

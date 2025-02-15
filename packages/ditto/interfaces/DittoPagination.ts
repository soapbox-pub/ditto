/** Based on Mastodon pagination. */
export interface DittoPagination {
  /** Lowest Nostr event `created_at` timestamp. */
  since?: number;
  /** Highest Nostr event `created_at` timestamp. */
  until?: number;
  /** @deprecated Mastodon apps are supposed to use the `Link` header. */
  max_id?: string;
  /** @deprecated Mastodon apps are supposed to use the `Link` header. */
  min_id?: string;
  /** Maximum number of results to return. Default 20, maximum 40. */
  limit?: number;
  /** Used by Ditto to offset tag values in Nostr list events. */
  offset?: number;
}

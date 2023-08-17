import { type Filter } from '@/deps.ts';

/** Custom filter interface that extends Nostr filters with extra options for Ditto. */
interface DittoFilter<K extends number = number> extends Filter<K> {
  local?: boolean;
}

/** Additional options to apply to the whole subscription. */
interface GetFiltersOpts {
  /** How long to wait (in milliseconds) until aborting the request. */
  timeout?: number;
  /** Event limit for the whole subscription. */
  limit?: number;
}

export type { DittoFilter, GetFiltersOpts };

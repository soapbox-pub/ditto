import { type NostrEvent, type NostrFilter } from '@/deps.ts';

import { type DittoEvent } from './DittoEvent.ts';

/** Additional properties that may be added by Ditto to events. */
export type DittoRelation = Exclude<keyof DittoEvent, keyof NostrEvent>;

/** Custom filter interface that extends Nostr filters with extra options for Ditto. */
export interface DittoFilter extends NostrFilter {
  /** Whether the event was authored by a local user. */
  local?: boolean;
}

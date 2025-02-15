import { NostrEvent } from '@nostrify/nostrify';
import { DittoEvent } from '@/interfaces/DittoEvent.ts';

/** Additional properties that may be added by Ditto to events. */
export type DittoRelation = Exclude<keyof DittoEvent, keyof NostrEvent>;

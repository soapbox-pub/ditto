import { type NostrEvent } from '@/deps.ts';

import { type DittoEvent } from './DittoEvent.ts';

/** Additional properties that may be added by Ditto to events. */
export type DittoRelation = Exclude<keyof DittoEvent, keyof NostrEvent>;

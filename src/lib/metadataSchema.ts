import { NSchema as n } from '@nostrify/nostrify';
import { z } from 'zod';

import { parseNip05Address } from '@/lib/nip05';

/**
 * NIP-05 also takes a bare domain (the root user `_@domain`), which
 * `n.metadata()`'s email check rejects. Kept as typed, not canonicalized.
 */
export const nip05FieldSchema = z.string().refine((value) => parseNip05Address(value) !== undefined);

/**
 * Kind 0 content → metadata. Built once: `n.json()` and `n.metadata()`
 * construct a new zod pipeline on every call.
 */
export const metadataSchema = n.json().pipe(n.metadata().extend({
  nip05: nip05FieldSchema.optional().catch(undefined),
}));

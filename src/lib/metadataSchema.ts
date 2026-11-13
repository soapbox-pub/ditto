import { NSchema as n } from '@nostrify/nostrify';
import { z } from 'zod';

import { parseNip05Address } from '@/lib/nip05';
import { sanitizeUrl } from '@/lib/sanitizeUrl';

/**
 * NIP-05 also takes a bare domain (the root user `_@domain`), which
 * `n.metadata()`'s email check rejects. Kept as typed, not canonicalized.
 */
export const nip05FieldSchema = z.string().refine((value) => parseNip05Address(value) !== undefined);

/**
 * An image every viewer loads: https only. `n.metadata()` takes any URL, and
 * an `http:` one leaks each viewer's IP in cleartext.
 */
const imageUrlSchema = z.string().transform((value) => sanitizeUrl(value)).optional().catch(undefined);

/**
 * Kind 0 content → metadata. Built once: `n.json()` and `n.metadata()`
 * construct a new zod pipeline on every call.
 */
export const metadataSchema = n.json().pipe(n.metadata().extend({
  nip05: nip05FieldSchema.optional().catch(undefined),
  picture: imageUrlSchema,
  banner: imageUrlSchema,
}));

/**
 * A kind 0 `picture` or `banner` as published, if it's any URL — including
 * the non-https ones `metadataSchema` won't display. Edit forms prefill from
 * this, so saving a profile doesn't silently erase the user's image.
 */
export function publishedImageUrl(content: string | undefined, key: 'picture' | 'banner'): string | undefined {
  try {
    const parsed: unknown = JSON.parse(content ?? '');
    if (parsed === null || typeof parsed !== 'object') return undefined;
    const value = (parsed as Record<string, unknown>)[key];
    return typeof value === 'string' && URL.canParse(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

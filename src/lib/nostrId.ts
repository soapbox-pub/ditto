import { NSchema as n } from '@nostrify/nostrify';

/**
 * Branded type for a validated 32-byte Nostr identifier (pubkey or event id):
 * a 64-character lowercase hex string.
 *
 * Use `isNostrId` to produce a `HexId` from untrusted input, or `assertNostrId`
 * to assert that a `string` is already a `HexId`. Functions consuming a `HexId`
 * (e.g. `nip19.npubEncode` via wrappers) can trust it without re-validating.
 */
export type HexId = string & { readonly __brand: 'HexId' };

/**
 * Canonical validator for 32-byte Nostr identifiers — pubkeys and event ids.
 *
 * Backed by Nostrify's {@link NSchema.id} so the rest of the stack inherits
 * any future tightening upstream (e.g. case rules or whitespace handling).
 *
 * Use this **at the parse layer** whenever a pubkey or event id is extracted
 * from untrusted event content (tag values, JSON-parsed content, URL params)
 * before it reaches `nip19.*Encode`, `nostr.query` filters, or React route
 * params. Malformed hex of the wrong length throws "padded hex string
 * expected" from `@noble/hashes` deep inside `nip19`, which crashes the
 * rendering subtree.
 *
 * Returns a type guard narrowing to {@link HexId} — the false branch retains
 * the input's original type, so existing `string` callers keep working.
 *
 * Prefer the {@link tryNpubEncode}/{@link tryNeventEncode}/{@link tryNaddrEncode}
 * wrappers from `@/lib/safeNip19` for non-throwing encodes at the render site.
 */
export function isNostrId(value: unknown): value is HexId {
  return idSchema.safeParse(value).success;
}

const idSchema = n.id();

import { isNostrId } from '@/lib/nostrId';

/**
 * The three components of a NIP-01 addressable-event coordinate
 * (`<kind>:<pubkey>:<d-tag>`), with the pubkey already validated as a
 * 64-char lowercase hex string.
 *
 * Because `pubkey` is validated, callers can pass it straight to
 * `nip19.naddrEncode` or `nostr.query({ authors: [pubkey] })` without
 * re-checking — the encoders won't throw "padded hex string expected"
 * from `@noble/hashes` deep inside `nip19`, and relay queries won't be
 * wasted on syntactically-invalid filters.
 *
 * Note: `identifier` (the `d`-tag) is allowed to be empty and may contain
 * additional `:` separators, which is why this parser uses
 * `parts.slice(2).join(':')` rather than `parts[2]`.
 */
export interface ParsedAddr {
  kind: number;
  pubkey: string;
  identifier: string;
}

/**
 * Parse a NIP-01 addressable-event coordinate string (`<kind>:<pubkey>:<d-tag>`).
 *
 * Used for any tag value in that form: the most common cases are NIP-22 `A`
 * tags on kind 1111 comments, NIP-58 `a` tags on profile-badges / badge-set
 * events, NIP-89 `a` tags on application handlers, NIP-51 list `a` tags,
 * NIP-84 highlight source `a` tags, music-playlist track refs, etc.
 *
 * Returns `undefined` unless:
 * - The kind segment parses to a finite number.
 * - The pubkey segment is a valid 64-char lowercase hex string (per
 *   {@link isNostrId} → Nostrify's `NSchema.id()`).
 *
 * The `d`-tag is permitted to be empty and to contain `:` characters,
 * which the spec allows and several real-world events rely on.
 *
 * **Establish validity at the parse layer.** Renderers consuming a
 * `ParsedAddr` should not re-validate the pubkey, and may pass it
 * directly to `nip19.naddrEncode` without using the `tryNaddrEncode`
 * wrapper from {@link safeNip19}.
 */
export function parseAddr(value: string | undefined): ParsedAddr | undefined {
  if (!value) return undefined;
  const parts = value.split(':');
  if (parts.length < 3) return undefined;
  const kind = Number(parts[0]);
  if (!Number.isFinite(kind)) return undefined;
  const pubkey = parts[1];
  if (!isNostrId(pubkey)) return undefined;
  return { kind, pubkey, identifier: parts.slice(2).join(':') };
}

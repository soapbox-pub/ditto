import { nip19 } from 'nostr-tools';
import type {
  AddressPointer,
  EventPointer,
  NAddr,
  NEvent,
  NPub,
  Note,
  NProfile,
  ProfilePointer,
} from 'nostr-tools/nip19';

import { isNostrId } from '@/lib/nostrId';

/**
 * Non-throwing wrappers around `nip19.*Encode` from `nostr-tools`.
 *
 * The underlying encoders call `@noble/hashes` `hexToBytes`, which throws
 * "padded hex string expected, got unpadded hex of length N" whenever a
 * pubkey or event id isn't a valid 64-char lowercase hex string. That
 * exception bubbles out of render code and crashes the entire React
 * subtree (caught only by the top-level `ErrorBoundary`).
 *
 * Use these wrappers when the input may have come from untrusted event
 * data — tag values, JSON content, URL params — rather than directly from
 * a Nostrify-validated `NostrEvent.pubkey`/`event.id`. They return
 * `undefined` instead of throwing, letting callers gracefully skip a row
 * or fall back to a safe link target.
 *
 * For the common "encode-from-NostrEvent" case (replaceable vs regular
 * kind routing), prefer `encodeEventAddress` from `@/lib/encodeEvent`.
 */

/** `nip19.npubEncode`, but returns `undefined` for non-hex input. */
export function tryNpubEncode(pubkey: string | null | undefined): NPub | undefined {
  if (!isNostrId(pubkey)) return undefined;
  return nip19.npubEncode(pubkey);
}

/** `nip19.noteEncode`, but returns `undefined` for non-hex input. */
export function tryNoteEncode(id: string | null | undefined): Note | undefined {
  if (!isNostrId(id)) return undefined;
  return nip19.noteEncode(id);
}

/**
 * `nip19.neventEncode`, but returns `undefined` if `id` (or, when present,
 * `author`) isn't a valid 64-char hex string. A malformed `author` is
 * silently dropped rather than failing the whole encode, so callers still
 * get a usable nevent link.
 */
export function tryNeventEncode(input: EventPointer): NEvent | undefined {
  if (!isNostrId(input.id)) return undefined;
  const author = isNostrId(input.author) ? input.author : undefined;
  return nip19.neventEncode({ ...input, author });
}

/**
 * `nip19.naddrEncode`, but returns `undefined` if `pubkey` isn't a valid
 * 64-char hex string. `identifier` may be any string (including empty).
 */
export function tryNaddrEncode(input: AddressPointer): NAddr | undefined {
  if (!isNostrId(input.pubkey)) return undefined;
  return nip19.naddrEncode(input);
}

/**
 * `nip19.nprofileEncode`, but returns `undefined` if `pubkey` isn't a
 * valid 64-char hex string.
 */
export function tryNprofileEncode(input: ProfilePointer): NProfile | undefined {
  if (!isNostrId(input.pubkey)) return undefined;
  return nip19.nprofileEncode(input);
}

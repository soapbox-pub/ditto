import { NostrEvent, NSchema as n } from '@nostrify/nostrify';
import { nip19 } from 'nostr-tools';
import { z } from 'zod';

/** Get the current time in Nostr format. */
const nostrNow = (): number => Math.floor(Date.now() / 1000);

/** Convenience function to convert Nostr dates into native Date objects. */
const nostrDate = (seconds: number): Date => new Date(seconds * 1000);

/** Get pubkey from bech32 string, if applicable. */
function bech32ToPubkey(bech32: string): string | undefined {
  try {
    const decoded = nip19.decode(bech32);

    switch (decoded.type) {
      case 'nprofile':
        return decoded.data.pubkey;
      case 'npub':
        return decoded.data;
    }
  } catch {
    //
  }
}

interface Nip05 {
  /** Localpart of the nip05, eg `alex` in `alex@alexgleason.me`. */
  local: string | undefined;
  /** Domain of the nip05, eg `alexgleason.me` in `alex@alexgleason.me`. */
  domain: string;
  /** Value with underscore removed, eg `_@fiatjaf.com` becomes `fiatjaf.com`, but `alex@alexgleason.me` stays the same. */
  handle: string;
  /** The localpart, if available and not `_`. Otherwise the domain. */
  nickname: string;
  /** The full NIP-05 identifier. */
  value: string;
}

/**
 * Parse a NIP-05 identifier and return an object with metadata about it.
 * Throws if the value is not a valid NIP-05 identifier.
 */
function parseNip05(value: string): Nip05 {
  const match = value.match(/^(?:([\w.+-]+)@)?([\w.-]+)$/i);
  if (!match) throw new Error(`nip05: failed to parse ${value}`);

  const [_, local, domain] = match;
  return {
    local,
    domain,
    handle: local === '_' ? domain : value,
    nickname: (local && local !== '_') ? local : domain,
    value,
  };
}

/** Return the event's age in milliseconds. */
function eventAge(event: NostrEvent): number {
  return Date.now() - nostrDate(event.created_at).getTime();
}

function findTag(tags: string[][], name: string): string[] | undefined {
  return tags.find((tag) => tag[0] === name);
}

/**
 * Get sha256 hash (hex) of some text.
 * https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/digest#converting_a_digest_to_a_hex_string
 */
async function sha256(message: string): Promise<string> {
  const msgUint8 = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return hashHex;
}

/** Test whether the value is a Nostr ID. */
function isNostrId(value: unknown): boolean {
  return n.id().safeParse(value).success;
}

/** Test whether the value is a URL. */
function isURL(value: unknown): boolean {
  return z.string().url().safeParse(value).success;
}

export { bech32ToPubkey, eventAge, findTag, isNostrId, isURL, type Nip05, nostrDate, nostrNow, parseNip05, sha256 };

export { Time } from '@/utils/time.ts';

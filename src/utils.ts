import { NostrEvent, NSchema as n } from '@nostrify/nostrify';
import { nip19 } from 'nostr-tools';

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

/** Test whether the value is a Nostr ID. */
function isNostrId(value: unknown): boolean {
  return n.id().safeParse(value).success;
}

/** Render an empty author event so other things can stick to it. */
function fallbackAuthor(pubkey: string): NostrEvent {
  return {
    kind: 0,
    pubkey,
    content: '',
    tags: [],
    created_at: nostrNow(),
    id: '',
    sig: '',
  };
}

export { bech32ToPubkey, eventAge, fallbackAuthor, findTag, isNostrId, type Nip05, nostrDate, nostrNow, parseNip05 };

export { Time } from '@/utils/time.ts';

import { type EventTemplate, getEventHash, nip19, type NostrEvent, z } from '@/deps.ts';
import { getAuthor } from '@/queries.ts';
import { nip05Cache } from '@/utils/nip05.ts';
import { nostrIdSchema } from '@/schemas/nostr.ts';

/** Get the current time in Nostr format. */
const nostrNow = (): number => Math.floor(Date.now() / 1000);
/** Convenience function to convert Nostr dates into native Date objects. */
const nostrDate = (seconds: number): Date => new Date(seconds * 1000);

/** Pass to sort() to sort events by date. */
const eventDateComparator = (a: NostrEvent, b: NostrEvent): number => b.created_at - a.created_at;

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
  } catch (_) {
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
  };
}

/** Resolve a bech32 or NIP-05 identifier to an account. */
async function lookupAccount(value: string, signal = AbortSignal.timeout(3000)): Promise<NostrEvent | undefined> {
  console.log(`Looking up ${value}`);

  const pubkey = bech32ToPubkey(value) ||
    await nip05Cache.fetch(value, { signal }).then(({ pubkey }) => pubkey).catch(() => undefined);

  if (pubkey) {
    return getAuthor(pubkey);
  }
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

/** Schema to parse a relay URL. */
const relaySchema = z.string().max(255).startsWith('wss://').url();

/** Check whether the value is a valid relay URL. */
const isRelay = (relay: string): relay is `wss://${string}` => relaySchema.safeParse(relay).success;

/** Deduplicate events by ID. */
function dedupeEvents(events: NostrEvent[]): NostrEvent[] {
  return [...new Map(events.map((event) => [event.id, event])).values()];
}

/** Return a copy of the event with the given tags removed. */
function stripTags<E extends EventTemplate>(event: E, tags: string[] = []): E {
  if (!tags.length) return event;
  return {
    ...event,
    tags: event.tags.filter(([name]) => !tags.includes(name)),
  };
}

/** Ensure the template and event match on their shared keys. */
function eventMatchesTemplate(event: NostrEvent, template: EventTemplate): boolean {
  const whitelist = ['nonce'];

  event = stripTags(event, whitelist);
  template = stripTags(template, whitelist);

  if (template.created_at > event.created_at) {
    return false;
  }

  return getEventHash(event) === getEventHash({
    pubkey: event.pubkey,
    ...template,
    created_at: event.created_at,
  });
}

/** Test whether the value is a Nostr ID. */
function isNostrId(value: unknown): boolean {
  return nostrIdSchema.safeParse(value).success;
}

/** Test whether the value is a URL. */
function isURL(value: unknown): boolean {
  try {
    new URL(value as string);
    return true;
  } catch (_) {
    return false;
  }
}

export {
  bech32ToPubkey,
  dedupeEvents,
  eventAge,
  eventDateComparator,
  eventMatchesTemplate,
  findTag,
  isNostrId,
  isRelay,
  isURL,
  lookupAccount,
  type Nip05,
  nostrDate,
  nostrNow,
  parseNip05,
  relaySchema,
  sha256,
};

export { Time } from './utils/time.ts';

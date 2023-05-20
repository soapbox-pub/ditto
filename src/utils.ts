import { getAuthor } from '@/client.ts';
import { Context, getPublicKey, nip19, parseFormData } from '@/deps.ts';
import { type Event } from '@/event.ts';
import { lookupNip05Cached } from '@/nip05.ts';

/** Get the current time in Nostr format. */
const nostrNow = () => Math.floor(new Date().getTime() / 1000);

/** Pass to sort() to sort events by date. */
const eventDateComparator = (a: Event, b: Event) => b.created_at - a.created_at;

function getKeys(c: Context) {
  const auth = c.req.headers.get('Authorization') || '';

  if (auth.startsWith('Bearer ')) {
    const privatekey = auth.split('Bearer ')[1];
    const pubkey = getPublicKey(privatekey);

    return {
      privatekey,
      pubkey,
    };
  }
}

/** Return true if the value is a bech32 string, eg for use with NIP-19. */
function isBech32(value: unknown): value is string {
  return typeof value === 'string' && nip19.BECH32_REGEX.test(value);
}

/** Return true if the value is a Nostr pubkey, private key, or event ID. */
function isNostrId(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
}

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
async function lookupAccount(value: string): Promise<Event<0> | undefined> {
  console.log(`Looking up ${value}`);

  const pubkey = bech32ToPubkey(value) || await lookupNip05Cached(value);

  if (pubkey) {
    return getAuthor(pubkey);
  }
}

/** Parse request body to JSON, depending on the content-type of the request. */
async function parseBody(req: Request): Promise<unknown> {
  switch (req.headers.get('content-type')?.split(';')[0]) {
    case 'multipart/form-data':
    case 'application/x-www-form-urlencoded':
      return parseFormData(await req.formData());
    case 'application/json':
      return req.json();
  }
}

export {
  bech32ToPubkey,
  eventDateComparator,
  getKeys,
  isBech32,
  isNostrId,
  lookupAccount,
  type Nip05,
  nostrNow,
  parseBody,
  parseNip05,
};

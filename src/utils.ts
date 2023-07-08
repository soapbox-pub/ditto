import { getAuthor } from '@/client.ts';
import { Conf } from '@/config.ts';
import { nip19, parseFormData, z } from '@/deps.ts';
import { type Event } from '@/event.ts';
import { lookupNip05Cached } from '@/nip05.ts';

/** Get the current time in Nostr format. */
const nostrNow = () => Math.floor(new Date().getTime() / 1000);
/** Convenience function to convert Nostr dates into native Date objects. */
const nostrDate = (seconds: number) => new Date(seconds * 1000);

/** Pass to sort() to sort events by date. */
const eventDateComparator = (a: Event, b: Event) => b.created_at - a.created_at;

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

const paginationSchema = z.object({
  since: z.coerce.number().optional().catch(undefined),
  until: z.coerce.number().catch(nostrNow()),
  limit: z.coerce.number().min(0).max(40).catch(20),
});

type PaginationParams = z.infer<typeof paginationSchema>;

function buildLinkHeader(url: string, events: Event[]): string | undefined {
  if (!events.length) return;
  const firstEvent = events[0];
  const lastEvent = events[events.length - 1];

  const { pathname, search } = new URL(url);
  const next = new URL(pathname + search, Conf.localDomain);
  const prev = new URL(pathname + search, Conf.localDomain);

  next.searchParams.set('until', String(lastEvent.created_at));
  prev.searchParams.set('since', String(firstEvent.created_at));

  return `<${next}>; rel="next", <${prev}>; rel="prev"`;
}

export {
  bech32ToPubkey,
  buildLinkHeader,
  eventDateComparator,
  lookupAccount,
  type Nip05,
  nostrDate,
  nostrNow,
  type PaginationParams,
  paginationSchema,
  parseBody,
  parseNip05,
};

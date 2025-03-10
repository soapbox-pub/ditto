import { NKinds, NostrEvent, NostrFilter, NPool, NRelay, NSchema as n, NStore } from '@nostrify/nostrify';
import { nip19, sortEvents } from 'nostr-tools';
import { match } from 'path-to-regexp';
import tldts from 'tldts';

import { getAuthor } from '@/queries.ts';
import { bech32ToPubkey } from '@/utils.ts';
import { lookupNip05 } from '@/utils/nip05.ts';

import type { DittoConf } from '@ditto/conf';
import type { DittoDB } from '@ditto/db';

interface LookupAccountOpts {
  db: DittoDB;
  conf: DittoConf;
  relay: NStore;
  signal?: AbortSignal;
}

/** Resolve a bech32 or NIP-05 identifier to an account. */
export async function lookupAccount(
  value: string,
  opts: LookupAccountOpts,
): Promise<NostrEvent | undefined> {
  const pubkey = await lookupPubkey(value, opts);

  if (pubkey) {
    return getAuthor(pubkey, opts);
  }
}

/** Resolve a bech32 or NIP-05 identifier to a pubkey. */
export async function lookupPubkey(value: string, opts: LookupAccountOpts): Promise<string | undefined> {
  if (n.bech32().safeParse(value).success) {
    return bech32ToPubkey(value);
  }

  try {
    const { pubkey } = await lookupNip05(value, opts);
    return pubkey;
  } catch {
    return;
  }
}

/** Extract an acct or bech32 identifier out of a URL or of itself. */
export function extractIdentifier(value: string): string | undefined {
  value = value.trim();

  try {
    const uri = new URL(value);
    switch (uri.protocol) {
      // Extract from NIP-19 URI, eg `nostr:npub1q3sle0kvfsehgsuexttt3ugjd8xdklxfwwkh559wxckmzddywnws6cd26p`.
      case 'nostr:':
        value = uri.pathname;
        break;
      // Extract from URL, eg `https://njump.me/npub1q3sle0kvfsehgsuexttt3ugjd8xdklxfwwkh559wxckmzddywnws6cd26p`.
      case 'http:':
      case 'https:': {
        const accountUriMatch = match<{ acct: string }>('/users/:acct')(uri.pathname);
        const accountUrlMatch = match<{ acct: string }>('/\\@:acct')(uri.pathname);
        const statusUriMatch = match<{ acct: string; id: string }>('/users/:acct/statuses/:id')(uri.pathname);
        const statusUrlMatch = match<{ acct: string; id: string }>('/\\@:acct/:id')(uri.pathname);
        const soapboxMatch = match<{ acct: string; id: string }>('/\\@:acct/posts/:id')(uri.pathname);
        const nostrMatch = match<{ bech32: string }>('/:bech32')(uri.pathname);
        if (accountUriMatch) {
          value = accountUriMatch.params.acct;
        } else if (accountUrlMatch) {
          value = accountUrlMatch.params.acct;
        } else if (statusUriMatch) {
          value = nip19.noteEncode(statusUriMatch.params.id);
        } else if (statusUrlMatch) {
          value = nip19.noteEncode(statusUrlMatch.params.id);
        } else if (soapboxMatch) {
          value = nip19.noteEncode(soapboxMatch.params.id);
        } else if (nostrMatch) {
          value = nostrMatch.params.bech32;
        }
        break;
      }
    }
  } catch {
    // fall through
  }

  value = value.replace(/^@/, '');

  if (isBech32(value)) {
    return value;
  }

  if (isUsername(value)) {
    return value;
  }
}

interface LookupEventsOpts {
  db: DittoDB;
  conf: DittoConf;
  pool: NPool<NRelay>;
  relay: NStore;
  signal?: AbortSignal;
}

export async function lookupEvent(value: string, opts: LookupEventsOpts): Promise<NostrEvent | undefined> {
  const { pool, relay, signal } = opts;

  const identifier = extractIdentifier(value);
  if (!identifier) return;

  let result: DittoPointer;

  if (isBech32(identifier)) {
    result = bech32ToPointer(identifier);
  } else if (isUsername(identifier)) {
    result = { type: 'address', pointer: { kind: 0, identifier: '', ...await lookupNip05(identifier, opts) } };
  } else {
    throw new Error('Unsupported identifier: neither bech32 nor username');
  }

  const filter = pointerToFilter(result);
  const relayUrls = new Set<string>(result.pointer.relays ?? []);

  const [event] = await relay.query([filter], { signal });

  if (event) {
    return event;
  }

  let pubkey: string | undefined;

  if (result.type === 'address') {
    pubkey = result.pointer.pubkey;
  } else if (result.type === 'event') {
    pubkey = result.pointer.author;
  }

  if (pubkey) {
    let [relayList] = await relay.query([{ kinds: [10002], authors: [pubkey] }], { signal });

    if (!relayList) {
      [relayList] = await pool.query([{ kinds: [10002], authors: [pubkey] }], { signal });
      if (relayList) {
        await relay.event(relayList);
      }
    }

    if (relayList) {
      for (const relayUrl of getEventRelayUrls(relayList)) {
        relayUrls.add(relayUrl);
      }
    }
  }

  const urls = [...relayUrls].slice(0, 5);

  if (result.type === 'address') {
    const results = await Promise.all(urls.map((relayUrl) => pool.relay(relayUrl).query([filter], { signal })));
    const [event] = sortEvents(results.flat());
    if (event) {
      await relay.event(event, { signal });
      return event;
    }
  }

  if (result.type === 'event') {
    const [event] = await Promise.any(urls.map((relayUrl) => pool.relay(relayUrl).query([filter], { signal })));
    if (event) {
      await relay.event(event, { signal });
      return event;
    }
  }
}

type DittoPointer = { type: 'event'; pointer: nip19.EventPointer } | { type: 'address'; pointer: nip19.AddressPointer };

function bech32ToPointer(bech32: string): DittoPointer {
  const decoded = nip19.decode(bech32);

  switch (decoded.type) {
    case 'note':
      return { type: 'event', pointer: { id: decoded.data } };
    case 'nevent':
      return { type: 'event', pointer: decoded.data };
    case 'npub':
      return { type: 'address', pointer: { kind: 0, identifier: '', pubkey: decoded.data } };
    case 'nprofile':
      return { type: 'address', pointer: { kind: 0, identifier: '', ...decoded.data } };
    case 'naddr':
      return { type: 'address', pointer: decoded.data };
  }

  throw new Error('Invalid bech32 pointer');
}

function pointerToFilter(pointer: DittoPointer): NostrFilter {
  switch (pointer.type) {
    case 'event': {
      const { id, kind, author } = pointer.pointer;
      const filter: NostrFilter = { ids: [id] };

      if (kind) {
        filter.kinds = [kind];
      }

      if (author) {
        filter.authors = [author];
      }

      return filter;
    }
    case 'address': {
      const { kind, identifier, pubkey } = pointer.pointer;
      const filter: NostrFilter = { kinds: [kind], authors: [pubkey] };

      if (NKinds.replaceable(kind)) {
        filter['#d'] = [identifier];
      }

      return filter;
    }
  }
}

function isUsername(value: string): boolean {
  const { isIcann, domain } = tldts.parse(value);
  return Boolean(isIcann && domain);
}

function isBech32(value: string): value is `${string}1${string}` {
  return n.bech32().safeParse(value).success;
}

function getEventRelayUrls(event: NostrEvent, marker?: 'read' | 'write'): Set<`wss://${string}`> {
  const relays = new Set<`wss://${string}`>();

  for (const [name, relayUrl, _marker] of event.tags) {
    if (name === 'r' && (!marker || !_marker || marker === _marker)) {
      try {
        const url = new URL(relayUrl);
        if (url.protocol === 'wss:') {
          relays.add(url.toString() as `wss://${string}`);
        }
      } catch {
        // fallthrough
      }
    }
  }

  return relays;
}

import { NostrEvent, NSchema as n, NStore } from '@nostrify/nostrify';
import { nip19 } from 'nostr-tools';
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

  if (n.bech32().safeParse(value).success) {
    return value;
  }

  const { isIcann, domain } = tldts.parse(value);

  if (isIcann && domain) {
    return value;
  }
}

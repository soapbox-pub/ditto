import { DittoConf } from '@ditto/conf';
import { NIP05, NStore } from '@nostrify/nostrify';
import { logi } from '@soapbox/logi';
import { safeFetch } from '@soapbox/safe-fetch';
import { nip19 } from 'nostr-tools';
import tldts from 'tldts';

import { errorJson } from '@/utils/log.ts';

interface GetNip05Opts {
  conf: DittoConf;
  relay: NStore;
  signal?: AbortSignal;
  fetch?: typeof fetch;
}

export async function lookupNip05(nip05: string, opts: GetNip05Opts): Promise<nip19.ProfilePointer> {
  const { conf, signal } = opts;
  const tld = tldts.parse(nip05);

  if (!tld.isIcann || tld.isIp || tld.isPrivate) {
    throw new Error(`Invalid NIP-05: ${nip05}`);
  }

  logi({ level: 'info', ns: 'ditto.nip05', nip05, state: 'started' });

  const [name, domain] = nip05.split('@');

  try {
    if (domain === conf.url.host) {
      const pointer = await localNip05Lookup(name, opts);
      if (pointer) {
        logi({ level: 'info', ns: 'ditto.nip05', nip05, state: 'found', source: 'local', pubkey: pointer.pubkey });
        return pointer;
      } else {
        throw new Error(`Not found: ${nip05}`);
      }
    } else {
      const pointer = await NIP05.lookup(nip05, { fetch: opts.fetch ?? safeFetch, signal });
      logi({ level: 'info', ns: 'ditto.nip05', nip05, state: 'found', source: 'fetch', pubkey: pointer.pubkey });
      return pointer;
    }
  } catch (e) {
    logi({ level: 'info', ns: 'ditto.nip05', nip05, state: 'failed', error: errorJson(e) });
    throw e;
  }
}

export async function localNip05Lookup(
  localpart: string,
  opts: GetNip05Opts,
): Promise<nip19.ProfilePointer | undefined> {
  const { conf, relay, signal } = opts;

  const name = `${localpart}@${conf.url.host}`;

  const [grant] = await relay.query([{
    kinds: [30360],
    '#d': [name, name.toLowerCase()],
    authors: [await conf.signer.getPublicKey()],
    limit: 1,
  }], { signal });

  const pubkey = grant?.tags.find(([name]) => name === 'p')?.[1];

  if (pubkey) {
    return { pubkey, relays: [conf.relay] };
  }
}

import { NIP05, NostrEvent } from '@nostrify/nostrify';

import { getAuthor } from '@/queries.ts';
import { bech32ToPubkey } from '@/utils.ts';
import { nip05Cache } from '@/utils/nip05.ts';

/** Resolve a bech32 or NIP-05 identifier to an account. */
export async function lookupAccount(
  value: string,
  signal = AbortSignal.timeout(3000),
): Promise<NostrEvent | undefined> {
  const pubkey = await lookupPubkey(value, signal);

  if (pubkey) {
    return getAuthor(pubkey);
  }
}

/** Resolve a bech32 or NIP-05 identifier to a pubkey. */
export async function lookupPubkey(value: string, signal?: AbortSignal): Promise<string | undefined> {
  if (NIP05.regex().test(value)) {
    try {
      const { pubkey } = await nip05Cache.fetch(value, { signal });
      return pubkey;
    } catch {
      return;
    }
  }

  return bech32ToPubkey(value);
}

import { type NostrEvent } from '@/deps.ts';
import { getAuthor } from '@/queries.ts';
import { bech32ToPubkey } from '@/utils.ts';
import { nip05Cache } from '@/utils/nip05.ts';

/** Resolve a bech32 or NIP-05 identifier to an account. */
async function lookupAccount(value: string, signal = AbortSignal.timeout(3000)): Promise<NostrEvent | undefined> {
  console.log(`Looking up ${value}`);

  const pubkey = bech32ToPubkey(value) ||
    await nip05Cache.fetch(value, { signal }).then(({ pubkey }) => pubkey).catch(() => undefined);

  if (pubkey) {
    return getAuthor(pubkey);
  }
}

export { lookupAccount };

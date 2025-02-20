import { SetRequired } from 'type-fest';
import { getPublicKey } from 'nostr-tools';
import { NostrEvent, NostrSigner, NSchema as n, NStore } from '@nostrify/nostrify';
import { logi } from '@soapbox/logi';
import { stringToBytes } from '@scure/base';
import { z } from 'zod';

import { errorJson } from '@/utils/log.ts';
import { isNostrId } from '@/utils.ts';

type Data = {
  wallet: NostrEvent;
  nutzapInfo: NostrEvent;
  privkey: string;
  p2pk: string;
  mints: string[];
};

type CustomError =
  | { message: 'Wallet not found'; code: 'wallet-not-found' }
  | { message: 'Could not decrypt wallet content'; code: 'fail-decrypt-wallet' }
  | { message: 'Could not parse wallet content'; code: 'fail-parse-wallet' }
  | { message: 'Wallet does not contain privkey or privkey is not a valid nostr id'; code: 'privkey-missing' }
  | { message: 'Nutzap information event not found'; code: 'nutzap-info-not-found' }
  | {
    message:
      "You do not have a 'pubkey' tag in your nutzap information event or the one you have does not match the one derivated from the wallet.";
    code: 'pubkey-mismatch';
  }
  | { message: 'You do not have any mints in your nutzap information event.'; code: 'mints-missing' };

/** Ensures that the wallet event and nutzap information event are correct. */
async function validateAndParseWallet(
  store: NStore,
  signer: SetRequired<NostrSigner, 'nip44'>,
  pubkey: string,
  opts?: { signal?: AbortSignal },
): Promise<{ data: Data; error: null } | { data: null; error: CustomError }> {
  const [wallet] = await store.query([{ authors: [pubkey], kinds: [17375] }], { signal: opts?.signal });
  if (!wallet) {
    return { error: { message: 'Wallet not found', code: 'wallet-not-found' }, data: null };
  }

  let decryptedContent: string;
  try {
    decryptedContent = await signer.nip44.decrypt(pubkey, wallet.content);
  } catch (e) {
    logi({
      level: 'error',
      ns: 'ditto.api.cashu.wallet',
      id: wallet.id,
      kind: wallet.kind,
      error: errorJson(e),
    });
    return { data: null, error: { message: 'Could not decrypt wallet content', code: 'fail-decrypt-wallet' } };
  }

  let contentTags: string[][];
  try {
    contentTags = n.json().pipe(z.string().array().array()).parse(decryptedContent);
  } catch {
    return { data: null, error: { message: 'Could not parse wallet content', code: 'fail-parse-wallet' } };
  }

  const privkey = contentTags.find(([value]) => value === 'privkey')?.[1];
  if (!privkey || !isNostrId(privkey)) {
    return {
      data: null,
      error: { message: 'Wallet does not contain privkey or privkey is not a valid nostr id', code: 'privkey-missing' },
    };
  }
  const p2pk = getPublicKey(stringToBytes('hex', privkey));

  const [nutzapInfo] = await store.query([{ authors: [pubkey], kinds: [10019] }], { signal: opts?.signal });
  if (!nutzapInfo) {
    return { data: null, error: { message: 'Nutzap information event not found', code: 'nutzap-info-not-found' } };
  }

  const nutzapInformationPubkey = nutzapInfo.tags.find(([name]) => name === 'pubkey')?.[1];
  if (!nutzapInformationPubkey || (nutzapInformationPubkey !== p2pk)) {
    return {
      data: null,
      error: {
        message:
          "You do not have a 'pubkey' tag in your nutzap information event or the one you have does not match the one derivated from the wallet.",
        code: 'pubkey-mismatch',
      },
    };
  }

  const mints = [...new Set(nutzapInfo.tags.filter(([name]) => name === 'mint').map(([_, value]) => value))];
  if (mints.length < 1) {
    return {
      data: null,
      error: { message: 'You do not have any mints in your nutzap information event.', code: 'mints-missing' },
    };
  }

  return { data: { wallet, nutzapInfo, privkey, p2pk, mints }, error: null };
}

export { validateAndParseWallet };

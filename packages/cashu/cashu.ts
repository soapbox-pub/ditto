import type { Proof } from '@cashu/cashu-ts';
import { type NostrEvent, type NostrFilter, type NostrSigner, NSchema as n, type NStore } from '@nostrify/nostrify';
import { getPublicKey } from 'nostr-tools';
import { stringToBytes } from '@scure/base';
import { logi } from '@soapbox/logi';
import type { SetRequired } from 'type-fest';
import { z } from 'zod';

import { proofSchema, tokenEventSchema, type Wallet } from './schemas.ts';

type Data = {
  wallet: NostrEvent;
  nutzapInfo: NostrEvent;
  privkey: string;
  p2pk: string;
  mints: string[];
  relays: string[];
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

  const relays = [...new Set(nutzapInfo.tags.filter(([name]) => name === 'relay').map(([_, value]) => value))];

  return { data: { wallet, nutzapInfo, privkey, p2pk, mints, relays }, error: null };
}

type OrganizedProofs = {
  [mintUrl: string]: {
    /** Total balance in this mint */
    totalBalance: number;
    /** Event id */
    [eventId: string]: {
      event: NostrEvent;
      /** Total balance in this event */
      balance: number;
    } | number;
  };
};
async function organizeProofs(
  events: NostrEvent[],
  signer: SetRequired<NostrSigner, 'nip44'>,
): Promise<OrganizedProofs> {
  const organizedProofs: OrganizedProofs = {};
  const pubkey = await signer.getPublicKey();

  for (const event of events) {
    const decryptedContent = await signer.nip44.decrypt(pubkey, event.content);
    const { data: token, success } = n.json().pipe(tokenEventSchema).safeParse(decryptedContent);
    if (!success) {
      continue;
    }
    const { mint, proofs } = token;

    const balance = proofs.reduce((prev, current) => prev + current.amount, 0);

    if (!organizedProofs[mint]) {
      organizedProofs[mint] = { totalBalance: 0 };
    }

    organizedProofs[mint] = { ...organizedProofs[mint], [event.id]: { event, balance } };
    organizedProofs[mint].totalBalance += balance;
  }
  return organizedProofs;
}

/** Returns a spending history event that contains the last redeemed nutzap. */
async function getLastRedeemedNutzap(
  store: NStore,
  pubkey: string,
  opts?: { signal?: AbortSignal },
): Promise<NostrEvent | undefined> {
  const events = await store.query([{ kinds: [7376], authors: [pubkey] }], { signal: opts?.signal });

  for (const event of events) {
    const nutzap = event.tags.find(([name]) => name === 'e');
    const redeemed = nutzap?.[3];
    if (redeemed === 'redeemed') {
      return event;
    }
  }
}

/**
 * toBeRedeemed are the nutzaps that will be redeemed into a kind 7375 and saved in the kind 7376 tags
 * The tags format is: [
 *   [ "e", "<9321-event-id>", "<relay-hint>", "redeemed" ], // nutzap event that has been redeemed
 *   [ "p", "<sender-pubkey>" ] // pubkey of the author of the 9321 event (nutzap sender)
 * ]
 * https://github.com/nostr-protocol/nips/blob/master/61.md#updating-nutzap-redemption-history
 */
type MintsToProofs = { [key: string]: { proofs: Proof[]; toBeRedeemed: string[][] } };

/**
 * Gets proofs from nutzaps that have not been redeemed yet.
 * Each proof is associated with a specific mint.
 * @param store Store used to query for the nutzaps
 * @param nutzapsFilter Filter used to query for the nutzaps, most useful when
 * it contains a 'since' field so it saves time and resources
 * @param relay Relay hint where the new kind 7376 will be saved
 * @returns MintsToProofs An object where each key is a mint url and the values are an array of proofs
 * and an array of redeemed tags in this format:
 * ```
 * [
 *    ...,
 *    [ "e", "<9321-event-id>", "<relay-hint>", "redeemed" ], // nutzap event that has been redeemed
 *    [ "p", "<sender-pubkey>" ] // pubkey of the author of the 9321 event (nutzap sender)
 * ]
 * ```
 */
async function getMintsToProofs(
  store: NStore,
  nutzapsFilter: NostrFilter,
  relay: string,
  opts?: { signal?: AbortSignal },
): Promise<MintsToProofs> {
  const mintsToProofs: MintsToProofs = {};

  const nutzaps = await store.query([nutzapsFilter], { signal: opts?.signal });

  for (const event of nutzaps) {
    try {
      const mint = event.tags.find(([name]) => name === 'u')?.[1];
      if (!mint) {
        continue;
      }

      const proofs = event.tags.filter(([name]) => name === 'proof').map((tag) => tag[1]).filter(Boolean);
      if (proofs.length < 1) {
        continue;
      }

      if (!mintsToProofs[mint]) {
        mintsToProofs[mint] = { proofs: [], toBeRedeemed: [] };
      }

      const parsed = n.json().pipe(
        proofSchema,
      ).array().safeParse(proofs);

      if (!parsed.success) {
        continue;
      }

      mintsToProofs[mint].proofs = [...mintsToProofs[mint].proofs, ...parsed.data];
      mintsToProofs[mint].toBeRedeemed = [
        ...mintsToProofs[mint].toBeRedeemed,
        [
          'e', // nutzap event that has been redeemed
          event.id,
          relay,
          'redeemed',
        ],
        ['p', event.pubkey], // pubkey of the author of the 9321 event (nutzap sender)
      ];
    } catch (e) {
      logi({ level: 'error', ns: 'ditto.api.cashu.wallet.swap', error: errorJson(e) });
    }
  }

  return mintsToProofs;
}

/** Returns a wallet entity with the latest balance. */
async function getWallet(
  store: NStore,
  pubkey: string,
  signer: SetRequired<NostrSigner, 'nip44'>,
  opts?: { signal?: AbortSignal },
): Promise<{ wallet: Wallet; error: null } | { wallet: null; error: CustomError }> {
  const { data, error } = await validateAndParseWallet(store, signer, pubkey, { signal: opts?.signal });

  if (error) {
    logi({ level: 'error', ns: 'ditto.cashu.get_wallet', error: errorJson(error) });
    return { wallet: null, error };
  }

  const { p2pk, mints, relays } = data;

  let balance = 0;

  const tokens = await store.query([{ authors: [pubkey], kinds: [7375] }], { signal: opts?.signal });
  for (const token of tokens) {
    try {
      const decryptedContent: { mint: string; proofs: Proof[] } = JSON.parse(
        await signer.nip44.decrypt(pubkey, token.content),
      );

      if (!mints.includes(decryptedContent.mint)) {
        mints.push(decryptedContent.mint);
      }

      balance += decryptedContent.proofs.reduce((accumulator, current) => {
        return accumulator + current.amount;
      }, 0);
    } catch (e) {
      logi({ level: 'error', ns: 'dtto.cashu.get_wallet', error: errorJson(e) });
    }
  }

  // TODO: maybe change the 'Wallet' type data structure so each mint is a key and the value are the tokens associated with a given mint
  const walletEntity: Wallet = {
    pubkey_p2pk: p2pk,
    mints,
    relays,
    balance,
  };

  return { wallet: walletEntity, error: null };
}

/** Serialize an error into JSON for JSON logging. */
export function errorJson(error: unknown): Error | null {
  if (error instanceof Error) {
    return error;
  } else {
    return null;
  }
}

function isNostrId(value: unknown): boolean {
  return n.id().safeParse(value).success;
}

export { getLastRedeemedNutzap, getMintsToProofs, getWallet, organizeProofs, validateAndParseWallet };

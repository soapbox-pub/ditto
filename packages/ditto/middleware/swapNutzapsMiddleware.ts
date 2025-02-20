import { CashuMint, CashuWallet, getEncodedToken, type Proof } from '@cashu/cashu-ts';
import { type DittoConf } from '@ditto/conf';
import { MiddlewareHandler } from '@hono/hono';
import { HTTPException } from '@hono/hono/http-exception';
import { getPublicKey } from 'nostr-tools';
import { NostrEvent, NostrFilter, NostrSigner, NSchema as n, NStore } from '@nostrify/nostrify';
import { SetRequired } from 'type-fest';
import { stringToBytes } from '@scure/base';
import { logi } from '@soapbox/logi';
import { z } from 'zod';

import { isNostrId } from '@/utils.ts';
import { errorJson } from '@/utils/log.ts';
import { createEvent } from '@/utils/api.ts';

/**
 * Swap nutzaps into wallet (create new events) if the user has a wallet, otheriwse, just fallthrough.
 * Errors are only thrown if 'signer' and 'store' middlewares are not set.
 */
export const swapNutzapsMiddleware: MiddlewareHandler<
  { Variables: { signer: SetRequired<NostrSigner, 'nip44'>; store: NStore; conf: DittoConf } }
> = async (c, next) => {
  const { conf } = c.var;
  const signer = c.get('signer');
  const store = c.get('store');

  if (!signer) {
    throw new HTTPException(401, { message: 'No pubkey provided' });
  }

  if (!signer.nip44) {
    throw new HTTPException(401, { message: 'No NIP-44 signer provided' });
  }

  if (!store) {
    throw new HTTPException(401, { message: 'No store provided' });
  }

  const { signal } = c.req.raw;
  const pubkey = await signer.getPublicKey();
  const [wallet] = await store.query([{ authors: [pubkey], kinds: [17375] }], { signal });

  if (wallet) {
    let decryptedContent: string;
    try {
      decryptedContent = await signer.nip44.decrypt(pubkey, wallet.content);
    } catch (e) {
      logi({
        level: 'error',
        ns: 'ditto.api.cashu.wallet.swap',
        id: wallet.id,
        kind: wallet.kind,
        error: errorJson(e),
      });
      return c.json({ error: 'Could not decrypt wallet content.' }, 400);
    }

    let contentTags: string[][];
    try {
      contentTags = n.json().pipe(z.string().array().array()).parse(decryptedContent);
    } catch {
      return c.json({ error: 'Could not parse the decrypted wallet content.' }, 400);
    }

    const privkey = contentTags.find(([value]) => value === 'privkey')?.[1];
    if (!privkey || !isNostrId(privkey)) {
      return c.json({ error: 'Wallet does not contain privkey or privkey is not a valid nostr id.' }, 400);
    }
    const p2pk = getPublicKey(stringToBytes('hex', privkey));

    const [nutzapInformation] = await store.query([{ authors: [pubkey], kinds: [10019] }], { signal });
    if (!nutzapInformation) {
      return c.json({ error: 'You need to have a nutzap information event so we can get the mints.' }, 400);
    }

    const nutzapInformationPubkey = nutzapInformation.tags.find(([name]) => name === 'pubkey')?.[1];
    if (!nutzapInformationPubkey || (nutzapInformationPubkey !== p2pk)) {
      return c.json({
        error:
          "You do not have a 'pubkey' tag in your nutzap information event or the one you have does not match the one derivated from the wallet.",
      }, 400);
    }

    const mints = [...new Set(nutzapInformation.tags.filter(([name]) => name === 'mint').map(([_, value]) => value))];
    if (mints.length < 1) {
      return c.json({ error: 'You do not have any mints in your nutzap information event.' }, 400);
    }

    const nutzapsFilter: NostrFilter = { kinds: [9321], '#p': [pubkey], '#u': mints };

    const lastRedeemedNutzap = await getLastRedeemedNutzap(store, pubkey, { signal });
    if (lastRedeemedNutzap) {
      nutzapsFilter.since = lastRedeemedNutzap.created_at;
    }

    const mintsToProofs = await getMintsToProofs(store, nutzapsFilter, conf.relay, { signal });

    // TODO: throw error if mintsToProofs is an empty object?
    for (const mint of Object.keys(mintsToProofs)) {
      try {
        const token = getEncodedToken({ mint, proofs: mintsToProofs[mint].proofs });

        const cashuWallet = new CashuWallet(new CashuMint(mint));
        const receiveProofs = await cashuWallet.receive(token, { privkey });

        const unspentProofs = await createEvent({
          kind: 7375,
          content: await signer.nip44.encrypt(
            pubkey,
            JSON.stringify({
              mint,
              proofs: receiveProofs,
            }),
          ),
        }, c);

        const amount = receiveProofs.reduce((accumulator, current) => {
          return accumulator + current.amount;
        }, 0);

        await createEvent({
          kind: 7376,
          content: await signer.nip44.encrypt(
            pubkey,
            JSON.stringify([
              ['direction', 'in'],
              ['amount', amount],
              ['e', unspentProofs.id, conf.relay, 'created'],
            ]),
          ),
          tags: mintsToProofs[mint].redeemed,
        }, c);
      } catch (e) {
        logi({ level: 'error', ns: 'ditto.api.cashu.wallet.swap', error: errorJson(e) });
      }
    }
  }

  await next();
};

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
): Promise<{ [key: string]: { proofs: Proof[]; redeemed: string[][] } }> {
  const mintsToProofs: { [key: string]: { proofs: Proof[]; redeemed: string[][] } } = {};

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
        mintsToProofs[mint] = { proofs: [], redeemed: [] };
      }

      const parsed = n.json().pipe(
        z.object({
          id: z.string(),
          amount: z.number(),
          secret: z.string(),
          C: z.string(),
          dleq: z.object({ s: z.string(), e: z.string(), r: z.string().optional() }).optional(),
          dleqValid: z.boolean().optional(),
        }),
      ).array().safeParse(proofs);

      if (!parsed.success) {
        continue;
      }

      mintsToProofs[mint].proofs = [...mintsToProofs[mint].proofs, ...parsed.data];
      mintsToProofs[mint].redeemed = [
        ...mintsToProofs[mint].redeemed,
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

import { Hono } from '@hono/hono';
import { CashuMint, CashuWallet, getEncodedToken, type Proof } from '@cashu/cashu-ts';
import { NostrFilter } from '@nostrify/nostrify';
import { logi } from '@soapbox/logi';
import { generateSecretKey, getPublicKey } from 'nostr-tools';
import { bytesToString, stringToBytes } from '@scure/base';
import { z } from 'zod';

import { Conf } from '@/config.ts';
import { isNostrId } from '@/utils.ts';
import { createEvent, parseBody } from '@/utils/api.ts';
import { errorJson } from '@/utils/log.ts';
import { signerMiddleware } from '@/middleware/signerMiddleware.ts';
import { requireNip44Signer } from '@/middleware/requireSigner.ts';
import { storeMiddleware } from '@/middleware/storeMiddleware.ts';

const app = new Hono().use('*', storeMiddleware, signerMiddleware);

// CASHU_MINTS = ['https://mint.cashu.io/1', 'https://mint.cashu.io/2', 'https://mint.cashu.io/3']

// Mint: https://github.com/cashubtc/nuts/blob/main/06.md

// app.get('/mints') -> Mint[]

// app.get(swapMiddleware, '/wallet') -> Wallet, 404
// app.put('/wallet') -> Wallet
// app.delete('/wallet') -> 204

// app.post('/swap') Maybe make this a middleware? Also pipeline interaction.

// app.post(swapMiddleware, '/nutzap');

/* GET /api/v1/ditto/cashu/wallet -> Wallet, 404 */
/* PUT /api/v1/ditto/cashu/wallet -> Wallet */
/* DELETE /api/v1/ditto/cashu/wallet -> 204 */

export interface Wallet {
  pubkey_p2pk: string;
  mints: string[];
  relays: string[];
  balance: number;
}

interface Nutzap {
  amount: number;
  event_id?: string;
  mint: string; // mint the nutzap was created
  recipient_pubkey: string;
}

const createCashuWalletAndNutzapInfoSchema = z.object({
  mints: z.array(z.string().url()).nonempty().transform((val) => {
    return [...new Set(val)];
  }),
});

/**
 * Creates a replaceable Cashu wallet and a replaceable nutzap information event.
 * https://github.com/nostr-protocol/nips/blob/master/60.md
 * https://github.com/nostr-protocol/nips/blob/master/61.md#nutzap-informational-event
 */
app.put('/wallet', requireNip44Signer, async (c) => {
  const signer = c.get('signer');
  const store = c.get('store');
  const pubkey = await signer.getPublicKey();
  const body = await parseBody(c.req.raw);
  const { signal } = c.req.raw;
  const result = createCashuWalletAndNutzapInfoSchema.safeParse(body);

  if (!result.success) {
    return c.json({ error: 'Bad schema', schema: result.error }, 400);
  }

  const { mints } = result.data;

  const [event] = await store.query([{ authors: [pubkey], kinds: [17375] }], { signal });
  if (event) {
    return c.json({ error: 'You already have a wallet 😏' }, 400);
  }

  const walletContentTags: string[][] = [];

  const sk = generateSecretKey();
  const privkey = bytesToString('hex', sk);
  const p2pk = getPublicKey(stringToBytes('hex', privkey));

  walletContentTags.push(['privkey', privkey]);

  for (const mint of mints) {
    walletContentTags.push(['mint', mint]);
  }

  const encryptedWalletContentTags = await signer.nip44.encrypt(pubkey, JSON.stringify(walletContentTags));

  // Wallet
  await createEvent({
    kind: 17375,
    content: encryptedWalletContentTags,
  }, c);

  // Nutzap information
  await createEvent({
    kind: 10019,
    tags: [
      ...mints.map((mint) => ['mint', mint, 'sat']),
      ['relay', Conf.relay], // TODO: add more relays once things get more stable
      ['pubkey', p2pk],
    ],
  }, c);

  // TODO: hydrate wallet and add a 'balance' field when a 'renderWallet' view function is created
  const walletEntity: Wallet = {
    pubkey_p2pk: p2pk,
    mints,
    relays: [Conf.relay],
    balance: 0, // Newly created wallet, balance is zero.
  };

  return c.json(walletEntity, 200);
});

/**
 * Swaps all nutzaps (NIP-61) to the user's wallet (NIP-60)
 */
app.post('/swap', async (c) => {
  const signer = c.get('signer')!;
  const store = c.get('store');
  const pubkey = await signer.getPublicKey();
  const { signal } = c.req.raw;

  const nip44 = signer.nip44;
  if (!nip44) {
    return c.json({ error: 'Signer does not have nip 44.' }, 400);
  }

  const [wallet] = await store.query([{ authors: [pubkey], kinds: [17375] }], { signal });
  if (!wallet) {
    return c.json({ error: 'You need to have a wallet to swap the nutzaps into it.' }, 400);
  }

  let decryptedContent: string;
  try {
    decryptedContent = await nip44.decrypt(pubkey, wallet.content);
  } catch (e) {
    logi({ level: 'error', ns: 'ditto.api.cashu.wallet.swap', id: wallet.id, kind: wallet.kind, error: errorJson(e) });
    return c.json({ error: 'Could not decrypt wallet content.' }, 400);
  }

  let contentTags: string[][];
  try {
    contentTags = JSON.parse(decryptedContent);
  } catch {
    return c.json({ error: 'Could not JSON parse the decrypted wallet content.' }, 400);
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

  const [nutzapHistory] = await store.query([{ kinds: [7376], authors: [pubkey] }], { signal });
  if (nutzapHistory) {
    nutzapsFilter.since = nutzapHistory.created_at;
  }

  const mintsToProofs: { [key: string]: { proofs: Proof[]; redeemed: string[][] } } = {};

  const nutzaps = await store.query([nutzapsFilter], { signal });

  for (const event of nutzaps) {
    try {
      const mint = event.tags.find(([name]) => name === 'u')?.[1];
      if (!mint) {
        continue;
      }

      const proof = event.tags.find(([name]) => name === 'proof')?.[1];
      if (!proof) {
        continue;
      }

      if (!mintsToProofs[mint]) {
        mintsToProofs[mint] = { proofs: [], redeemed: [] };
      }

      mintsToProofs[mint].proofs = [...mintsToProofs[mint].proofs, ...JSON.parse(proof)];
      mintsToProofs[mint].redeemed = [
        ...mintsToProofs[mint].redeemed,
        [
          'e', // nutzap event that has been redeemed
          event.id,
          Conf.relay,
          'redeemed',
        ],
        ['p', event.pubkey], // pubkey of the author of the 9321 event (nutzap sender)
      ];
    } catch (e: any) {
      logi({ level: 'error', ns: 'ditto.api.cashu.wallet.swap', error: e });
    }
  }

  // TODO: throw error if mintsToProofs is an empty object?
  for (const mint of Object.keys(mintsToProofs)) {
    try {
      const token = getEncodedToken({ mint, proofs: mintsToProofs[mint].proofs });

      const cashuWallet = new CashuWallet(new CashuMint(mint));
      const receiveProofs = await cashuWallet.receive(token, { privkey });

      const unspentProofs = await createEvent({
        kind: 7375,
        content: await nip44.encrypt(
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
        content: await nip44.encrypt(
          pubkey,
          JSON.stringify([
            ['direction', 'in'],
            ['amount', amount],
            ['e', unspentProofs.id, Conf.relay, 'created'],
          ]),
        ),
        tags: mintsToProofs[mint].redeemed,
      }, c);
    } catch (e: any) {
      logi({ level: 'error', ns: 'ditto.api.cashu.wallet.swap', error: e });
    }
  }

  return c.json(201);
});

export default app;

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
import { requireSigner } from '@/middleware/requireSigner.ts';
import { storeMiddleware } from '@/middleware/storeMiddleware.ts';

const app = new Hono();

// CASHU_MINTS = ['https://mint.cashu.io/1', 'https://mint.cashu.io/2', 'https://mint.cashu.io/3']

// Mint: https://github.com/cashubtc/nuts/blob/main/06.md

// src/controllers/api/cashu.ts

// app.get('/mints') -> Mint[]

// app.get(swapMiddleware, '/wallet') -> Wallet, 404
// app.put('/wallet') -> Wallet
// app.delete('/wallet') -> 204

// app.post('/swap') Maybe make this a middleware? Also pipeline interaction.

// app.post(swapMiddleware, '/nutzap');

/* GET /api/v1/ditto/cashu/wallet -> Wallet, 404 */
/* PUT /api/v1/ditto/cashu/wallet -> Wallet */
/* DELETE /api/v1/ditto/cashu/wallet -> 204 */

interface Wallet {
  pubkey: string;
  mints: string[];
  relays: string[];
  balance: number;
}

interface NutZap {
  // ???
}

const createCashuWalletSchema = z.object({
  mints: z.array(z.string().url()).nonempty(), // must contain at least one item
});

/**
 * Creates a replaceable Cashu wallet.
 * https://github.com/nostr-protocol/nips/blob/master/60.md
 */
app.post('/wallet', storeMiddleware, signerMiddleware, requireSigner, async (c) => {
  const signer = c.get('signer');
  const store = c.get('store');
  const pubkey = await signer.getPublicKey();
  const body = await parseBody(c.req.raw);
  const { signal } = c.req.raw;
  const result = createCashuWalletSchema.safeParse(body);

  if (!result.success) {
    return c.json({ error: 'Bad schema', schema: result.error }, 400);
  }

  const nip44 = signer.nip44;
  if (!nip44) {
    return c.json({ error: 'Signer does not have nip 44' }, 400);
  }

  const [event] = await store.query([{ authors: [pubkey], kinds: [17375] }], { signal });
  if (event) {
    return c.json({ error: 'You already have a wallet 😏' }, 400);
  }

  const contentTags: string[][] = [];

  const sk = generateSecretKey();
  const privkey = bytesToString('hex', sk);

  contentTags.push(['privkey', privkey]);

  const { mints } = result.data;

  for (const mint of new Set(mints)) {
    contentTags.push(['mint', mint]);
  }

  const encryptedContentTags = await nip44.encrypt(pubkey, JSON.stringify(contentTags));

  // Wallet
  await createEvent({
    kind: 17375,
    content: encryptedContentTags,
  }, c);

  return c.json(wallet);
});

const createNutzapInformationSchema = z.object({
  mints: z.array(z.string().url()).nonempty(), // must contain at least one item
});

/**
 * Creates a replaceable Nutzap information for a specific wallet.
 * https://github.com/nostr-protocol/nips/blob/master/61.md#nutzap-informational-event
 */
// TODO: Remove this, combine logic with `app.post('/wallet')`
app.post('/wallet/info', async (c) => {
  const signer = c.get('signer')!;
  const store = c.get('store');
  const pubkey = await signer.getPublicKey();
  const body = await parseBody(c.req.raw);
  const { signal } = c.req.raw;
  const result = createNutzapInformationSchema.safeParse(body);

  if (!result.success) {
    return c.json({ error: 'Bad schema', schema: result.error }, 400);
  }

  const nip44 = signer.nip44;
  if (!nip44) {
    return c.json({ error: 'Signer does not have nip 44' }, 400);
  }

  const { relays, mints } = result.data; // TODO: MAYBE get those mints and replace the mints specified in wallet, so 'nutzap information event' and the wallet always have the same mints

  const [event] = await store.query([{ authors: [pubkey], kinds: [17375] }], { signal });
  if (!event) {
    return c.json({ error: 'You need to have a wallet to create a nutzap information event.' }, 400);
  }

  relays.push(Conf.relay);

  const tags: string[][] = [];

  for (const mint of new Set(mints)) {
    tags.push(['mint', mint, 'sat']);
  }

  for (const relay of new Set(relays)) {
    tags.push(['relay', relay]);
  }

  let decryptedContent: string;
  try {
    decryptedContent = await nip44.decrypt(pubkey, event.content);
  } catch (e) {
    logi({ level: 'error', ns: 'ditto.api.cashu.wallet.swap', id: event.id, kind: event.kind, error: errorJson(e) });
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

  tags.push(['pubkey', p2pk]);

  // Nutzap information
  await createEvent({
    kind: 10019,
    tags,
  }, c);

  return c.json(201);
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

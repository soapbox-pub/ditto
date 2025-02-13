import { Proof } from '@cashu/cashu-ts';
import { Hono } from '@hono/hono';
import { generateSecretKey, getPublicKey } from 'nostr-tools';
import { bytesToString, stringToBytes } from '@scure/base';
import { z } from 'zod';

import { Conf } from '@/config.ts';
import { createEvent, parseBody } from '@/utils/api.ts';
import { requireNip44Signer } from '@/middleware/requireSigner.ts';
import { requireStore } from '@/middleware/storeMiddleware.ts';
import { walletSchema } from '@/schema.ts';
import { swapNutzapsMiddleware } from '@/middleware/swapNutzapsMiddleware.ts';
import { isNostrId } from '@/utils.ts';
import { logi } from '@soapbox/logi';
import { errorJson } from '@/utils/log.ts';

type Wallet = z.infer<typeof walletSchema>;

const app = new Hono().use('*', requireStore);

// app.delete('/wallet') -> 204

// app.post(swapMiddleware, '/nutzap');

/* GET /api/v1/ditto/cashu/wallet -> Wallet, 404 */
/* PUT /api/v1/ditto/cashu/wallet -> Wallet */
/* DELETE /api/v1/ditto/cashu/wallet -> 204 */

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
  const signer = c.var.signer;
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

/** Gets a wallet, if it exists. */
app.get('/wallet', requireNip44Signer, swapNutzapsMiddleware, async (c) => {
  const signer = c.get('signer');
  const store = c.get('store');
  const pubkey = await signer.getPublicKey();
  const { signal } = c.req.raw;

  const [event] = await store.query([{ authors: [pubkey], kinds: [17375] }], { signal });
  if (!event) {
    return c.json({ error: 'Wallet not found' }, 404);
  }

  const decryptedContent: string[][] = JSON.parse(await signer.nip44.decrypt(pubkey, event.content));

  const privkey = decryptedContent.find(([value]) => value === 'privkey')?.[1];
  if (!privkey || !isNostrId(privkey)) {
    return c.json({ error: 'Wallet does not contain privkey or privkey is not a valid nostr id.' }, 422);
  }

  const p2pk = getPublicKey(stringToBytes('hex', privkey));

  let balance = 0;
  const mints: string[] = [];

  const tokens = await store.query([{ authors: [pubkey], kinds: [7375] }], { signal });
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
      logi({ level: 'error', ns: 'ditto.api.cashu.wallet.swap', error: errorJson(e) });
    }
  }

  // TODO: maybe change the 'Wallet' type data structure so each mint is a key and the value are the tokens associated with a given mint
  const walletEntity: Wallet = {
    pubkey_p2pk: p2pk,
    mints,
    relays: [Conf.relay],
    balance,
  };

  return c.json(walletEntity, 200);
});

/** Get mints set by the CASHU_MINTS environment variable. */
app.get('/mints', (c) => {
  // TODO: Return full Mint information: https://github.com/cashubtc/nuts/blob/main/06.md
  const mints = Conf.cashuMints;

  return c.json({ mints }, 200);
});

export default app;

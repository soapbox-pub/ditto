import { CashuMint, CashuWallet, MintQuoteState, Proof } from '@cashu/cashu-ts';
import { confRequiredMw } from '@ditto/api/middleware';
import { Hono } from '@hono/hono';
import { generateSecretKey, getPublicKey } from 'nostr-tools';
import { NostrEvent, NSchema as n } from '@nostrify/nostrify';
import { bytesToString, stringToBytes } from '@scure/base';
import { logi } from '@soapbox/logi';
import { z } from 'zod';

import { createEvent, parseBody } from '@/utils/api.ts';
import { requireNip44Signer } from '@/middleware/requireSigner.ts';
import { requireStore } from '@/middleware/storeMiddleware.ts';
import { swapNutzapsMiddleware } from '@/middleware/swapNutzapsMiddleware.ts';
import { walletSchema } from '@/schema.ts';
import { hydrateEvents } from '@/storages/hydrate.ts';
import { isNostrId, nostrNow } from '@/utils.ts';
import { errorJson } from '@/utils/log.ts';
import { getAmount } from '@/utils/bolt11.ts';
import { DittoEvent } from '@/interfaces/DittoEvent.ts';
import { validateAndParseWallet } from '@/utils/cashu.ts';

type Wallet = z.infer<typeof walletSchema>;

const app = new Hono().use('*', confRequiredMw, requireStore);

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

const createMintQuoteSchema = z.object({
  mint: z.string().url(),
  amount: z.number().int(),
});

/**
 * Creates a new mint quote in a specific mint.
 * https://github.com/cashubtc/nuts/blob/main/04.md#mint-quote
 */
app.post('/quote', requireNip44Signer, async (c) => {
  const signer = c.var.signer;
  const pubkey = await signer.getPublicKey();
  const body = await parseBody(c.req.raw);
  const result = createMintQuoteSchema.safeParse(body);

  if (!result.success) {
    return c.json({ error: 'Bad schema', schema: result.error }, 400);
  }

  const { mint: mintUrl, amount } = result.data;

  try {
    const mint = new CashuMint(mintUrl);
    const wallet = new CashuWallet(mint);
    await wallet.loadMint();

    const mintQuote = await wallet.createMintQuote(amount);

    await createEvent({
      kind: 7374,
      content: await signer.nip44.encrypt(pubkey, mintQuote.quote),
      tags: [
        ['expiration', String(mintQuote.expiry)],
        ['mint', mintUrl],
      ],
    }, c);

    return c.json(mintQuote, 200);
  } catch (e) {
    logi({ level: 'error', ns: 'ditto.api.cashu.quote', error: errorJson(e) });
    return c.json({ error: 'Could not create mint quote' }, 500);
  }
});

/**
 * Checks if the quote has been paid, if it has then mint new tokens.
 * https://github.com/cashubtc/nuts/blob/main/04.md#minting-tokens
 */
app.post('/mint/:quote_id', requireNip44Signer, async (c) => {
  const { conf } = c.var;
  const signer = c.var.signer;
  const { signal } = c.req.raw;
  const store = c.get('store');
  const pubkey = await signer.getPublicKey();
  const quote_id = c.req.param('quote_id');

  const expiredQuoteIds: string[] = [];
  const deleteExpiredQuotes = async (ids: string[]) => {
    await createEvent({
      kind: 5,
      tags: ids.map((id) => ['e', id, conf.relay]),
    }, c);
  };

  const events = await store.query([{ kinds: [7374], authors: [pubkey] }], { signal });
  for (const event of events) {
    const decryptedQuoteId = await signer.nip44.decrypt(pubkey, event.content);
    const mintUrl = event.tags.find(([name]) => name === 'mint')?.[1];
    const expiration = Number(event.tags.find(([name]) => name === 'expiration')?.[1]);
    const now = nostrNow();

    try {
      if (mintUrl && (expiration > now) && (quote_id === decryptedQuoteId)) { // TODO: organize order of operations of deleting expired quote ids
        const mint = new CashuMint(mintUrl);
        const wallet = new CashuWallet(mint);
        await wallet.loadMint();

        const mintQuote = await wallet.checkMintQuote(quote_id);
        const amount = Number(getAmount(mintQuote.request)) / 1000;

        if ((mintQuote.state === MintQuoteState.PAID) && amount) {
          const proofs = await wallet.mintProofs(amount, mintQuote.quote);

          const unspentProofs = await createEvent({
            kind: 7375,
            content: await signer.nip44.encrypt(
              pubkey,
              JSON.stringify({
                mint: mintUrl,
                proofs,
              }),
            ),
          }, c);

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
          }, c);

          expiredQuoteIds.push(event.id);
          await deleteExpiredQuotes(expiredQuoteIds);

          return c.json({ success: 'Minting successful!', state: MintQuoteState.ISSUED }, 200);
        } else {
          await deleteExpiredQuotes(expiredQuoteIds);

          return c.json(mintQuote, 200);
        }
      }
    } catch (e) {
      logi({ level: 'error', ns: 'ditto.api.cashu.mint', error: errorJson(e) });
      return c.json({ error: 'Server error' }, 500);
    }

    expiredQuoteIds.push(event.id);
  }

  await deleteExpiredQuotes(expiredQuoteIds);

  return c.json({ error: 'Quote not found' }, 404);
});

const createWalletSchema = z.object({
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
  const { conf, signer } = c.var;
  const store = c.get('store');
  const pubkey = await signer.getPublicKey();
  const body = await parseBody(c.req.raw);
  const { signal } = c.req.raw;
  const result = createWalletSchema.safeParse(body);

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
  const p2pk = getPublicKey(sk);

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
      ['relay', conf.relay], // TODO: add more relays once things get more stable
      ['pubkey', p2pk],
    ],
  }, c);

  // TODO: hydrate wallet and add a 'balance' field when a 'renderWallet' view function is created
  const walletEntity: Wallet = {
    pubkey_p2pk: p2pk,
    mints,
    relays: [conf.relay],
    balance: 0, // Newly created wallet, balance is zero.
  };

  return c.json(walletEntity, 200);
});

/** Gets a wallet, if it exists. */
app.get('/wallet', requireNip44Signer, swapNutzapsMiddleware, async (c) => {
  const { conf, signer } = c.var;
  const store = c.get('store');
  const pubkey = await signer.getPublicKey();
  const { signal } = c.req.raw;

  const { data, error } = await validateAndParseWallet(store, signer, pubkey, { signal });
  if (error) {
    return c.json({ error: error.message }, 404);
  }

  const { p2pk, mints } = data;

  let balance = 0;

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
      logi({ level: 'error', ns: 'ditto.api.cashu.wallet', error: errorJson(e) });
    }
  }

  // TODO: maybe change the 'Wallet' type data structure so each mint is a key and the value are the tokens associated with a given mint
  const walletEntity: Wallet = {
    pubkey_p2pk: p2pk,
    mints,
    relays: [conf.relay],
    balance,
  };

  return c.json(walletEntity, 200);
});

/** Get mints set by the CASHU_MINTS environment variable. */
app.get('/mints', (c) => {
  const { conf } = c.var;

  // TODO: Return full Mint information: https://github.com/cashubtc/nuts/blob/main/06.md
  const mints = conf.cashuMints;

  return c.json({ mints }, 200);
});

export default app;

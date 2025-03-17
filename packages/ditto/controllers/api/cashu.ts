import { CashuMint, CashuWallet, MintQuoteState, Proof } from '@cashu/cashu-ts';
import { organizeProofs, tokenEventSchema, validateAndParseWallet } from '@ditto/cashu';
import { userMiddleware } from '@ditto/mastoapi/middleware';
import { DittoRoute } from '@ditto/mastoapi/router';
import { generateSecretKey, getPublicKey } from 'nostr-tools';
import { NostrEvent, NSchema as n } from '@nostrify/nostrify';
import { bytesToString } from '@scure/base';
import { logi } from '@soapbox/logi';
import { z } from 'zod';

import { createEvent, parseBody } from '@/utils/api.ts';
import { swapNutzapsMiddleware } from '@/middleware/swapNutzapsMiddleware.ts';
import { walletSchema } from '@/schema.ts';
import { hydrateEvents } from '@/storages/hydrate.ts';
import { nostrNow } from '@/utils.ts';
import { errorJson } from '@/utils/log.ts';
import { getAmount } from '@/utils/bolt11.ts';
import { DittoEvent } from '@/interfaces/DittoEvent.ts';

type Wallet = z.infer<typeof walletSchema>;

const route = new DittoRoute();

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
route.post('/quote', userMiddleware({ enc: 'nip44' }), async (c) => {
  const { user } = c.var;
  const pubkey = await user.signer.getPublicKey();
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
      content: await user.signer.nip44.encrypt(pubkey, mintQuote.quote),
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
route.post('/mint/:quote_id', userMiddleware({ enc: 'nip44' }), async (c) => {
  const { conf, user, relay, signal } = c.var;
  const pubkey = await user.signer.getPublicKey();
  const quote_id = c.req.param('quote_id');

  const expiredQuoteIds: string[] = [];
  const deleteExpiredQuotes = async (ids: string[]) => {
    await createEvent({
      kind: 5,
      tags: ids.map((id) => ['e', id, conf.relay]),
    }, c);
  };

  const events = await relay.query([{ kinds: [7374], authors: [pubkey] }], { signal });
  for (const event of events) {
    const decryptedQuoteId = await user.signer.nip44.decrypt(pubkey, event.content);
    const mintUrl = event.tags.find(([name]) => name === 'mint')?.[1];
    const expiration = Number(event.tags.find(([name]) => name === 'expiration')?.[1]);
    const now = nostrNow();

    try {
      if (mintUrl && (quote_id === decryptedQuoteId)) {
        if (expiration <= now) {
          expiredQuoteIds.push(event.id);
          continue;
        }

        const mint = new CashuMint(mintUrl);
        const wallet = new CashuWallet(mint);
        await wallet.loadMint();

        const mintQuote = await wallet.checkMintQuote(quote_id);
        const amount = Number(getAmount(mintQuote.request)) / 1000;

        if ((mintQuote.state === MintQuoteState.PAID) && amount) {
          const proofs = await wallet.mintProofs(amount, mintQuote.quote);

          const unspentProofs = await createEvent({
            kind: 7375,
            content: await user.signer.nip44.encrypt(
              pubkey,
              JSON.stringify({
                mint: mintUrl,
                proofs,
              }),
            ),
          }, c);

          await createEvent({
            kind: 7376,
            content: await user.signer.nip44.encrypt(
              pubkey,
              JSON.stringify([
                ['direction', 'in'],
                ['amount', amount],
                ['e', unspentProofs.id, conf.relay, 'created'],
              ]),
            ),
          }, c);

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
route.put('/wallet', userMiddleware({ enc: 'nip44' }), async (c) => {
  const { conf, user, relay, signal } = c.var;

  const pubkey = await user.signer.getPublicKey();
  const body = await parseBody(c.req.raw);
  const result = createWalletSchema.safeParse(body);

  if (!result.success) {
    return c.json({ error: 'Bad schema', schema: result.error }, 400);
  }

  const { mints } = result.data;

  const [event] = await relay.query([{ authors: [pubkey], kinds: [17375] }], { signal });
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

  const encryptedWalletContentTags = await user.signer.nip44.encrypt(pubkey, JSON.stringify(walletContentTags));

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
route.get('/wallet', userMiddleware({ enc: 'nip44' }), swapNutzapsMiddleware, async (c) => {
  const { conf, relay, user, signal, requestId } = c.var;

  const pubkey = await user.signer.getPublicKey();

  const { data, error } = await validateAndParseWallet(relay, user.signer, pubkey, { signal });
  if (error) {
    return c.json({ error: error.message }, 404);
  }

  const { p2pk, mints } = data;

  let balance = 0;

  const tokens = await relay.query([{ authors: [pubkey], kinds: [7375] }], { signal });
  for (const token of tokens) {
    try {
      const decryptedContent: { mint: string; proofs: Proof[] } = JSON.parse(
        await user.signer.nip44.decrypt(pubkey, token.content),
      );

      if (!mints.includes(decryptedContent.mint)) {
        mints.push(decryptedContent.mint);
      }

      balance += decryptedContent.proofs.reduce((accumulator, current) => {
        return accumulator + current.amount;
      }, 0);
    } catch (e) {
      logi({ level: 'error', ns: 'ditto.api.cashu.wallet', requestId, error: errorJson(e) });
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
route.get('/mints', (c) => {
  const { conf } = c.var;

  // TODO: Return full Mint information: https://github.com/cashubtc/nuts/blob/main/06.md
  const mints = conf.cashuMints;

  return c.json({ mints }, 200);
});

const nutzapSchema = z.object({
  account_id: n.id(),
  status_id: n.id().optional(),
  amount: z.number().int().positive(),
  comment: z.string().optional(),
});

/** Nutzaps a post or a user. */
route.post('/nutzap', userMiddleware({ enc: 'nip44' }), swapNutzapsMiddleware, async (c) => {
  const { conf, relay, user, signal } = c.var;
  const pubkey = await user.signer.getPublicKey();
  const body = await parseBody(c.req.raw);
  const result = nutzapSchema.safeParse(body);

  if (!result.success) {
    return c.json({ error: 'Bad schema', schema: result.error }, 400);
  }

  const { account_id, status_id, amount, comment } = result.data;

  const filter = status_id ? [{ kinds: [1], ids: [status_id] }] : [{ kinds: [0], authors: [account_id] }];
  const [event] = await relay.query(filter, { signal });

  if (!event) {
    return c.json({ error: status_id ? 'Status not found' : 'Account not found' }, 404);
  }

  if (status_id) {
    await hydrateEvents({ ...c.var, events: [event] });
  }

  if (event.kind === 1 && ((event as DittoEvent)?.author?.pubkey !== account_id)) {
    return c.json({ error: 'Post author does not match author' }, 422);
  }

  const [nutzapInfo] = await relay.query([{ kinds: [10019], authors: [account_id] }], { signal });
  if (!nutzapInfo) {
    return c.json({ error: 'Target user does not have a nutzap information event' }, 404);
  }

  const recipientMints = nutzapInfo.tags.filter(([name]) => name === 'mint').map((tag) => tag[1]).filter(Boolean);
  if (recipientMints.length < 1) {
    return c.json({ error: 'Target user does not have any mints setup' }, 422);
  }

  const p2pk = nutzapInfo.tags.find(([name]) => name === 'pubkey')?.[1];
  if (!p2pk) {
    return c.json({ error: 'Target user does not have a cashu pubkey' }, 422);
  }

  const unspentProofs = await relay.query([{ kinds: [7375], authors: [pubkey] }], { signal });
  const organizedProofs = await organizeProofs(unspentProofs, user.signer);

  const proofsToBeUsed: Proof[] = [];
  const eventsToBeDeleted: NostrEvent[] = [];
  let selectedMint: string | undefined;

  for (const mint of recipientMints) {
    if (organizedProofs[mint]?.totalBalance >= amount) {
      selectedMint = mint;
      let minimumRequiredBalance = 0;

      for (const key of Object.keys(organizedProofs[mint])) {
        if (key === 'totalBalance' || typeof organizedProofs[mint][key] === 'number') {
          continue;
        }

        if (minimumRequiredBalance >= amount) {
          break;
        }

        const event = organizedProofs[mint][key].event;
        const decryptedContent = await user.signer.nip44.decrypt(pubkey, event.content);

        const { data: token, success } = n.json().pipe(tokenEventSchema).safeParse(decryptedContent);

        if (!success) {
          continue; // TODO: maybe abort everything
        }

        const { proofs } = token;

        proofsToBeUsed.push(...proofs);
        eventsToBeDeleted.push(event);
        minimumRequiredBalance += organizedProofs[mint][key].balance;
      }
      break;
    }
  }

  if (!selectedMint) {
    return c.json({ error: 'You do not have mints in common with enough balance' }, 422);
  }

  const mint = new CashuMint(selectedMint);
  const wallet = new CashuWallet(mint);
  await wallet.loadMint();

  const { keep: proofsToKeep, send: proofsToSend } = await wallet.send(amount, proofsToBeUsed, {
    includeFees: true,
    pubkey: p2pk.length === 64 ? '02' + p2pk : p2pk,
  });

  const historyTags: string[][] = [
    ['direction', 'out'],
    ['amount', String(proofsToSend.reduce((accumulator, current) => accumulator + current.amount, 0))],
    ...eventsToBeDeleted.map((e) => ['e', e.id, conf.relay, 'destroyed']),
  ];

  if (proofsToKeep.length) {
    const newUnspentProof = await createEvent({
      kind: 7375,
      content: await user.signer.nip44.encrypt(
        pubkey,
        JSON.stringify({
          mint: selectedMint,
          proofs: proofsToKeep,
          del: eventsToBeDeleted.map((e) => e.id),
        }),
      ),
    }, c);

    historyTags.push(['e', newUnspentProof.id, conf.relay, 'created']);
  }

  await createEvent({
    kind: 7376,
    content: await user.signer.nip44.encrypt(
      pubkey,
      JSON.stringify(historyTags),
    ),
  }, c);

  await createEvent({
    kind: 5,
    tags: eventsToBeDeleted.map((e) => ['e', e.id, conf.relay]),
  }, c);

  const nutzapTags: string[][] = [
    ...proofsToSend.map((proof) => ['proof', JSON.stringify(proof)]),
    ['u', selectedMint],
    ['p', account_id], // recipient of nutzap
  ];
  if (status_id) {
    nutzapTags.push(['e', status_id, conf.relay]);
  }

  // nutzap
  await createEvent({
    kind: 9321,
    content: comment ?? '',
    tags: nutzapTags,
  }, c);

  return c.json({ message: 'Nutzap with success!!!' }, 200); // TODO: return wallet entity
});

export default route;

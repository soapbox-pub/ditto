import { CashuMint, CashuWallet, getEncodedToken } from '@cashu/cashu-ts';
import { getLastRedeemedNutzap, getMintsToProofs, validateAndParseWallet } from '@ditto/cashu';
import { HTTPException } from '@hono/hono/http-exception';
import { NostrFilter } from '@nostrify/nostrify';
import { logi } from '@soapbox/logi';

import { errorJson } from '@/utils/log.ts';
import { createEvent } from '@/utils/api.ts';
import { MiddlewareHandler } from '@hono/hono/types';

/**
 * Swap nutzaps into wallet (create new events) if the user has a wallet, otheriwse, just fallthrough.
 * Errors are only thrown if 'signer' and 'store' middlewares are not set.
 */
export const swapNutzapsMiddleware: MiddlewareHandler = async (c, next) => {
  const { conf, relay, user, signal } = c.var;

  if (!user) {
    throw new HTTPException(401, { message: 'No pubkey provided' });
  }

  if (!user.signer.nip44) {
    throw new HTTPException(401, { message: 'No NIP-44 signer provided' });
  }

  if (!relay) {
    throw new HTTPException(401, { message: 'No store provided' });
  }

  const pubkey = await user.signer.getPublicKey();

  const { data, error } = await validateAndParseWallet(relay, user.signer, pubkey, { signal });

  if (error && error.code === 'wallet-not-found') {
    await next();
    return;
  }

  if (error) {
    return c.json({ error: error.message }, 400);
  }

  const { mints, privkey } = data;

  const nutzapsFilter: NostrFilter = { kinds: [9321], '#p': [pubkey], '#u': mints };

  const lastRedeemedNutzap = await getLastRedeemedNutzap(relay, pubkey, { signal });
  if (lastRedeemedNutzap) {
    nutzapsFilter.since = lastRedeemedNutzap.created_at;
  }

  const mintsToProofs = await getMintsToProofs(relay, nutzapsFilter, conf.relay, { signal });

  for (const mint of Object.keys(mintsToProofs)) {
    try {
      const token = getEncodedToken({ mint, proofs: mintsToProofs[mint].proofs });

      const cashuWallet = new CashuWallet(new CashuMint(mint));
      const receiveProofs = await cashuWallet.receive(token, { privkey });

      const unspentProofs = await createEvent({
        kind: 7375,
        content: await user.signer.nip44.encrypt(
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
        content: await user.signer.nip44.encrypt(
          pubkey,
          JSON.stringify([
            ['direction', 'in'],
            ['amount', String(amount)],
            ['e', unspentProofs.id, conf.relay, 'created'],
          ]),
        ),
        tags: mintsToProofs[mint].toBeRedeemed,
      }, c);
    } catch (e) {
      logi({ level: 'error', ns: 'ditto.api.cashu.wallet.swap', error: errorJson(e) });
    }
  }

  await next();
};

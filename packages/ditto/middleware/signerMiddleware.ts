import { type DittoConf } from '@ditto/conf';
import { MiddlewareHandler } from '@hono/hono';
import { HTTPException } from '@hono/hono/http-exception';
import { NostrSigner, NSecSigner } from '@nostrify/nostrify';
import { nip19 } from 'nostr-tools';

import { ConnectSigner } from '@/signers/ConnectSigner.ts';
import { ReadOnlySigner } from '@/signers/ReadOnlySigner.ts';
import { Storages } from '@/storages.ts';
import { aesDecrypt } from '@/utils/aes.ts';
import { getTokenHash } from '@/utils/auth.ts';

/** We only accept "Bearer" type. */
const BEARER_REGEX = new RegExp(`^Bearer (${nip19.BECH32_REGEX.source})$`);

/** Make a `signer` object available to all controllers, or unset if the user isn't logged in. */
export const signerMiddleware: MiddlewareHandler<{ Variables: { signer: NostrSigner; conf: DittoConf } }> = async (
  c,
  next,
) => {
  const { conf } = c.var;
  const header = c.req.header('authorization');
  const match = header?.match(BEARER_REGEX);

  if (match) {
    const [_, bech32] = match;

    if (bech32.startsWith('token1')) {
      try {
        const kysely = await Storages.kysely();
        const tokenHash = await getTokenHash(bech32 as `token1${string}`);

        const { pubkey: userPubkey, bunker_pubkey: bunkerPubkey, nip46_sk_enc, nip46_relays } = await kysely
          .selectFrom('auth_tokens')
          .select(['pubkey', 'bunker_pubkey', 'nip46_sk_enc', 'nip46_relays'])
          .where('token_hash', '=', tokenHash)
          .executeTakeFirstOrThrow();

        const nep46Seckey = await aesDecrypt(conf.seckey, nip46_sk_enc);

        c.set(
          'signer',
          new ConnectSigner({
            bunkerPubkey,
            userPubkey,
            signer: new NSecSigner(nep46Seckey),
            relays: nip46_relays,
          }),
        );
      } catch {
        throw new HTTPException(401);
      }
    } else {
      try {
        const decoded = nip19.decode(bech32!);

        switch (decoded.type) {
          case 'npub':
            c.set('signer', new ReadOnlySigner(decoded.data));
            break;
          case 'nprofile':
            c.set('signer', new ReadOnlySigner(decoded.data.pubkey));
            break;
          case 'nsec':
            c.set('signer', new NSecSigner(decoded.data));
            break;
        }
      } catch {
        throw new HTTPException(401);
      }
    }
  }

  await next();
};

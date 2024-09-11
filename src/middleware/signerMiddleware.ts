import { HTTPException } from '@hono/hono/http-exception';
import { NSecSigner } from '@nostrify/nostrify';
import { nip19 } from 'nostr-tools';

import { AppMiddleware } from '@/app.ts';
import { ConnectSigner } from '@/signers/ConnectSigner.ts';
import { ReadOnlySigner } from '@/signers/ReadOnlySigner.ts';
import { DittoDB } from '@/db/DittoDB.ts';

/** We only accept "Bearer" type. */
const BEARER_REGEX = new RegExp(`^Bearer (${nip19.BECH32_REGEX.source})$`);

/** Make a `signer` object available to all controllers, or unset if the user isn't logged in. */
export const signerMiddleware: AppMiddleware = async (c, next) => {
  const header = c.req.header('authorization');
  const match = header?.match(BEARER_REGEX);

  if (match) {
    const [_, bech32] = match;

    if (bech32.startsWith('token1')) {
      try {
        const kysely = await DittoDB.getInstance();

        const { user_pubkey, server_seckey, relays } = await kysely
          .selectFrom('nip46_tokens')
          .select(['user_pubkey', 'server_seckey', 'relays'])
          .where('api_token', '=', bech32)
          .executeTakeFirstOrThrow();

        c.set('signer', new ConnectSigner(user_pubkey, new NSecSigner(server_seckey), JSON.parse(relays)));
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

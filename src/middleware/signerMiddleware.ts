import { NSecSigner } from '@nostrify/nostrify';
import { nip19 } from 'nostr-tools';

import { AppMiddleware } from '@/app.ts';
import { ConnectSigner } from '@/signers/ConnectSigner.ts';

/** We only accept "Bearer" type. */
const BEARER_REGEX = new RegExp(`^Bearer (${nip19.BECH32_REGEX.source})$`);

/** Make a `signer` object available to all controllers, or unset if the user isn't logged in. */
export const signerMiddleware: AppMiddleware = async (c, next) => {
  const header = c.req.header('authorization');
  const match = header?.match(BEARER_REGEX);

  if (match) {
    const [_, bech32] = match;

    try {
      const decoded = nip19.decode(bech32!);

      switch (decoded.type) {
        case 'npub':
          c.set('signer', new ConnectSigner(decoded.data));
          break;
        case 'nprofile':
          c.set('signer', new ConnectSigner(decoded.data.pubkey, decoded.data.relays));
          break;
        case 'nsec':
          c.set('signer', new NSecSigner(decoded.data));
          break;
      }
    } catch {
      // the user is not logged in
    }
  }

  await next();
};

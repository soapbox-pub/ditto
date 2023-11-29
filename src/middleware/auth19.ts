import { type AppMiddleware } from '@/app.ts';
import { getPublicKey, HTTPException, nip19 } from '@/deps.ts';

/** We only accept "Bearer" type. */
const BEARER_REGEX = new RegExp(`^Bearer (${nip19.BECH32_REGEX.source})$`);

/** NIP-19 auth middleware. */
const auth19: AppMiddleware = async (c, next) => {
  const authHeader = c.req.header('authorization');
  const match = authHeader?.match(BEARER_REGEX);

  if (match) {
    const [_, bech32] = match;

    try {
      const decoded = nip19.decode(bech32!);

      switch (decoded.type) {
        case 'npub':
          c.set('pubkey', decoded.data);
          break;
        case 'nprofile':
          c.set('pubkey', decoded.data.pubkey);
          break;
        case 'nsec':
          c.set('pubkey', getPublicKey(decoded.data));
          c.set('seckey', decoded.data);
          break;
      }
    } catch (_e) {
      //
    }
  }

  await next();
};

/** Throw a 401 if the pubkey isn't set. */
const requirePubkey: AppMiddleware = async (c, next) => {
  if (!c.get('pubkey')) {
    throw new HTTPException(401, { message: 'No pubkey provided' });
  }

  await next();
};

export { auth19, requirePubkey };

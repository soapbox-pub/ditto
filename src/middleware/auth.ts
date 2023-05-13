import { AppMiddleware } from '@/app.ts';
import { getPublicKey, HTTPException, nip19 } from '@/deps.ts';

/** NIP-19 auth middleware. */
const setAuth: AppMiddleware = async (c, next) => {
  const authHeader = c.req.headers.get('authorization');

  if (authHeader?.startsWith('Bearer ')) {
    const bech32 = authHeader.replace(/^Bearer /, '');

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
const requireAuth: AppMiddleware = async (c, next) => {
  if (!c.get('pubkey')) {
    throw new HTTPException(401);
  }

  await next();
};

export { requireAuth, setAuth };

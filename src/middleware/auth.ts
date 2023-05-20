import { AppMiddleware } from '@/app.ts';
import { getPublicKey, HTTPException, nip19 } from '@/deps.ts';

/** The token includes a Bech32 Nostr ID (npub, nsec, etc) and an optional session ID. */
const TOKEN_REGEX = new RegExp(`(${nip19.BECH32_REGEX.source})(?:_(\\w+))?`);
/** We only accept "Bearer" type. */
const BEARER_REGEX = new RegExp(`^Bearer (${TOKEN_REGEX.source})$`);

/** NIP-19 auth middleware. */
const setAuth: AppMiddleware = async (c, next) => {
  const authHeader = c.req.headers.get('authorization');
  const match = authHeader?.match(BEARER_REGEX);

  if (match) {
    const [_, _token, bech32, _sessionId] = match;

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

export { requireAuth, setAuth, TOKEN_REGEX };

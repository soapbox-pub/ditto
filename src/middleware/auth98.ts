import { type AppMiddleware } from '@/app.ts';
import { HTTPException } from '@/deps.ts';
import { parseAuthRequest, type ParseAuthRequestOpts } from '@/utils/nip98.ts';
import { localRequest } from '@/utils/web.ts';

/**
 * NIP-98 auth.
 * https://github.com/nostr-protocol/nips/blob/master/98.md
 */
function auth98(opts: ParseAuthRequestOpts = {}): AppMiddleware {
  return async (c, next) => {
    const req = localRequest(c);
    const result = await parseAuthRequest(req, opts);

    if (result.success) {
      c.set('pubkey', result.data.pubkey);
      c.set('proof', result.data);
    }

    await next();
  };
}

const requireProof: AppMiddleware = async (c, next) => {
  const pubkey = c.get('pubkey');
  const proof = c.get('proof');

  // if (!proof && hasWebsocket(c.req)) {
  //   // TODO: attempt to sign nip98 event through websocket
  // }

  if (!pubkey || !proof || proof.pubkey !== pubkey) {
    throw new HTTPException(401);
  }

  await next();
};

export { auth98, requireProof };

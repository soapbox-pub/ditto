import { type AppMiddleware } from '@/app.ts';
import { HTTPException } from '@/deps.ts';
import { buildAuthEventTemplate, parseAuthRequest, type ParseAuthRequestOpts } from '@/utils/nip98.ts';
import { localRequest } from '@/utils/web.ts';
import { signNostrConnect } from '@/sign.ts';

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
  const header = c.req.headers.get('x-nostr-sign');
  const pubkey = c.get('pubkey');
  const proof = c.get('proof') || header ? await obtainProof() : undefined;

  /** Get the proof over Nostr Connect. */
  async function obtainProof() {
    const req = localRequest(c);
    const event = await buildAuthEventTemplate(req);
    return signNostrConnect(event, c);
  }

  if (!pubkey || !proof || proof.pubkey !== pubkey) {
    throw new HTTPException(401);
  }

  await next();
};

export { auth98, requireProof };

import { type AppContext, type AppMiddleware } from '@/app.ts';
import { HTTPException } from '@/deps.ts';
import { buildAuthEventTemplate, parseAuthRequest, type ParseAuthRequestOpts } from '@/utils/nip98.ts';
import { localRequest } from '@/utils/web.ts';
import { signNostrConnect } from '@/sign.ts';
import { findUser } from '@/db/users.ts';

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

/** Require the user to prove they're an admin before invoking the controller. */
const requireAdmin: AppMiddleware = async (c, next) => {
  const header = c.req.headers.get('x-nostr-sign');
  const proof = c.get('proof') || header ? await obtainProof(c) : undefined;
  const user = proof ? await findUser({ pubkey: proof.pubkey }) : undefined;

  if (proof && user?.admin) {
    c.set('pubkey', proof.pubkey);
    c.set('proof', proof);
    await next();
  } else {
    throw new HTTPException(401);
  }
};

/** Get the proof over Nostr Connect. */
async function obtainProof(c: AppContext) {
  const req = localRequest(c);
  const event = await buildAuthEventTemplate(req);
  return signNostrConnect(event, c);
}

export { auth98, requireAdmin };

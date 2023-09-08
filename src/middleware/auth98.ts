import { type AppContext, type AppMiddleware } from '@/app.ts';
import { HTTPException } from '@/deps.ts';
import {
  buildAuthEventTemplate,
  parseAuthRequest,
  type ParseAuthRequestOpts,
  validateAuthEvent,
} from '@/utils/nip98.ts';
import { localRequest } from '@/utils/web.ts';
import { signNostrConnect } from '@/sign.ts';
import { findUser, User } from '@/db/users.ts';

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

type UserRole = 'user' | 'admin';

/** Require the user to prove their role before invoking the controller. */
function requireRole(role: UserRole, opts?: ParseAuthRequestOpts): AppMiddleware {
  return async (c, next) => {
    const header = c.req.headers.get('x-nostr-sign');
    const proof = c.get('proof') || header ? await obtainProof(c, opts) : undefined;
    const user = proof ? await findUser({ pubkey: proof.pubkey }) : undefined;

    if (proof && user && matchesRole(user, role)) {
      c.set('pubkey', proof.pubkey);
      c.set('proof', proof);
      await next();
    } else {
      throw new HTTPException(401);
    }
  };
}

/** Check whether the user fulfills the role. */
function matchesRole(user: User, role: UserRole): boolean {
  switch (role) {
    case 'user':
      return true;
    case 'admin':
      return user.admin;
    default:
      return false;
  }
}

/** Get the proof over Nostr Connect. */
async function obtainProof(c: AppContext, opts?: ParseAuthRequestOpts) {
  const req = localRequest(c);
  const reqEvent = await buildAuthEventTemplate(req, opts);
  const resEvent = await signNostrConnect(reqEvent, c);
  const result = await validateAuthEvent(req, resEvent, opts);

  if (result.success) {
    return result.data;
  }
}

export { auth98, requireRole };

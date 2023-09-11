import { type AppContext, type AppMiddleware } from '@/app.ts';
import { type Event, HTTPException } from '@/deps.ts';
import {
  buildAuthEventTemplate,
  parseAuthRequest,
  type ParseAuthRequestOpts,
  validateAuthEvent,
} from '@/utils/nip98.ts';
import { localRequest } from '@/utils/web.ts';
import { signEvent } from '@/sign.ts';
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
  return withProof(async (_c, proof, next) => {
    const user = await findUser({ pubkey: proof.pubkey });

    if (user && matchesRole(user, role)) {
      await next();
    } else {
      throw new HTTPException(401);
    }
  }, opts);
}

/** Require the user to demonstrate they own the pubkey by signing an event. */
function requireProof(opts?: ParseAuthRequestOpts): AppMiddleware {
  return withProof(async (_c, _proof, next) => {
    await next();
  }, opts);
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

/** HOC to obtain proof in middleware. */
function withProof(
  handler: (c: AppContext, proof: Event<27235>, next: () => Promise<void>) => Promise<void>,
  opts?: ParseAuthRequestOpts,
): AppMiddleware {
  return async (c, next) => {
    const pubkey = c.get('pubkey');
    const proof = c.get('proof') || await obtainProof(c, opts);

    // Prevent people from accidentally using the wrong account. This has no other security implications.
    if (proof && pubkey && pubkey !== proof.pubkey) {
      throw new HTTPException(401, { message: 'Pubkey mismatch' });
    }

    if (proof) {
      c.set('pubkey', proof.pubkey);
      c.set('proof', proof);
      await handler(c, proof, next);
    } else {
      throw new HTTPException(401, { message: 'No proof' });
    }
  };
}

/** Get the proof over Nostr Connect. */
async function obtainProof(c: AppContext, opts?: ParseAuthRequestOpts) {
  const req = localRequest(c);
  const reqEvent = await buildAuthEventTemplate(req, opts);
  const resEvent = await signEvent(reqEvent, c);
  const result = await validateAuthEvent(req, resEvent, opts);

  if (result.success) {
    return result.data;
  }
}

export { auth98, requireProof, requireRole };

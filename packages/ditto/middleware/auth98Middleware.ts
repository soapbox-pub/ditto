import { HTTPException } from '@hono/hono/http-exception';
import { NostrEvent } from '@nostrify/nostrify';

import { type AppContext, type AppMiddleware } from '@/app.ts';
import { ReadOnlySigner } from '@/signers/ReadOnlySigner.ts';
import { Storages } from '@/storages.ts';
import { localRequest } from '@/utils/api.ts';
import {
  buildAuthEventTemplate,
  parseAuthRequest,
  type ParseAuthRequestOpts,
  validateAuthEvent,
} from '@/utils/nip98.ts';

/**
 * NIP-98 auth.
 * https://github.com/nostr-protocol/nips/blob/master/98.md
 */
function auth98Middleware(opts: ParseAuthRequestOpts = {}): AppMiddleware {
  return async (c, next) => {
    const req = localRequest(c);
    const result = await parseAuthRequest(req, opts);

    if (result.success) {
      const user = {
        relay: c.var.relay,
        signer: new ReadOnlySigner(result.data.pubkey),
        ...c.var.user,
      };

      c.set('user', user);
    }

    await next();
  };
}

type UserRole = 'user' | 'admin';

/** Require the user to prove their role before invoking the controller. */
function requireRole(role: UserRole, opts?: ParseAuthRequestOpts): AppMiddleware {
  return withProof(async (c, proof, next) => {
    const { conf } = c.var;
    const store = await Storages.db();

    const [user] = await store.query([{
      kinds: [30382],
      authors: [await conf.signer.getPublicKey()],
      '#d': [proof.pubkey],
      limit: 1,
    }]);

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
function matchesRole(user: NostrEvent, role: UserRole): boolean {
  return user.tags.some(([tag, value]) => tag === 'n' && value === role);
}

/** HOC to obtain proof in middleware. */
function withProof(
  handler: (c: AppContext, proof: NostrEvent, next: () => Promise<void>) => Promise<void>,
  opts?: ParseAuthRequestOpts,
): AppMiddleware {
  return async (c, next) => {
    const signer = c.var.user?.signer;
    const pubkey = await signer?.getPublicKey();
    const proof = c.get('proof') || await obtainProof(c, opts);

    // Prevent people from accidentally using the wrong account. This has no other security implications.
    if (proof && pubkey && pubkey !== proof.pubkey) {
      throw new HTTPException(401, { message: 'Pubkey mismatch' });
    }

    if (proof) {
      c.set('proof', proof);

      if (!signer) {
        const user = {
          relay: c.var.relay,
          signer: new ReadOnlySigner(proof.pubkey),
          ...c.var.user,
        };

        c.set('user', user);
      }

      await handler(c, proof, next);
    } else {
      throw new HTTPException(401, { message: 'No proof' });
    }
  };
}

/** Get the proof over Nostr Connect. */
async function obtainProof(c: AppContext, opts?: ParseAuthRequestOpts) {
  const signer = c.var.user?.signer;
  if (!signer) {
    throw new HTTPException(401, {
      res: c.json({ error: 'No way to sign Nostr event' }, 401),
    });
  }

  const req = localRequest(c);
  const reqEvent = await buildAuthEventTemplate(req, opts);
  const resEvent = await signer.signEvent(reqEvent);
  const result = await validateAuthEvent(req, resEvent, opts);

  if (result.success) {
    return result.data;
  }
}

export { auth98Middleware, requireProof, requireRole };

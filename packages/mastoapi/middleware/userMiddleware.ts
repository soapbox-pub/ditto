import { buildAuthEventTemplate, validateAuthEvent } from '@ditto/nip98';
import { HTTPException } from '@hono/hono/http-exception';

import type { DittoMiddleware } from '@ditto/mastoapi/router';
import type { NostrEvent, NostrSigner } from '@nostrify/nostrify';
import type { SetRequired } from 'type-fest';
import type { User } from './User.ts';

type Nip44Signer = SetRequired<NostrSigner, 'nip44'>;

interface UserMiddlewareOpts {
  enc?: 'nip04' | 'nip44';
  role?: string;
  verify?: boolean;
  required?: boolean;
}

export function userMiddleware(): DittoMiddleware<{ user: User }>;
// @ts-ignore Types are right.
export function userMiddleware(
  opts: UserMiddlewareOpts & { enc: 'nip44' },
): DittoMiddleware<{ user: User<Nip44Signer> }>;
export function userMiddleware(opts: UserMiddlewareOpts & { required: false }): DittoMiddleware<{ user?: User }>;
export function userMiddleware(opts: UserMiddlewareOpts): DittoMiddleware<{ user: User }>;
export function userMiddleware(opts: UserMiddlewareOpts = {}): DittoMiddleware<{ user: User }> {
  return async (c, next) => {
    const { conf, user, relay } = c.var;
    const { enc, role, verify, required = true } = opts;

    if (!user && required) {
      throw new HTTPException(401, { message: 'Authorization required' });
    }

    if (enc && !user.signer[enc]) {
      throw new HTTPException(400, { message: `User does not have a ${enc} signer` });
    }

    if (role || verify) {
      const req = setRequestUrl(c.req.raw, conf.local(c.req.url));
      const reqEvent = await buildAuthEventTemplate(req);
      const resEvent = await user.signer.signEvent(reqEvent);
      const result = await validateAuthEvent(req, resEvent);

      if (!result.success) {
        throw new HTTPException(401, { message: 'Verification failed' });
      }

      // Prevent people from accidentally using the wrong account. This has no other security implications.
      if (result.data.pubkey !== await user.signer.getPublicKey()) {
        throw new HTTPException(401, { message: 'Pubkey mismatch' });
      }

      if (role) {
        const [user] = await relay.query([{
          kinds: [30382],
          authors: [await conf.signer.getPublicKey()],
          '#d': [result.data.pubkey],
          limit: 1,
        }]);

        if (!user || !matchesRole(user, role)) {
          throw new HTTPException(403, { message: `Must have ${role} role` });
        }
      }
    }

    await next();
  };
}

/** Rewrite the URL of the request object. */
function setRequestUrl(req: Request, url: string): Request {
  return Object.create(req, { url: { value: url } });
}

/** Check whether the user fulfills the role. */
function matchesRole(user: NostrEvent, role: string): boolean {
  return user.tags.some(([tag, value]) => tag === 'n' && value === role);
}

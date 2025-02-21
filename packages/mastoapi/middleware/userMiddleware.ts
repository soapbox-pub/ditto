import { HTTPException } from '@hono/hono/http-exception';

import type { DittoMiddleware } from '@ditto/router';
import type { NostrSigner } from '@nostrify/nostrify';
import type { SetRequired } from 'type-fest';
import type { User } from './User.ts';

type Nip44Signer = SetRequired<NostrSigner, 'nip44'>;

export function userMiddleware(): DittoMiddleware<{ user: User }>;
// @ts-ignore Types are right.
export function userMiddleware(enc: 'nip44'): DittoMiddleware<{ user: User<Nip44Signer> }>;
export function userMiddleware(enc?: 'nip04' | 'nip44'): DittoMiddleware<{ user: User }> {
  return async (c, next) => {
    const { user } = c.var;

    if (!user) {
      throw new HTTPException(403, { message: 'Authorization required.' });
    }

    if (enc && !user.signer[enc]) {
      throw new HTTPException(403, { message: `User does not have a ${enc} signer` });
    }

    await next();
  };
}

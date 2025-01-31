import { MiddlewareHandler } from '@hono/hono';
import { HTTPException } from '@hono/hono/http-exception';
import { NostrSigner } from '@nostrify/nostrify';

/** Throw a 401 if a signer isn't set. */
export const requireSigner: MiddlewareHandler<{ Variables: { signer: NostrSigner } }> = async (c, next) => {
  if (!c.get('signer')) {
    throw new HTTPException(401, { message: 'No pubkey provided' });
  }

  await next();
};
